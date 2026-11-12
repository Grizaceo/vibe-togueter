#!/usr/bin/env node
// Fake teeworlds-rs server for the VM3 tee tests: stands in for the real
// binary the guest agent spawns (VA_TEE_BIN). Serves /healthz and a binary
// WebSocket /ws that sends the pinned welcome + a snapshot every 50 ms and
// appends decoded client traffic to a JSONL log the test asserts against.
// Log path derives from PORT because the agent controls the child env.
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT || 8303);
const MODE = process.env.MODE || "dm";
const LOG = path.join(os.tmpdir(), `va-fake-tee-${PORT}.log`);
const WELCOME = Buffer.from([0, 7, 1, 50, 0, 0, 2, 0]);
// Golden snapshot from test/tee-bridge.mjs (player id 7 at 123,456).
const SNAPSHOT = Buffer.from(
  "01f40301070c6368617440677269735f39360000f6420000e4430000000000000000000080bf00000000ff00000000000000000001031400010000803f0000ac0200",
  "hex",
);

const log = (row) => fs.appendFileSync(LOG, JSON.stringify(row) + "\n");
log({ type: "start", pid: process.pid, port: PORT, mode: MODE, at: Date.now() });

// Exit when the spawning guest agent dies: in a real VM the whole instance
// goes away; here the agent's parent-death must not orphan this listener.
const parent = process.ppid;
setInterval(() => {
  if (process.ppid !== parent) process.exit(0);
}, 500).unref();

// Minimal client-frame reader: tag 0 = join(name), tag 1 = bounded input.
function readVarint(b, o) {
  let n = 0,
    m = 1;
  for (let i = 0; i < 8; i++) {
    const v = b[o.p++];
    n += (v & 127) * m;
    if (!(v & 128)) return n;
    m *= 128;
  }
  return -1;
}
function describeClientMessage(data) {
  const b = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const o = { p: 0 };
  const tag = readVarint(b, o);
  if (tag === 0) {
    const len = readVarint(b, o);
    const name = b.subarray(o.p, o.p + len).toString("utf8");
    return { kind: "join", name, hex: b.toString("hex") };
  }
  if (tag === 1) {
    const seq = readVarint(b, o);
    const dir = b[o.p],
      jump = b[o.p + 1],
      hook = b[o.p + 2],
      fire = b[o.p + 3];
    const weapon = b[o.p + 12];
    return {
      kind: "input",
      seq,
      dir: dir > 127 ? dir - 256 : dir,
      jump,
      hook,
      fire,
      weapon,
      hex: b.toString("hex"),
    };
  }
  return { kind: "unknown", tag, hex: b.toString("hex") };
}

const server = http.createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain" });
    return res.end("ok");
  }
  res.writeHead(404);
  res.end();
});
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 1024 * 1024 });
wss.on("connection", (ws) => {
  ws.binaryType = "nodebuffer";
  ws.send(WELCOME);
  const beat = setInterval(() => {
    if (ws.readyState === 1) ws.send(SNAPSHOT);
  }, 50);
  beat.unref();
  ws.on("message", (data, isBinary) => {
    log({ type: "client", binary: !!isBinary, ...describeClientMessage(data) });
  });
  ws.on("close", () => clearInterval(beat));
});
server.listen(PORT, "127.0.0.1", () => {
  log({ type: "listen", port: PORT });
});
