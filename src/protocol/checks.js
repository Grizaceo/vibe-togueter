// Platform-side checks: seat projection, input schema and the chat effect gate.
import { SEAT_TYPES } from "../seats.js";
export function seatForGame(seat) {
  if (!seat || typeof seat !== "object" || Array.isArray(seat))
    throw Error("Invalid seat.");
  const out = {};
  if (Number.isSafeInteger(seat.id)) out.id = seat.id;
  else if (typeof seat.id === "string" && seat.id.length <= 64)
    out.id = seat.id;
  else throw Error("Invalid seat id.");
  if (!SEAT_TYPES.includes(seat.type)) throw Error("Invalid seat type.");
  out.type = seat.type;
  out.name = typeof seat.name === "string" ? seat.name.slice(0, 64) : "";
  out.role = ["viewer", "streamer"].includes(seat.role) ? seat.role : "viewer";
  if (["twitch", "kick", "web"].includes(seat.platform))
    out.platform = seat.platform;
  if (typeof seat.verified === "boolean") out.verified = seat.verified;
  return out;
}
export function checkInput(manifest, data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const input = manifest.input;
  if (data.kind === "key") {
    if (typeof data.key !== "string" || !input.keys.includes(data.key))
      return null;
    if (typeof data.down !== "boolean") return null;
    return { kind: "key", key: data.key, down: data.down };
  }
  if (data.kind === "pointer") {
    if (!input.pointer) return null;
    if (
      typeof data.x !== "number" ||
      !Number.isFinite(data.x) ||
      typeof data.y !== "number" ||
      !Number.isFinite(data.y) ||
      typeof data.down !== "boolean"
    )
      return null;
    const w = manifest.world?.w ?? 1280,
      h = manifest.world?.h ?? 720;
    return {
      kind: "pointer",
      x: Math.min(w, Math.max(0, data.x)),
      y: Math.min(h, Math.max(0, data.y)),
      down: data.down,
    };
  }
  if (data.kind === "action") {
    const action = input.actions.find((a) => a.name === data.name);
    if (!action) return null;
    const names = Object.keys(action.fields),
      got =
        data.fields && typeof data.fields === "object" && !Array.isArray(data.fields)
          ? Object.keys(data.fields)
          : null;
    if (!got || got.length !== names.length || !names.every((n) => got.includes(n)))
      return null;
    const fields = {};
    for (const n of names) {
      const v = data.fields[n],
        [min, max] = action.fields[n];
      if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
        return null;
      fields[n] = v;
    }
    return { kind: "action", name: data.name, fields };
  }
  return null;
}
export class EffectGate {
  constructor(manifest, { now = Date.now } = {}) {
    this.now = now;
    this.commands = new Map(
      (manifest.chat?.commands || []).map((c) => [c.name, c]),
    );
    this.last = new Map();
    this.global = new Map();
  }
  accept({ cmd, args, actor }) {
    const c = this.commands.get(cmd);
    if (!c || !actor || (typeof actor.key !== "string" && !Number.isSafeInteger(actor.key)))
      return null;
    if (c.who === "broadcaster" && actor.broadcaster !== true) return null;
    if (c.who === "moderator" && actor.moderator !== true && actor.broadcaster !== true)
      return null;
    if (!Array.isArray(args)) return null;
    const tokens = args.map(String),
      parsed = [];
    for (let i = 0; i < c.args.length; i++) {
      const a = c.args[i];
      if (a.int) {
        const t = tokens.shift();
        if (t === undefined || !/^-?\d+$/.test(t)) return null;
        const n = Number(t);
        if (!Number.isSafeInteger(n) || n < a.int[0] || n > a.int[1])
          return null;
        parsed.push(n);
      } else if (a.enum) {
        const t = tokens.shift();
        if (t === undefined || !a.enum.includes(t)) return null;
        parsed.push(t);
      } else if (a.text !== undefined) {
        const rest = tokens.join(" ");
        if (!rest.length || rest.length > a.text) return null;
        parsed.push(rest);
        tokens.length = 0;
      }
    }
    if (tokens.length) return null;
    const at = this.now(),
      key = cmd + "\u0000" + actor.key,
      last = this.last.get(key);
    if (last !== undefined && at - last < c.perActorMs) return null;
    if (c.globalPerSec) {
      const sec = Math.floor(at / 1000),
        g = this.global.get(cmd);
      if (g && g.sec === sec && g.n >= c.globalPerSec) return null;
      this.global.set(cmd, g && g.sec === sec ? { sec, n: g.n + 1 } : { sec, n: 1 });
    }
    this.last.set(key, at);
    if (this.last.size > 10000) {
      for (const [k, t] of this.last) if (at - t > 600000) this.last.delete(k);
      if (this.last.size > 10000) return null;
    }
    return { name: c.name, args: parsed };
  }
}
