// Standalone funnel entrypoint (src/funnel/main.js): the vault secret comes
// from a file, GET / serves the invite page, a FunnelChannel with the right
// secret gets hello-ack, and SIGTERM shuts down with exit code 0.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FunnelChannel } from "../src/vm3/channel.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

test("funnel main serves the invite page, acks the vault hello and exits on SIGTERM", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "va-funnel-main-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const secret = crypto.randomBytes(32).toString("base64url");
  const secretFile = path.join(dir, "funnel.secret");
  fs.writeFileSync(secretFile, secret + "\n", { mode: 0o600 });
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(ROOT, "src/funnel/main.js")], {
    cwd: ROOT,
    env: {
      PATH: process.env.PATH,
      VA_FUNNEL_SECRET_FILE: secretFile,
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => {
    try {
      child.kill("SIGKILL");
    } catch {}
  });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  const deadline = Date.now() + 10000;
  while (!out.includes('"listen"')) {
    if (child.exitCode !== null)
      throw Error("funnel exited before listening: " + out);
    if (Date.now() > deadline) throw Error("funnel did not listen: " + out);
    await sleep(50);
  }
  const res = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Open your invite link/);
  const channel = new FunnelChannel({
    url: `ws://127.0.0.1:${port}`,
    room: "main",
    secret,
  });
  await channel.connect();
  t.after(() => channel.close());
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  assert.equal(await exited, 0);
});
