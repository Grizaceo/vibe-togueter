#!/usr/bin/env node
// Rehearsal driver for the VM3 collective Tee (docs/platform/VM3_REHEARSAL.md).
// Drives the running controller through signed Kick webhooks against the
// deployed funnel and records evidence under docs/evidence/.
//
//   node scripts/rehearse-kick-vm3.mjs --controller http://127.0.0.1:8420
//
// Reads runtime/vm3/funnel.json and runtime/vm3/kick-test-key.pem (written by
// scripts/vm3/funnel-createos.mjs up --kick-test-key). Never prints secrets,
// urls or provider ids; the evidence file carries only check results.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const CONTROLLER = (arg("--controller", "http://127.0.0.1:8420") || "")
  .replace(/\/+$/, "");
const READY_BUDGET_MS = 10 * 60 * 1000;
const POLL_MS = 5000;
const SEND_GAP_MS = 350; // above the 250 ms per-actor command window

const funnelFile = JSON.parse(
  fs.readFileSync(path.join(ROOT, "runtime/vm3/funnel.json"), "utf8"),
);
if (funnelFile.phase !== "up" || !funnelFile.url)
  throw new Error("runtime/vm3/funnel.json is missing or not phase up.");
const privateKey = fs.readFileSync(
  path.join(ROOT, "runtime/vm3/kick-test-key.pem"),
  "utf8",
);
const bundle = JSON.parse(
  fs.readFileSync(path.join(ROOT, "runtime/vm3/tee-bundle.json"), "utf8"),
);

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok: !!ok, ...(detail ? { detail: String(detail).slice(0, 200) } : {}) });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getGames() {
  const res = await fetch(`${CONTROLLER}/community/games`);
  if (!res.ok) return null;
  return res.json();
}
async function teeStatus() {
  const data = await getGames().catch(() => null);
  return data?.teeBridge || null;
}
async function waitFor(pred, budgetMs, what) {
  const deadline = Date.now() + budgetMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await pred();
    if (last) return { value: last, waitedMs: budgetMs - (deadline - Date.now()) };
    await sleep(POLL_MS);
  }
  throw new Error(`timed out waiting for ${what}`);
}

// One signed Kick chat.message.sent delivery, exactly like Kick sends it.
let eventSeq = 0;
async function kickChat({ senderId, username, content, moderator = false }) {
  const id = `rehearsal-${Date.now()}-${++eventSeq}`;
  const timestamp = new Date().toISOString();
  const body = JSON.stringify({
    message_id: `msg-${id}`,
    broadcaster: { user_id: 1 },
    sender: {
      user_id: senderId,
      username,
      identity: { badges: moderator ? [{ type: "moderator" }] : [] },
    },
    content,
    type: "message.sent",
  });
  const signature = crypto
    .sign("RSA-SHA256", Buffer.from(`${id}.${timestamp}.${body}`), privateKey)
    .toString("base64");
  const res = await fetch(`${funnelFile.url}/webhook/kick`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "kick-event-message-id": id,
      "kick-event-message-timestamp": timestamp,
      "kick-event-signature": signature,
      "kick-event-type": "chat.message.sent",
    },
    body,
  });
  return { id, timestamp, body, signature, status: res.status, text: await res.text() };
}

async function sendAndExpectOk(args) {
  const delivery = await kickChat(args);
  if (delivery.status !== 200 || delivery.text === "duplicate")
    throw new Error(`kick delivery ${args.content} -> ${delivery.status} ${delivery.text}`);
  return delivery;
}

const timings = {};
const incarnations = [];
const positions = {};

try {
  // 1. Wait for the VM3 tee to come up through the funnel.
  const readyStart = Date.now();
  const ready = await waitFor(async () => {
    const t = await teeStatus();
    return t?.connected === true && t?.vm3?.phase === "running" ? t : null;
  }, READY_BUDGET_MS, "teeBridge connected + vm3 running");
  timings.readyMs = Date.now() - readyStart;
  incarnations.push(ready.value.vm3.incarnation ?? null);
  check("vm3 tee ready", true, `ready in ${(timings.readyMs / 1000).toFixed(1)}s`);

  const t0 = await teeStatus();
  positions.before = t0?.player?.position?.x ?? null;
  const commandsBefore = t0?.commands ?? 0;

  // Sample positions at ~10 Hz while commands run: the tee can cross a map
  // hazard and respawn at the exact spawn point, so rest-position equality
  // proves nothing — only observed displacement does.
  const posSamples = [];
  const sampler = setInterval(() => {
    teeStatus()
      .then((t) => {
        const p = t?.player?.position;
        if (p && Number.isFinite(p.x)) posSamples.push({ x: p.x, y: p.y });
      })
      .catch(() => {});
  }, 100);

  // 2. Drive movement: six !tee right across two senders, then !tee jump.
  const senders = [
    { senderId: "1001", username: "rehearsal-a" },
    { senderId: "1002", username: "rehearsal-b" },
  ];
  const deliveries = [];
  for (let i = 0; i < 6; i++) {
    const delivery = await sendAndExpectOk({ ...senders[i % 2], content: "!tee right" });
    deliveries.push(delivery);
    await sleep(SEND_GAP_MS);
  }
  deliveries.push(await sendAndExpectOk({ ...senders[0], content: "!tee jump" }));
  await sleep(1500); // let snapshots reflect the movement
  clearInterval(sampler);
  const t1 = await teeStatus();
  positions.after = t1?.player?.position?.x ?? null;
  const xs = posSamples.map((p) => p.x);
  const ys = posSamples.map((p) => p.y);
  positions.xRange = xs.length ? [Math.min(...xs), Math.max(...xs)] : null;
  positions.yRange = ys.length ? [Math.min(...ys), Math.max(...ys)] : null;
  const displaced =
    xs.length > 1 &&
    (Math.max(...xs) - Math.min(...xs) > 8 || Math.max(...ys) - Math.min(...ys) > 8);
  check(
    "chat commands reached the in-VM tee",
    (t1?.commands ?? 0) > commandsBefore,
    `commands ${commandsBefore} -> ${t1?.commands}`,
  );
  check(
    "tee position changed",
    displaced,
    `x ${positions.before} -> ${positions.after}; observed x [${positions.xRange}] y [${positions.yRange}]`,
  );

  // 3. Idempotency and signature enforcement at the funnel.
  const replay = deliveries[deliveries.length - 1];
  const redelivered = await fetch(`${funnelFile.url}/webhook/kick`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "kick-event-message-id": replay.id,
      "kick-event-message-timestamp": replay.timestamp,
      "kick-event-signature": replay.signature,
      "kick-event-type": "chat.message.sent",
    },
    body: replay.body,
  });
  const redeliveredText = await redelivered.text();
  check(
    "redelivery deduped",
    redelivered.status === 200 && redeliveredText === "duplicate",
    `${redelivered.status} ${redeliveredText}`,
  );
  const commandsAfterReplay = (await teeStatus())?.commands ?? 0;
  check(
    "redelivery ran no command",
    commandsAfterReplay === (t1?.commands ?? 0),
    `commands ${t1?.commands} -> ${commandsAfterReplay}`,
  );
  const bad = await kickChat({ senderId: "1003", username: "rehearsal-c", content: "!tee jump" });
  const badRes = await fetch(`${funnelFile.url}/webhook/kick`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "kick-event-message-id": bad.id,
      "kick-event-message-timestamp": bad.timestamp,
      "kick-event-signature": bad.signature.slice(0, -4) + "AAAA",
      "kick-event-type": "chat.message.sent",
    },
    body: bad.body,
  });
  check("bad signature rejected", badRes.status === 403, `status ${badRes.status}`);

  // 4. Moderator !fallback -> clean VM3 reset -> commands work again.
  const beforeFallback = await teeStatus();
  const prevIncarnation = beforeFallback?.vm3?.incarnation ?? incarnations[0];
  const commandsBeforeFallback = beforeFallback?.commands ?? 0;
  await sendAndExpectOk({
    senderId: "2001",
    username: "rehearsal-mod",
    content: "!fallback",
    moderator: true,
  });
  const fbStart = Date.now();
  const afterFallback = await waitFor(async () => {
    const t = await teeStatus();
    return t?.connected === true &&
      t?.vm3?.phase === "running" &&
      (t?.vm3?.incarnation ?? 0) > prevIncarnation
      ? t
      : null;
  }, READY_BUDGET_MS, "vm3 fallback to a new incarnation");
  timings.fallbackMs = Date.now() - fbStart;
  incarnations.push(afterFallback.value.vm3.incarnation);
  check(
    "fallback spawned a new incarnation",
    (afterFallback.value.vm3.incarnation ?? 0) === (prevIncarnation ?? 0) + 1,
    `incarnation ${prevIncarnation} -> ${afterFallback.value.vm3.incarnation} in ${(timings.fallbackMs / 1000).toFixed(1)}s`,
  );
  await sleep(1500);
  const commandsBeforeJump = (await teeStatus())?.commands ?? commandsBeforeFallback;
  await sendAndExpectOk({ senderId: "1001", username: "rehearsal-a", content: "!tee jump" });
  await sleep(1500);
  const t2 = await teeStatus();
  check(
    "commands work on the new incarnation",
    (t2?.commands ?? 0) > commandsBeforeJump,
    `commands ${commandsBeforeJump} -> ${t2?.commands}`,
  );
} catch (error) {
  check("rehearsal completed", false, error?.message || String(error));
}

const failed = checks.filter((c) => !c.ok);
const evidence = {
  at: new Date().toISOString(),
  checks,
  timings,
  incarnations,
  positions,
  bundle: { rev: bundle.rev, sha256: bundle.sha256 },
  node: { rehearsal: process.version, sandbox: funnelFile.node ?? null },
};
const out = path.join(
  ROOT,
  "docs/evidence",
  `kick-vm3-${Date.now()}.json`,
);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(evidence, null, 2) + "\n");
console.log(`evidence -> ${path.relative(ROOT, out)}`);
console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
