// Game protocol v1 message framing and builders. The game side is untrusted:
// every incoming line is parsed strictly before anything reads it.
import { seatForGame } from "./checks.js";
export class ProtocolError extends Error {
  constructor(code, detail = "") {
    super(detail ? code + ": " + detail : code);
    this.code = code;
  }
}
export const PROTOCOL = "va-game/1";
export const MAX_PLATFORM_MESSAGE = 300000,
  MAX_GAME_CONTROL = 16384,
  MAX_GAME_FRAME = 600000;
const plain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const only = (msg, keys) => {
  for (const k of Object.keys(msg))
    if (!keys.includes(k)) throw new ProtocolError("extra-field", k);
};
const checkView = (view) => {
  if (!plain(view)) throw new ProtocolError("bad-view");
  only(view, ["bg", "world", "layers", "hud"]);
  if (view.bg !== undefined && (typeof view.bg !== "string" || view.bg.length > 64))
    throw new ProtocolError("bad-view-bg");
  if (view.layers !== undefined && !Array.isArray(view.layers))
    throw new ProtocolError("bad-view-layers");
  if (view.hud !== undefined && !Array.isArray(view.hud))
    throw new ProtocolError("bad-view-hud");
};
const nonnegInt = (v) => Number.isSafeInteger(v) && v >= 0;
export function parseGameMessage(
  line,
  { manifest = null, seats = new Set(), protocols = [PROTOCOL] } = {},
) {
  if (typeof line !== "string") throw new ProtocolError("not-a-string");
  if (line.length > MAX_GAME_FRAME) throw new ProtocolError("oversized");
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    throw new ProtocolError("bad-json");
  }
  if (!plain(msg) || typeof msg.t !== "string")
    throw new ProtocolError("bad-message");
  const control = () => {
    if (line.length > MAX_GAME_CONTROL) throw new ProtocolError("oversized");
  };
  switch (msg.t) {
    case "ready": {
      only(msg, ["t", "protocol", "manifest", "view", "sdk"]);
      if (!protocols.includes(msg.protocol))
        throw new ProtocolError("protocol-mismatch");
      if (msg.manifest !== null && !plain(msg.manifest))
        throw new ProtocolError("bad-manifest");
      checkView(msg.view);
      if ("sdk" in msg && !plain(msg.sdk))
        throw new ProtocolError("bad-sdk");
      return msg;
    }
    case "frame":
      only(msg, ["t", "view"]);
      checkView(msg.view);
      return msg;
    case "health":
      control();
      only(msg, ["t", "tick", "players"]);
      if (!nonnegInt(msg.tick) || !nonnegInt(msg.players))
        throw new ProtocolError("bad-health");
      return msg;
    case "round": {
      control();
      only(msg, ["t", "phase", "results"]);
      if (manifest?.rounds !== true)
        throw new ProtocolError("round-not-declared");
      if (!["start", "end"].includes(msg.phase))
        throw new ProtocolError("bad-round-phase");
      if (msg.results !== undefined) {
        if (msg.phase !== "end" || !Array.isArray(msg.results))
          throw new ProtocolError("bad-round-results");
        if (msg.results.length > 256)
          throw new ProtocolError("bad-round-results");
        for (const r of msg.results) {
          if (!plain(r)) throw new ProtocolError("bad-round-results");
          only(r, ["seat", "score", "place"]);
          if (!seats.has(r.seat)) throw new ProtocolError("round-foreign-seat");
          if (typeof r.score !== "number" || !Number.isFinite(r.score))
            throw new ProtocolError("bad-round-score");
          if (
            r.place !== undefined &&
            (!Number.isSafeInteger(r.place) || r.place < 1)
          )
            throw new ProtocolError("bad-round-place");
        }
      }
      return msg;
    }
    case "failure": {
      control();
      only(msg, ["t", "code", "message"]);
      if (typeof msg.code !== "string" || msg.code.length > 64)
        throw new ProtocolError("bad-failure-code");
      if (typeof msg.message !== "string")
        throw new ProtocolError("bad-failure-message");
      msg.message = msg.message.slice(0, 500);
      return msg;
    }
    default:
      throw new ProtocolError("unknown-type", msg.t);
  }
}
const need = (ok, what) => {
  if (!ok) throw new ProtocolError("bad-builder-" + what);
};
const text = (v, what, max = 64) => {
  need(typeof v === "string" && v.length <= max, what);
  return v;
};
const bounded = (msg) => {
  if (JSON.stringify(msg).length > MAX_PLATFORM_MESSAGE)
    throw new ProtocolError("platform-message-too-large");
  return msg;
};
export const hello = ({ protocols, room, limits }) =>
  bounded({
    t: "hello",
    protocol: (need(Array.isArray(protocols) && protocols.length > 0 && protocols.every((p) => typeof p === "string"), "protocols"), [...protocols]),
    room: text(room, "room", 128),
    limits: (need(plain(limits), "limits"), { ...limits }),
  });
export const join = (seat) => bounded({ t: "join", seat: seatForGame(seat) });
export const leave = (id, reason) => {
  need(
    ["closed", "replaced", "revoked", "kicked"].includes(reason),
    "leave-reason",
  );
  need(
    Number.isSafeInteger(id) || (typeof id === "string" && id.length <= 64),
    "seat-id",
  );
  return bounded({ t: "leave", seat: { id }, reason });
};
export const input = (id, seq, data) => {
  need(
    Number.isSafeInteger(id) || (typeof id === "string" && id.length <= 64),
    "seat-id",
  );
  need(Number.isSafeInteger(seq) && seq >= 0, "seq");
  need(plain(data), "input-data");
  return bounded({ t: "input", seat: id, seq, data });
};
const actorFor = (actor) => {
  if (actor === null) return null;
  need(plain(actor), "actor");
  const out = { name: text(actor.name, "actor-name", 200) };
  if (actor.platform !== undefined)
    out.platform = text(actor.platform, "actor-platform", 32);
  return out;
};
export const effect = (name, args, actor = null) =>
  bounded({
    t: "effect",
    name: text(name, "effect-name"),
    args: (need(Array.isArray(args), "effect-args"), args),
    actor: actorFor(actor),
  });
export const chat = (actor, cmd, args) =>
  bounded({
    t: "chat",
    actor: actorFor(actor),
    cmd: text(cmd, "chat-cmd", 128),
    args: (need(Array.isArray(args) && args.every((a) => typeof a === "string"), "chat-args"), args),
  });
const reasoned = (t) => (reason) =>
  bounded({ t, reason: text(reason, "reason") });
export const pause = reasoned("pause");
export const resume = reasoned("resume");
export const stop = reasoned("stop");
