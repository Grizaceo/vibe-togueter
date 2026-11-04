// Owner-run check of the public !join link against a real cloudflared quick tunnel.
// It never opens ingress itself: the controller you started does that. This script
// only talks to the local controller (admin API on 127.0.0.1 and a spectator
// socket), plus one probe through the public URL the controller reports.
//
//   terminal 1: VA_TUNNEL=auto VA_PUBLIC_URL=https://<old>.trycloudflare.com npm start
//   terminal 2: node scripts/public-link-check.mjs
//   terminal 3: when told, pkill -f va-cloudflared-
//
// Writes docs/evidence/public-link-real-<timestamp>.json (override with --out).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { readEnv } from "../src/auth/twitch.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf("--" + name);
  return i >= 0 ? args[i + 1] : dflt;
};
const port = Number(opt("port", 8420));
const base = `http://127.0.0.1:${port}`;
const out = opt(
  "out",
  path.join(root, "docs", "evidence", `public-link-real-${Date.now()}.json`),
);
const token = readEnv(path.join(root, ".env")).VA_ADMIN_TOKEN;
if (!token) throw Error("VA_ADMIN_TOKEN missing; run npm run setup:local.");
const auth = { authorization: "Bearer " + token };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (line) => console.log("[link-check] " + line);

const report = { at: new Date().toISOString(), port, steps: [], checks: {} };

async function status() {
  const res = await fetch(base + "/admin/status", { headers: auth });
  if (!res.ok) throw Error("/admin/status -> " + res.status);
  return (await res.json()).publicLink;
}

async function waitFor(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await status();
    if (predicate(last)) return last;
    await sleep(200);
  }
  throw Error(`timed out waiting for ${label}; last ${JSON.stringify(last)}`);
}

// The controller's own nonce, read locally, must equal what the public URL answers.
async function publicProbe(url) {
  const local = await (await fetch(base + "/__va/link-probe")).json();
  try {
    const res = await fetch(url + "/__va/link-probe", {
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    const remote = await res.json();
    return { status: res.status, sameController: remote.vibeArena === local.vibeArena };
  } catch (error) {
    return { error: error.message, sameController: false };
  }
}

// !join from the admin source replies into the room feed; read it as a spectator.
async function join() {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/spectate?frames=none`);
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  const reply = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 5000);
    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (
        msg.t === "feed" &&
        msg.kind === "system" &&
        /game link|Join the game|Join with your own tee/.test(msg.text)
      ) {
        clearTimeout(timer);
        resolve(msg.text);
      }
    });
  });
  const res = await fetch(base + "/admin/chat", {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ user: "owner-check", text: "!join" }),
  });
  const text = res.ok ? await reply : null;
  ws.close();
  return text;
}

async function step(name, link) {
  const entry = { name, at: new Date().toISOString(), publicLink: link };
  if (link.url) entry.probe = await publicProbe(link.url);
  entry.joinReply = await join();
  report.steps.push(entry);
  say(`${name}: state=${link.state} url=${link.url} source=${link.source}`);
  if (entry.probe) say(`  public probe reaches this controller: ${entry.probe.sameController}`);
  say(`  !join -> ${entry.joinReply}`);
  return entry;
}

try {
  say("waiting for a live public link (up to 120 s)...");
  const first = await step(
    "live",
    await waitFor((l) => l?.state === "live", 120000, "live link"),
  );
  say("now kill the tunnel in another terminal:  pkill -f va-cloudflared-");
  const down = await step(
    "after-kill",
    await waitFor((l) => l?.state !== "live", 300000, "link down"),
  );
  say("waiting for the controller to recreate the tunnel (up to 120 s)...");
  const again = await step(
    "recreated",
    await waitFor((l) => l?.state === "live", 120000, "recreated link"),
  );
  const noName = (text) => typeof text === "string" && !/[?&]name=/.test(text);
  report.checks = {
    liveLinkReachesController: first.probe?.sameController === true,
    staleConfiguredUrlNotUsed: first.publicLink.source !== "configured",
    joinReturnsLiveLink:
      noName(first.joinReply) && first.joinReply.includes(first.publicLink.url),
    joinSaysNoLinkWhileDown: /No live game link/.test(down.joinReply || ""),
    tunnelRecreated: again.probe?.sameController === true,
    joinReturnsNewLink:
      noName(again.joinReply) && again.joinReply.includes(again.publicLink.url),
  };
} catch (error) {
  report.error = error.message;
  say("ERROR " + error.message);
}
report.pass =
  !report.error &&
  Object.keys(report.checks).length > 0 &&
  Object.values(report.checks).every(Boolean);
fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
say(`${report.pass ? "PASS" : "FAIL"} -> ${path.relative(root, out)}`);
for (const [name, ok] of Object.entries(report.checks)) say(`  ${ok ? "ok  " : "FAIL"} ${name}`);
process.exit(report.pass ? 0 : 1);
