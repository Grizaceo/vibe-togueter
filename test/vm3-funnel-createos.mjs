// funnel-createos.mjs deploy script: ingress URL discovery and the
// process-start env shape learned from the real CreateOS API in stage 3b.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { funnelUp, ingressUrl } from "../scripts/vm3/funnel-createos.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SB = "sb-" + "f".repeat(24);

test("ingressUrl prefers the get template and substitutes the guest port", () => {
  const get = { ingress_url_template: "https://abc-<port>.app.sb.createos.sh" };
  assert.equal(ingressUrl(get, SB), "https://abc-8080.app.sb.createos.sh");
  assert.equal(ingressUrl(get, SB, 9090), "https://abc-9090.app.sb.createos.sh");
  assert.equal(
    ingressUrl({ ingressUrlTemplate: "https://t.example/" }, SB),
    "https://t.example/",
  );
});

test("ingressUrl falls back to field scan then the sb- pattern", () => {
  assert.equal(
    ingressUrl({ public_url: "https://pub.example.com/" }, SB),
    "https://pub.example.com/",
  );
  assert.equal(ingressUrl({}, SB), `https://${"f".repeat(24)}-8080.app.sb.createos.sh`);
  assert.throws(() => ingressUrl({}, "not-a-sandbox"), /ingress URL/);
});

test("funnelUp starts the funnel via env utility, never --env flags", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "va-fc-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const calls = [];
  const run = async (cmd, args) => {
    calls.push(args.join(" "));
    const sub = args[1];
    if (sub === "create") return { stdout: JSON.stringify({ id: SB }) };
    if (sub === "get")
      return {
        stdout: JSON.stringify({
          id: SB,
          status: "running",
          ingress_url_template: "https://fb-<port>.example.test",
        }),
      };
    if (sub === "exec")
      return { stdout: args.includes("--version") ? "v24.1.0" : "" };
    if (sub === "push") return { stdout: "" };
    if (sub === "process") return { stdout: JSON.stringify({ process_id: "proc_1" }) };
    throw Error("unexpected " + args.join(" "));
  };
  const state = await funnelUp({
    run,
    root: ROOT,
    journalFile: path.join(dir, "funnel.json"),
    diagnosticFile: path.join(dir, "diag.json"),
    kickKeyFile: path.join(dir, "kick-test-key.pem"),
    kickTestKey: true,
    log: () => {},
    sleep: async () => {},
    fetchImpl: async () => ({
      ok: true,
      text: async () => "<html>Open your invite link</html>",
    }),
  });
  assert.equal(state.phase, "up");
  assert.equal(state.url, "https://fb-8080.example.test");
  assert.equal(state.wsUrl, "wss://fb-8080.example.test");
  assert.equal(state.host, "fb-8080.example.test");
  assert.match(fs.readFileSync(path.join(dir, "kick-test-key.pem"), "utf8"), /PRIVATE KEY/);
  const start = calls.find((c) => c.includes("process start"));
  assert.ok(start, "process start was invoked");
  assert.ok(!start.includes("--env"), "CreateOS rejects undeclared --env keys");
  assert.ok(start.includes("-- env PORT=8080"));
  assert.ok(start.includes("VA_FUNNEL_SECRET_FILE=/opt/va/funnel.secret"));
  assert.ok(start.includes("VA_KICK_PUBKEY_FILE=/opt/va/kick.pub"));
  assert.ok(start.includes("--cwd /opt/va"));
  assert.ok(start.trimEnd().endsWith("node src/funnel/main.js"));
});
