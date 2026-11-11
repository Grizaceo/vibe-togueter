// The funnel: the platform's only public door (docs/platform/VM3_RUNTIME.md).
// Browsers connect here — never to VM3. It terminates viewer WebSockets,
// verifies seat tokens with the vault's public key, relays va-game/1 frames,
// and forwards control traffic to the vault over an authenticated channel.
// It holds no signing keys and no viewer-IP-bearing state beyond sockets.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { FunnelRoom } from "./room.js";
import { verifyKickWebhook, KickDeliveries } from "../chat/kick-webhook.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const PUBLIC = path.join(ROOT, "public");
const MAX_BODY = 256 * 1024;
const VAULT_HELLO_MS = 5000;

const send = (ws, obj) => {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
};
const hmac = (secret, room) =>
  crypto.createHmac("sha256", secret).update("vault|" + room).digest("base64url");

export function createFunnel({
  vaultSecret,
  kickPublicKey = null,
  broadcasterUserId = 0,
  now = Date.now,
  log = () => {},
} = {}) {
  if (typeof vaultSecret !== "string" || vaultSecret.length < 16)
    throw Error("funnel requires a vaultSecret (>=16 chars)");
  const rooms = new Map(); // room id -> FunnelRoom
  const deliveries = new KickDeliveries();

  function room(id) {
    let r = rooms.get(id);
    if (!r) {
      r = new FunnelRoom({ id, now, log });
      rooms.set(id, r);
    }
    return r;
  }

  // ---- vault channel ------------------------------------------------------
  const vaultWss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
  vaultWss.on("connection", (ws, req) => {
    // The room does not exist until a valid hello creates it: the vault is
    // the only client allowed to mint rooms, proven by the shared secret.
    let authed = false;
    let r = null;
    const timer = setTimeout(() => ws.close(4001, "hello timeout"), VAULT_HELLO_MS);
    ws.on("message", (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return ws.close(4001, "bad json");
      }
      if (!authed) {
        if (msg.t !== "hello" || typeof msg.room !== "string" || !msg.room || msg.room.length > 128)
          return ws.close(4001, "expected hello");
        r = room(msg.room);
        const expected = Buffer.from(hmac(vaultSecret, r.id));
        const got = Buffer.from(String(msg.auth || ""));
        if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected))
          return ws.close(4003, "bad auth");
        authed = true;
        clearTimeout(timer);
        if (typeof msg.seatKey === "string" && msg.seatKey.length < 200) {
          try {
            r.seatKey = crypto.createPublicKey({
              key: Buffer.from(msg.seatKey, "base64"),
              format: "der",
              type: "spki",
            });
          } catch {}
        }
        r.vaults.add(ws);
        ws.on("close", () => r.vaults.delete(ws));
        send(ws, { t: "hello-ack", room: r.id });
        return;
      }
      handleVaultMessage(r, msg);
    });
    ws.on("close", () => clearTimeout(timer));
  });

  function handleVaultMessage(r, msg) {
    switch (msg.t) {
      case "to-game":
        r.toGame(msg.msg);
        break;
      case "to-viewer":
        r.toViewer(msg.vid, msg.msg);
        break;
      case "viewer-seat":
        // Vault's authoritative redeem result: updates kind and rotates the
        // challenge on failure inside seatResult.
        r.seatResult(msg.vid, msg);
        break;
      case "room":
        r.roomMessage(msg.msg);
        break;
      case "seat-revoke":
        if (typeof msg.sub === "string") r.revokeSeat(msg.sub);
        break;
      case "game-token":
        if (typeof msg.token === "string" && msg.token.length < 200 && Number(msg.exp) > now())
          r.gameTokens.set(msg.token, Number(msg.exp));
        break;
      case "game-token-revoke":
        if (typeof msg.token === "string") r.gameTokens.delete(msg.token);
        break;
      case "ping":
        // Vault keepalive; viewers get their own pong locally.
        for (const ws of r.vaults) send(ws, { t: "pong" });
        break;
      default:
        log("vault-unknown", { t: String(msg.t).slice(0, 40) });
    }
  }

  // ---- game agent channel ---------------------------------------------------
  const gameWss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
  gameWss.on("connection", (ws, req) => {
    const url = new URL(req.url, "http://funnel");
    const id = url.searchParams.get("room");
    const token = url.searchParams.get("token");
    const r = rooms.get(id);
    const exp = r?.gameTokens.get(token);
    if (!r || exp === undefined) return ws.close(4003, "bad game token");
    if (exp <= now()) {
      r.gameTokens.delete(token);
      return ws.close(4003, "expired game token");
    }
    r.gameTokens.delete(token); // single use per incarnation
    r.attachGame(ws, { incarnation: url.searchParams.get("inc") });
    ws.on("message", (data) => {
      if (data.length > 1024 * 1024) return ws.terminate();
      r.gameLine(data.toString());
    });
    ws.on("close", () => r.detachGame(ws));
  });

  // ---- viewer channel --------------------------------------------------------
  const viewerWss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  viewerWss.on("connection", (ws, req) => {
    const url = new URL(req.url, "http://funnel");
    const id = url.searchParams.get("room");
    const r = rooms.get(id);
    if (!r) return ws.close(4004, "unknown room");
    const client = r.addViewer(ws, { frames: url.searchParams.get("frames") });
    ws.on("message", (data) => {
      if (data.length > 64 * 1024) return ws.terminate();
      if (!r.viewerRateOk(client)) return ws.close(4008, "rate limited");
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      r.viewerMessage(client, msg);
    });
    ws.on("close", () => r.removeViewer(client));
  });

  // ---- http -----------------------------------------------------------------
  const STATIC = new Map([
    ["/", ["play.html", "text/html; charset=utf-8"]],
    ["/play.js", [path.join(HERE, "play.js"), "text/javascript; charset=utf-8"]],
    ["/seat.js", [path.join(PUBLIC, "seat.js"), "text/javascript; charset=utf-8"]],
    ["/frame-codec.js", [path.join(PUBLIC, "frame-codec.js"), "text/javascript; charset=utf-8"]],
    ["/render.js", [path.join(PUBLIC, "render.js"), "text/javascript; charset=utf-8"]],
    ["/interpolate.js", [path.join(PUBLIC, "interpolate.js"), "text/javascript; charset=utf-8"]],
    ["/index.css", [path.join(PUBLIC, "index.css"), "text/css; charset=utf-8"]],
    ["/curated", [path.join(PUBLIC, "curated"), "dir"]],
  ]);

  function serveStatic(req, res) {
    const url = new URL(req.url, "http://funnel");
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") {
      const roomId = url.searchParams.get("room");
      if (!roomId) {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return res.end(
          "<!doctype html><title>Vibe Arena</title><p>Open your invite link to play.</p>",
        );
      }
      pathname = "/";
    }
    const entry = STATIC.get(pathname);
    if (!entry) {
      res.writeHead(404);
      return res.end("not found");
    }
    let file = entry[0];
    if (entry[1] === "dir") {
      const rel = pathname.slice("/curated".length);
      file = path.join(PUBLIC, "curated", rel);
      if (!file.startsWith(path.join(PUBLIC, "curated"))) {
        res.writeHead(403);
        return res.end();
      }
    }
    const type =
      entry[1] === "dir" ? "application/octet-stream" : entry[1];
    fs.readFile(file, (error, data) => {
      if (error) {
        res.writeHead(404);
        return res.end("not found");
      }
      res.writeHead(200, { "content-type": type });
      res.end(data);
    });
  }

  async function readBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) throw Error("body too large");
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://funnel");
    try {
      if (req.method === "POST" && url.pathname === "/webhook/kick") {
        const rawBody = await readBody(req);
        const checked = verifyKickWebhook({
          headers: req.headers,
          rawBody,
          publicKey: kickPublicKey,
          now: now(),
        });
        if (!checked.ok) {
          res.writeHead(checked.status || 403);
          return res.end(checked.reason);
        }
        if (!deliveries.first(checked.id)) {
          res.writeHead(200);
          return res.end("duplicate");
        }
        let body;
        try {
          body = JSON.parse(rawBody);
        } catch {
          res.writeHead(400);
          return res.end("bad json");
        }
        // Forward the verified event to every vault link; the vault decides
        // which room/channel it belongs to (chat is platform-scoped).
        const line = JSON.stringify({ t: "kick-event", body });
        for (const r of rooms.values())
          for (const ws of r.vaults) if (ws.readyState === 1) ws.send(line);
        res.writeHead(200);
        return res.end("ok");
      }
      if (req.method === "GET") return serveStatic(req, res);
      res.writeHead(405);
      res.end();
    } catch (error) {
      res.writeHead(error.message === "body too large" ? 413 : 500);
      res.end();
    }
  });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url, "http://funnel");
    const pathName = url.pathname;
    const done = (wss) =>
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    if (pathName === "/ws/platform") return done(vaultWss);
    if (pathName === "/ws/game") return done(gameWss);
    if (pathName === "/ws") return done(viewerWss);
    socket.destroy();
  });

  return {
    server,
    rooms,
    room,
    close() {
      for (const r of rooms.values()) r.close();
      rooms.clear();
      server.close();
    },
  };
}
