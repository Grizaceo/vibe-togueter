// Local seat-pairing rehearsal: the real controller from a disposable copy, the
// real lobby page in headless Chromium, a Kick viewer paired through a signed
// webhook (test RSA key standing in for Kick's), a web guest in a second tab and
// a legacy ?name= client in the same room. No tunnel, Twitch, Kick or cloud.
// Twitch pairing needs a live IRC socket; test/seating.mjs covers it with the
// real IRC parser and chat pipeline.
//   node scripts/rehearse-seats.mjs   -> docs/evidence/seats-local-<ts>.json + 2 screenshots
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import WebSocket from "ws";
import { createCDP } from "./rehearsal/cdp.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "va-seats-"));
const runId = "seats-local-" + Date.now();
const evidence = path.join(root, "docs", "evidence");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const free = () =>
  new Promise((r) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => r(p));
    });
  });
for (const name of ["src", "public", "templates", "package.json", "vibe-arena.config.json"])
  fs.cpSync(path.join(root, name), path.join(temp, name), { recursive: true });
fs.mkdirSync(path.join(temp, "games"));
fs.cpSync(path.join(root, "games", "community-grove"), path.join(temp, "games", "community-grove"), { recursive: true });
fs.symlinkSync(path.join(root, "node_modules"), path.join(temp, "node_modules"), "dir");

const kick = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const port = await free(),
  debugPort = await free(),
  base = "http://127.0.0.1:" + port;
const env = {
  PATH: process.env.PATH,
  HOME: temp,
  LANG: "C.UTF-8",
  VA_TUNNEL: "off",
  VA_KICK_PUBKEY: kick.publicKey.export({ type: "spki", format: "pem" }),
};
const server = spawn(
  process.execPath,
  ["--experimental-vm-modules", "src/server.js", "--host", "127.0.0.1", "--port", String(port), "--game-dir", "games/community-grove"],
  { cwd: temp, env, stdio: "ignore" },
);
let browser, legacy;
const sockets = [];
const checks = [],
  errors = [],
  requests = [];
const check = (name, ok) => {
  checks.push({ name, ok: Boolean(ok) });
  if (!ok) throw Error(name);
};
const wait = async (fn, tries = 100) => {
  for (let n = 0; n < tries; n++) {
    try {
      const result = await fn();
      if (result) return result;
    } catch {}
    await sleep(100);
  }
  throw Error("Readiness deadline");
};
async function kickChat(sender, text) {
  const raw = JSON.stringify({ message_id: crypto.randomUUID(), broadcaster: { user_id: 1 }, sender, content: text });
  const id = crypto.randomUUID(),
    at = new Date().toISOString();
  const res = await fetch(base + "/webhook/kick", {
    method: "POST",
    headers: {
      "kick-event-type": "chat.message.sent",
      "kick-event-message-id": id,
      "kick-event-message-timestamp": at,
      "kick-event-signature": crypto.createSign("RSA-SHA256").update(`${id}.${at}.${raw}`).sign(kick.privateKey, "base64"),
    },
    body: raw,
  });
  return res.status;
}
async function tab() {
  const target = await wait(async () => {
    const r = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" });
    return r.ok ? r.json() : null;
  });
  const cdp = new WebSocket(target.webSocketDebuggerUrl);
  sockets.push(cdp);
  await new Promise((r) => cdp.once("open", r));
  return createCDP(cdp, { base, wait, sleep, evidence, runId, errors, requests });
}
const report = { at: new Date().toISOString(), kind: "automated-local-seat-rehearsal", checks, errors };
try {
  await wait(async () => (await fetch(base + "/community/state")).ok);
  browser = spawn(
    "chromium",
    [
      "--headless",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=" + debugPort,
      "--user-data-dir=" + path.join(temp, "browser-profile"),
      "about:blank",
    ],
    { env, stdio: "ignore" },
  );

  legacy = new WebSocket(base.replace(/^http/, "ws") + "/play?name=legacy-client");
  const legacyWelcome = new Promise((r) => legacy.on("message", (raw) => JSON.parse(raw).t === "welcome" && r(JSON.parse(raw))));
  check("legacy ?name= client joins without a seat and keeps full frames", (await legacyWelcome).frames === "full");

  const a = await tab();
  await a.navigate("/");
  const code = await wait(() =>
    a.evaluate("(document.getElementById('seat-code').textContent.match(/^!join ([0-9A-HJKMNP-TV-Z]{6})$/)||[])[1]||''"),
  );
  check("lobby shows a pairing code over the running game", await a.evaluate("!document.getElementById('seat-gate').hidden"));
  await a.capture(runId + "-gate");
  check("signed Kick webhook with the code is accepted", (await kickChat({ user_id: 987, username: "kick_viewer", identity: { badges: [] } }, `!join ${code}`)) === 200);
  await wait(() => a.evaluate("document.getElementById('me').textContent==='You are kick_viewer · kick'"));
  check("the tab that showed the code plays as the Kick account", await a.evaluate("document.getElementById('seat-gate').hidden"));
  await a.capture(runId + "-kick");
  await a.navigate("/");
  await wait(() => a.evaluate("document.getElementById('me').textContent==='You are kick_viewer · kick'"));
  check("a reload resumes the seat with the tab's own key, no new code", await a.evaluate("document.getElementById('seat-gate').hidden"));

  const b = await tab();
  await b.navigate("/");
  await wait(() => b.evaluate("/^!join /.test(document.getElementById('seat-code').textContent)"));
  await b.evaluate("document.getElementById('seat-guest-name').value='Guest Bob';document.getElementById('seat-guest').requestSubmit()");
  await wait(() => b.evaluate("document.getElementById('me').textContent==='You are Guest Bob · web guest'"));
  check("a second tab plays as an unverified web guest", true);

  const status = await (await fetch(base + "/admin/status")).json();
  const seated = status.seats.filter((s) => s.state === "player").map((s) => s.identity);
  report.roster = status.seats.map((s) => ({ ...s, address: s.address ? "(loopback)" : null }));
  report.players = status.players;
  check(
    "one room: Kick viewer, web guest and legacy client",
    ["kick_viewer", "Guest Bob", "legacy-client"].every((n) => status.players.includes(n)),
  );
  check(
    "Kick seat is verified, bound to the browser key and a viewer",
    seated.some((i) => i.id === "kick:987" && i.verified && i.bound && i.roles.join() === "viewer"),
  );
  check("web guest is unverified", seated.some((i) => i.platform === "web" && !i.verified && i.name === "Guest Bob"));
  check("no browser JavaScript exception occurred", errors.length === 0);
  report.limits = [
    "Disposable checkout; no tunnel, no real Twitch or Kick traffic.",
    "Kick events are signed with a local test RSA key standing in for Kick's key.",
    "Twitch pairing needs a live IRC socket; test/seating.mjs covers it through the real IRC parser and chat pipeline.",
    "Headless Chromium on Linux at the default window size; not a mobile usability claim.",
  ];
  report.pass = true;
  console.log(JSON.stringify({ checks, errors }));
} catch (error) {
  report.pass = false;
  report.error = error.message;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(evidence, runId + ".json"), JSON.stringify(report, null, 2) + "\n");
  legacy?.close();
  for (const s of sockets) s.close();
  browser?.kill("SIGTERM");
  server.kill("SIGTERM");
  await sleep(500);
  fs.rmSync(temp, { recursive: true, force: true });
}
