// Manifest validation for game protocol v1. Unknown keys are rejected at
// every level; the result is normalized and deep-frozen.
import { ProtocolError, PROTOCOL } from "./messages.js";
import { SEAT_TYPES } from "../seats.js";
export { PROTOCOL, SEAT_TYPES };
export const SDK_KEYS = ["up", "down", "left", "right", "space", "w", "a", "s", "d"];
export const DELIVERY = ["A", "B", "C"];
export const PLATFORM_COMMANDS = [
  "join", "unirse", "entrar", "jugar-link", "idea", "vote", "build",
  "predict", "prediction", "fallback", "tee", "delegate", "pause", "resume",
];
const TOP = ["protocol", "id", "name", "description", "world", "tickRate", "seats", "input", "chat", "delivery", "resources", "rounds"];
const bad = (code) => { throw new ProtocolError(code); };
const plain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const onlyKeys = (o, keys) => {
  for (const k of Object.keys(o)) if (!keys.includes(k)) bad("unknown-key:" + k);
};
const nameRe = /^[a-z][a-z0-9-]{0,31}$/,
  fieldRe = /^[a-z][a-zA-Z0-9]{0,31}$/;
const intIn = (v, lo, hi) => Number.isSafeInteger(v) && v >= lo && v <= hi;
const deepFreeze = (v) => {
  if (v && typeof v === "object") {
    for (const x of Object.values(v)) deepFreeze(x);
    Object.freeze(v);
  }
  return v;
};
export function validateManifest(raw, { id, version, meta = null, approvedResources = null } = {}) {
  if (!plain(raw)) bad("not-object");
  if (JSON.stringify(raw).length > 16384) bad("oversized");
  onlyKeys(raw, TOP);
  if (raw.protocol !== PROTOCOL) bad("protocol");
  if (raw.id !== undefined && (typeof raw.id !== "string" || !/^[a-z0-9-]{1,60}$/.test(raw.id) || raw.id !== id)) bad("id");
  const m = { protocol: PROTOCOL, id, version: structuredClone(version) };
  const metaName = meta?.name, metaDesc = meta?.description ?? meta?.desc;
  const fromMeta = (key, metaVal, def) => {
    if (raw[key] === undefined) return metaVal ?? def;
    if (metaVal !== undefined) {
      const same =
        key === "world"
          ? raw.world.w === metaVal.w && raw.world.h === metaVal.h
          : raw[key] === metaVal;
      if (!same) bad("meta-mismatch:" + key);
    }
    return raw[key];
  };
  if (raw.name !== undefined && (typeof raw.name !== "string" || raw.name.length > 200)) bad("name");
  const name = fromMeta("name", metaName);
  if (name !== undefined && (typeof name !== "string" || name.length > 200)) bad("name");
  if (name !== undefined) m.name = name;
  if (raw.description !== undefined && (typeof raw.description !== "string" || raw.description.length > 2000)) bad("description");
  const description = fromMeta("description", metaDesc);
  if (description !== undefined && (typeof description !== "string" || description.length > 2000)) bad("description");
  if (description !== undefined) m.description = description;
  const worldOk = (w) => plain(w) && onlyKeys(w, ["w", "h"]) !== false && Number.isFinite(w.w) && Number.isFinite(w.h) && w.w >= 1 && w.w <= 100000 && w.h >= 1 && w.h <= 100000;
  if (raw.world !== undefined && !worldOk(raw.world)) bad("world");
  const world = fromMeta("world", meta?.world, { w: 1280, h: 720 });
  if (world !== undefined && !worldOk(world)) bad("world");
  if (world !== undefined) m.world = { w: world.w, h: world.h };
  if (raw.tickRate !== undefined && (typeof raw.tickRate !== "number" || !Number.isFinite(raw.tickRate) || raw.tickRate < 1 || raw.tickRate > 60)) bad("tickRate");
  const tickRate = fromMeta("tickRate", meta?.tickRate, 30);
  if (tickRate !== undefined && (typeof tickRate !== "number" || !Number.isFinite(tickRate) || tickRate < 1 || tickRate > 60)) bad("tickRate");
  if (tickRate !== undefined) m.tickRate = tickRate;
  const seats = { player: null, spectator: null, streamer: 1 };
  if (raw.seats !== undefined) {
    if (!plain(raw.seats)) bad("seats");
    onlyKeys(raw.seats, SEAT_TYPES);
    const bounds = { player: [0, 1000], spectator: [0, 10000], streamer: [0, 1] };
    for (const [k, v] of Object.entries(raw.seats)) {
      if (v === null) seats[k] = null;
      else if (intIn(v, bounds[k][0], bounds[k][1])) seats[k] = v;
      else bad("seats");
    }
  }
  m.seats = seats;
  const input = { keys: [...SDK_KEYS], pointer: true, actions: [] };
  if (raw.input !== undefined) {
    if (!plain(raw.input)) bad("input");
    onlyKeys(raw.input, ["keys", "pointer", "actions"]);
    if (raw.input.keys !== undefined) {
      if (!Array.isArray(raw.input.keys) || new Set(raw.input.keys).size !== raw.input.keys.length || raw.input.keys.some((k) => !SDK_KEYS.includes(k))) bad("input-keys");
      input.keys = [...raw.input.keys];
    }
    if (raw.input.pointer !== undefined) {
      if (typeof raw.input.pointer !== "boolean") bad("input-pointer");
      input.pointer = raw.input.pointer;
    }
    if (raw.input.actions !== undefined) {
      if (!Array.isArray(raw.input.actions) || raw.input.actions.length > 16) bad("input-actions");
      const seen = new Set();
      input.actions = raw.input.actions.map((a) => {
        if (!plain(a)) bad("input-actions");
        onlyKeys(a, ["name", "fields"]);
        if (!nameRe.test(a.name || "") || seen.has(a.name)) bad("input-actions");
        seen.add(a.name);
        if (!plain(a.fields)) bad("input-fields");
        const names = Object.keys(a.fields);
        if (names.length < 1 || names.length > 8) bad("input-fields");
        const fields = {};
        for (const n of names) {
          if (!fieldRe.test(n)) bad("input-fields");
          const b = a.fields[n];
          if (!Array.isArray(b) || b.length !== 2 || !Number.isFinite(b[0]) || !Number.isFinite(b[1]) || b[0] >= b[1]) bad("input-fields");
          fields[n] = [b[0], b[1]];
        }
        return { name: a.name, fields };
      });
    }
  }
  m.input = input;
  const chat = { commands: [], bursts: [] };
  if (raw.chat !== undefined) {
    if (!plain(raw.chat)) bad("chat");
    onlyKeys(raw.chat, ["commands", "bursts"]);
    if (raw.chat.commands !== undefined) {
      if (!Array.isArray(raw.chat.commands) || raw.chat.commands.length > 32) bad("chat-commands");
      const seen = new Set();
      chat.commands = raw.chat.commands.map((c) => {
        if (!plain(c)) bad("chat-commands");
        onlyKeys(c, ["name", "args", "who", "perActorMs", "globalPerSec"]);
        if (!nameRe.test(c.name || "") || PLATFORM_COMMANDS.includes(c.name) || seen.has(c.name)) bad("chat-commands");
        seen.add(c.name);
        const args = c.args === undefined ? [] : c.args;
        if (!Array.isArray(args) || args.length > 4) bad("chat-args");
        const parsed = args.map((a, i) => {
          if (!plain(a)) bad("chat-args");
          const ks = Object.keys(a);
          if (ks.length !== 1) bad("chat-args");
          if (a.int !== undefined) {
            const b = a.int;
            if (!Array.isArray(b) || b.length !== 2 || !Number.isSafeInteger(b[0]) || !Number.isSafeInteger(b[1]) || b[0] > b[1]) bad("chat-args");
            return { int: [b[0], b[1]] };
          }
          if (a.enum !== undefined) {
            if (!Array.isArray(a.enum) || a.enum.length < 1 || a.enum.length > 16 || new Set(a.enum).size !== a.enum.length || a.enum.some((x) => typeof x !== "string" || x.length > 32)) bad("chat-args");
            return { enum: [...a.enum] };
          }
          if (a.text !== undefined) {
            if (i !== args.length - 1 || !intIn(a.text, 1, 200)) bad("chat-args");
            return { text: a.text };
          }
          bad("chat-args");
        });
        const who = c.who === undefined ? "anyone" : c.who;
        if (!["anyone", "moderator", "broadcaster"].includes(who)) bad("chat-who");
        const perActorMs = c.perActorMs === undefined ? 250 : c.perActorMs;
        if (!intIn(perActorMs, 100, 600000)) bad("chat-rate");
        const globalPerSec = c.globalPerSec;
        if (globalPerSec !== undefined && !intIn(globalPerSec, 1, 100)) bad("chat-rate");
        return { name: c.name, args: parsed, who, perActorMs, ...(globalPerSec !== undefined ? { globalPerSec } : {}) };
      });
    }
    if (raw.chat.bursts !== undefined) {
      if (!Array.isArray(raw.chat.bursts) || raw.chat.bursts.length > 4) bad("chat-bursts");
      const seen = new Set(), cmdNames = new Set(chat.commands.map((c) => c.name));
      chat.bursts = raw.chat.bursts.map((b) => {
        if (!plain(b)) bad("chat-bursts");
        onlyKeys(b, ["name", "token", "distinct", "windowMs"]);
        if (!nameRe.test(b.name || "") || seen.has(b.name) || cmdNames.has(b.name)) bad("chat-bursts");
        seen.add(b.name);
        if (typeof b.token !== "string" || b.token.length < 1 || b.token.length > 8) bad("chat-bursts");
        if (!intIn(b.distinct, 2, 50) || !intIn(b.windowMs, 1000, 60000)) bad("chat-bursts");
        return { name: b.name, token: b.token, distinct: b.distinct, windowMs: b.windowMs };
      });
    }
  }
  m.chat = chat;
  if (raw.delivery !== undefined) {
    if (!Array.isArray(raw.delivery) || raw.delivery.length < 1 || new Set(raw.delivery).size !== raw.delivery.length || raw.delivery.some((d) => !DELIVERY.includes(d))) bad("delivery");
    m.delivery = [...raw.delivery];
  } else m.delivery = ["A"];
  const resources = raw.resources === undefined ? [] : raw.resources;
  if (!Array.isArray(resources) || resources.length > 128 || new Set(resources).size !== resources.length || resources.some((r) => typeof r !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(r))) bad("resources");
  if (Array.isArray(approvedResources) && resources.some((r) => !approvedResources.includes(r))) bad("resource-not-approved");
  m.resources = [...resources];
  const rounds = raw.rounds === undefined ? false : raw.rounds;
  if (typeof rounds !== "boolean") bad("rounds");
  m.rounds = rounds;
  return deepFreeze(m);
}
export function derivedManifest({ id, version, meta = null }) {
  const m = {
    protocol: PROTOCOL, id, version: structuredClone(version),
    seats: { player: null, spectator: null, streamer: 1 },
    input: { keys: [...SDK_KEYS], pointer: true, actions: [] },
    chat: { commands: [], bursts: [], passthrough: true },
    delivery: ["A"], resources: [], rounds: false, legacy: true,
  };
  if (meta?.name !== undefined) m.name = meta.name;
  const desc = meta?.description ?? meta?.desc;
  if (desc !== undefined) m.description = desc;
  m.world = { w: meta?.world?.w ?? 1280, h: meta?.world?.h ?? 720 };
  m.tickRate = meta?.tickRate ?? 30;
  return deepFreeze(m);
}
