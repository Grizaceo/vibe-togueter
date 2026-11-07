import { test } from "node:test";
import assert from "node:assert/strict";
import { ProtocolError, parseGameMessage, hello, join, leave, input, effect, chat, stop, MAX_GAME_FRAME } from "../src/protocol/messages.js";
import { PROTOCOL, PLATFORM_COMMANDS, validateManifest, derivedManifest } from "../src/protocol/manifest.js";
import { seatForGame, checkInput, EffectGate } from "../src/protocol/checks.js";
import { BurstCounter } from "../src/protocol/bursts.js";
const ok = (fn) => fn();
const fails = (fn, code) => assert.throws(fn, (e) => e instanceof ProtocolError && (code === undefined || e.code === code));
const minimal = () => ({ protocol: "va-game/1" });
test("validateManifest accepts a minimal manifest and fills defaults", () => {
  const m = validateManifest(minimal(), { id: "g1", version: { sha256: "x" } });
  assert.equal(m.id, "g1");
  assert.equal(m.version.sha256, "x");
  assert.deepEqual(m.seats, { player: null, spectator: null, streamer: 1 });
  assert.deepEqual(m.delivery, ["A"]);
  assert.equal(m.rounds, false);
  assert.ok(Object.isFrozen(m) && Object.isFrozen(m.input));
});
test("validateManifest rejects unknown keys, bad protocol, foreign ids and oversized", () => {
  fails(() => validateManifest({ ...minimal(), version: {} }, { id: "g" }));
  fails(() => validateManifest({ ...minimal(), passthrough: true }, { id: "g" }));
  fails(() => validateManifest({ protocol: "va-game/2" }, { id: "g" }));
  fails(() => validateManifest({ ...minimal(), id: "other" }, { id: "g" }));
  fails(() => validateManifest({ ...minimal(), name: "x".repeat(20001) }, { id: "g" }), "oversized");
  fails(() => validateManifest("string", { id: "g" }));
});
test("meta fills missing fields and mismatches are refused", () => {
  const meta = { name: "Meta", tickRate: 30, world: { w: 1280, h: 720 } };
  const m = validateManifest(minimal(), { id: "g", meta });
  assert.equal(m.name, "Meta");
  assert.equal(m.tickRate, 30);
  assert.deepEqual(m.world, { w: 1280, h: 720 });
  const same = validateManifest({ ...minimal(), name: "Meta" }, { id: "g", meta });
  assert.equal(same.name, "Meta");
  fails(() => validateManifest({ ...minimal(), name: "Other" }, { id: "g", meta }), "meta-mismatch:name");
  fails(() => validateManifest({ ...minimal(), world: { w: 100, h: 100 } }, { id: "g", meta }), "meta-mismatch:world");
});
test("seats, input, delivery, resources and rounds validation", () => {
  fails(() => validateManifest({ ...minimal(), seats: { player: 1001 } }, { id: "g" }), "seats");
  fails(() => validateManifest({ ...minimal(), seats: { streamer: 2 } }, { id: "g" }), "seats");
  fails(() => validateManifest({ ...minimal(), input: { keys: ["nope"] } }, { id: "g" }));
  fails(() => validateManifest({ ...minimal(), delivery: ["B", "B"] }, { id: "g" }));
  fails(() => validateManifest({ ...minimal(), delivery: [] }, { id: "g" }));
  fails(() => validateManifest({ ...minimal(), resources: ["r!"] }, { id: "g" }));
  fails(() => validateManifest({ ...minimal(), resources: ["r1"] }, { id: "g", approvedResources: ["r2"] }), "resource-not-approved");
  const m = validateManifest({ ...minimal(), resources: ["r1"] }, { id: "g", approvedResources: ["r1", "r2"] });
  assert.deepEqual(m.resources, ["r1"]);
  fails(() => validateManifest({ ...minimal(), rounds: "yes" }, { id: "g" }));
});
test("chat command and burst declarations are strictly validated", () => {
  const cmd = { name: "plant", args: [{ int: [1, 6] }], who: "moderator", perActorMs: 1000, globalPerSec: 2 };
  const m = validateManifest({ ...minimal(), chat: { commands: [cmd] } }, { id: "g" });
  assert.equal(m.chat.commands[0].who, "moderator");
  fails(() => validateManifest({ ...minimal(), chat: { commands: [{ name: "vote" }] } }, { id: "g" }));
  for (const c of PLATFORM_COMMANDS)
    fails(() => validateManifest({ ...minimal(), chat: { commands: [{ name: c }] } }, { id: "g" }), "chat-commands");
  fails(() => validateManifest({ ...minimal(), chat: { commands: [{ name: "plant" }, { name: "plant" }] } }, { id: "g" }));
  fails(() => validateManifest({ ...minimal(), chat: { commands: [{ name: "c", args: [{ text: 10 }, { int: [1, 2] }] }] } }, { id: "g" }));
  fails(() => validateManifest({ ...minimal(), chat: { commands: [{ name: "c", args: [{ enum: [] }] }] } }, { id: "g" }));
  fails(() => validateManifest({ ...minimal(), chat: { commands: [{ name: "c", who: "owner" }] } }, { id: "g" }));
  fails(() => validateManifest({ ...minimal(), chat: { commands: [{ name: "c", perActorMs: 50 }] } }, { id: "g" }));
  fails(() => validateManifest({ ...minimal(), chat: { commands: [{ name: "dup" }], bursts: [{ name: "dup", token: "x", distinct: 2, windowMs: 1000 }] } }, { id: "g" }));
});
test("derivedManifest is the legacy shape with passthrough and legacy flag", () => {
  const m = derivedManifest({ id: "demo", version: { sha256: "h" }, meta: { name: "Demo", tickRate: 30 } });
  assert.equal(m.legacy, true);
  assert.equal(m.chat.passthrough, true);
  assert.equal(m.name, "Demo");
  assert.deepEqual(m.input.keys.length, 9);
  assert.ok(Object.isFrozen(m));
});
test("parseGameMessage enforces types, caps and strict keys", () => {
  const view = { bg: "#111", world: { w: 1, h: 1 }, layers: [], hud: [] };
  assert.equal(parseGameMessage(JSON.stringify({ t: "frame", view })).t, "frame");
  fails(() => parseGameMessage("{"), "bad-json");
  fails(() => parseGameMessage(JSON.stringify({ t: "bogus" })), "unknown-type");
  fails(() => parseGameMessage(JSON.stringify({ t: "frame", view, extra: 1 })), "extra-field");
  fails(() => parseGameMessage(JSON.stringify({ t: "health", tick: -1, players: 0 })));
  fails(() => parseGameMessage(JSON.stringify({ t: "frame", view: { bg: "x".repeat(65) } })), "bad-view-bg");
  fails(() => parseGameMessage("x".repeat(MAX_GAME_FRAME + 1)), "oversized");
  fails(() => parseGameMessage(JSON.stringify({ t: "ready", protocol: "va-game/2", manifest: null, view })), "protocol-mismatch");
  assert.equal(parseGameMessage(JSON.stringify({ t: "ready", protocol: "va-game/1", manifest: null, view })).protocol, "va-game/1");
  const long = "m".repeat(600);
  assert.equal(parseGameMessage(JSON.stringify({ t: "failure", code: "c", message: long })).message.length, 500);
});
test("round messages need rounds:true and known seats", () => {
  const line = (o) => JSON.stringify(o);
  fails(() => parseGameMessage(line({ t: "round", phase: "end", results: [{ seat: 1, score: 5 }] }), { manifest: { rounds: false } }), "round-not-declared");
  fails(() => parseGameMessage(line({ t: "round", phase: "end", results: [{ seat: 9, score: 5 }] }), { manifest: { rounds: true }, seats: new Set([1]) }), "round-foreign-seat");
  assert.equal(parseGameMessage(line({ t: "round", phase: "end", results: [{ seat: 1, score: 5, place: 1 }] }), { manifest: { rounds: true }, seats: new Set([1]) }).results[0].score, 5);
  assert.equal(parseGameMessage(line({ t: "round", phase: "start" }), { manifest: { rounds: true } }).phase, "start");
  fails(() => parseGameMessage(line({ t: "round", phase: "start", results: [] }), { manifest: { rounds: true } }), "bad-round-results");
});
test("builders produce only the declared fields and validate input", () => {
  const h = hello({ protocols: ["va-game/1"], room: "r1", limits: { maxFrameBytes: 1 } });
  assert.deepEqual(Object.keys(h).sort(), ["limits", "protocol", "room", "t"]);
  assert.equal(join({ id: 1, type: "player", name: "N", ip: "x" }).seat.id, 1);
  assert.throws(() => leave(1, "nope"));
  assert.throws(() => input(1, -1, {}));
  assert.equal(effect("e", [], { name: "A", platform: "twitch" }).actor.platform, "twitch");
  assert.equal(stop("done").t, "stop");
});
test("seatForGame keeps only allowed fields", () => {
  const s = seatForGame({ id: 7, type: "player", name: "n".repeat(100), role: "streamer", platform: "twitch", verified: true, ip: "1.2.3.4", token: "t", sub: "u" });
  assert.deepEqual(s, { id: 7, type: "player", name: "n".repeat(64), role: "streamer", platform: "twitch", verified: true });
  assert.throws(() => seatForGame({ id: 1, type: "admin", name: "x" }));
  assert.throws(() => seatForGame({ id: {}, type: "player", name: "x" }));
});
test("checkInput sanitizes keys, clamps pointer and bounds actions", () => {
  const m = validateManifest({ ...minimal(), input: { keys: ["left"], pointer: true, actions: [{ name: "aim", fields: { x: [-1, 1] } }] }, world: { w: 100, h: 50 } }, { id: "g" });
  assert.deepEqual(checkInput(m, { kind: "key", key: "left", down: true, evil: 1 }), { kind: "key", key: "left", down: true });
  assert.equal(checkInput(m, { kind: "key", key: "right", down: true }), null);
  const p = checkInput(m, { kind: "pointer", x: 999, y: -5, down: true });
  assert.deepEqual(p, { kind: "pointer", x: 100, y: 0, down: true });
  assert.equal(checkInput(m, { kind: "action", name: "aim", fields: { x: 2 } }), null);
  assert.equal(checkInput(m, { kind: "action", name: "aim", fields: { x: 0.5 } }).fields.x, 0.5);
  assert.equal(checkInput(m, { kind: "action", name: "aim", fields: { x: 0.5, y: 0 } }), null);
});
test("EffectGate enforces roles, args, per-actor and global rates", () => {
  const m = validateManifest({ ...minimal(), chat: { commands: [
    { name: "c", args: [{ int: [1, 5] }, { text: 10 }], who: "anyone", perActorMs: 1000, globalPerSec: 2 },
    { name: "mod", args: [], who: "moderator" },
    { name: "own", args: [], who: "broadcaster" },
  ] } }, { id: "g" });
  let now = 0;
  const g = new EffectGate(m, { now: () => now });
  const anyone = { key: "u1", name: "U", platform: "twitch", moderator: false, broadcaster: false };
  assert.deepEqual(g.accept({ cmd: "c", args: ["3", "hi", "there"], actor: anyone }), { name: "c", args: [3, "hi there"] });
  assert.equal(g.accept({ cmd: "c", args: ["3", "x"], actor: anyone }), null, "per-actor rate");
  assert.equal(g.accept({ cmd: "c", args: ["9", "x"], actor: anyone }), null, "out of bounds");
  assert.equal(g.accept({ cmd: "c", args: ["3"], actor: anyone }), null, "missing arg");
  assert.equal(g.accept({ cmd: "c", args: ["3", "x", "extra-long-token"] , actor: anyone }), null, "over text max");
  now += 1000;
  assert.equal(g.accept({ cmd: "mod", args: [], actor: anyone }), null, "moderator only");
  const mod = { ...anyone, moderator: true };
  assert.ok(g.accept({ cmd: "mod", args: [], actor: mod }));
  assert.equal(g.accept({ cmd: "own", args: [], actor: mod }), null, "broadcaster only");
  const owner = { ...anyone, broadcaster: true };
  assert.ok(g.accept({ cmd: "own", args: [], actor: owner }));
  const mk = (key) => ({ key, name: "V", platform: "web", moderator: false, broadcaster: false });
  assert.ok(g.accept({ cmd: "c", args: ["2", "y"], actor: mk("u2") }), "second actor allowed");
  assert.ok(g.accept({ cmd: "c", args: ["2", "y"], actor: mk("u3") }), "third fills the cap");
  assert.equal(g.accept({ cmd: "c", args: ["2", "y"], actor: mk("u4") }), null, "globalPerSec reached");
  assert.equal(g.accept({ cmd: "undeclared", args: [], actor: anyone }), null);
});
test("EffectGate accepts only integer-looking tokens for int args", () => {
  const m = validateManifest({ ...minimal(), chat: { commands: [{ name: "c", args: [{ int: [1, 5] }] }] } }, { id: "g" });
  const g = new EffectGate(m, { now: () => 0 });
  const actor = { key: "u", name: "U", platform: "twitch" };
  for (const tok of ["", " 1", "0x1", "1e0", "1.5", "+1"]) {
    const fresh = new EffectGate(m, { now: () => 0 });
    assert.equal(fresh.accept({ cmd: "c", args: [tok], actor }), null, JSON.stringify(tok));
  }
  const wide = new EffectGate(
    validateManifest({ ...minimal(), chat: { commands: [{ name: "c", args: [{ int: [-5, 5] }] }] } }, { id: "g" }),
    { now: () => 0 },
  );
  assert.ok(wide.accept({ cmd: "c", args: ["-3"], actor }), "negative integers parse");
});
test("validateManifest and derivedManifest copy world and version before freezing", () => {
  const metaWorld = { w: 1280, h: 720 };
  const version = { sha256: "a" };
  const m = validateManifest(minimal(), { id: "g", version, meta: { world: metaWorld } });
  assert.notEqual(m.world, metaWorld);
  assert.notEqual(m.version, version);
  metaWorld.w = 1;
  version.sha256 = "b";
  assert.equal(m.world.w, 1280);
  assert.equal(m.version.sha256, "a");
  const d = derivedManifest({ id: "g", version, meta: { world: metaWorld } });
  assert.notEqual(d.world, metaWorld);
  assert.equal(d.world.w, 1);
  assert.equal(d.version.sha256, "b");
});
test("a world that matches meta by value (not key order) is accepted", () => {
  const meta = { name: "M", world: { w: 1280, h: 720 } };
  const m = validateManifest({ ...minimal(), name: "M", world: { h: 720, w: 1280 } }, { id: "g", meta });
  assert.deepEqual(m.world, { w: 1280, h: 720 });
});

const burstManifest = () =>
  validateManifest(
    {
      protocol: "va-game/1",
      chat: {
        commands: [],
        bursts: [
          { name: "cheer", token: "\u{1f389}", distinct: 3, windowMs: 5000 },
          { name: "rain", token: "\u{1f327}", distinct: 2, windowMs: 5000 },
        ],
      },
    },
    { id: "g" },
  );
test("BurstCounter fires once per distinct crowd, with cooldown and window expiry", () => {
  let at = 0;
  const g = new BurstCounter(burstManifest(), { now: () => at });
  const tw = (n) => ({ platform: "twitch", identity: "twitch:" + n });
  const kick = (n) => ({ platform: "kick", identity: "kick:" + n });
  assert.equal(g.accept(tw(1), "\u{1f389}"), null);
  assert.equal(g.accept(tw(1), "\u{1f389}"), null, "same identity cannot count twice");
  assert.equal(g.accept({ platform: "web", identity: "w1" }, "\u{1f389}"), null, "web never counts");
  assert.equal(g.accept({ platform: "twitch", identity: "" }, "\u{1f389}"), null, "no identity, no count");
  assert.equal(g.accept(kick(7), "  \u{1f389}\ufe0f  "), null, "variation selector and trim");
  assert.equal(g.accept(tw(2), "\u{1f389}"), "cheer", "third distinct identity fires");
  assert.equal(g.accept(kick(8), "\u{1f389}"), null, "cooldown clears the crowd and blocks a refire");
  assert.equal(g.accept(kick(9), "\u{1f389}"), null, "cooldown still blocking");
  at = 6000; // window expired, so do the fresh counts
  assert.equal(g.accept(tw(1), "\u{1f389}"), null);
  assert.equal(g.accept(tw(2), "\u{1f389}"), null);
  assert.equal(g.accept(kick(7), "\u{1f389}"), "cheer", "fires again after cooldown + window");
  // independent bursts
  assert.equal(g.accept(tw(1), "\u{1f327}"), null);
  assert.equal(g.accept(tw(2), "\u{1f327}"), "rain", "second burst fires at its own threshold");
  assert.equal(g.accept(tw(9), "hello"), null, "no token match, no count");
});
test("studio-worker manifest verdict: valid, invalid and absent receipts", async () => {
  const { manifestVerdict } = await import("../src/studio-worker/test.js");
  const sha = "a".repeat(64);
  const good = manifestVerdict(
    { protocol: "va-game/1", seats: { player: 4 } },
    sha,
  );
  assert.equal(good.manifest.seats.player, 4);
  assert.equal(good.manifest.id, "candidate");
  assert.equal(good.manifest.version.sha256, sha);
  const bad = manifestVerdict(
    { protocol: "va-game/1", version: { sha256: sha } },
    sha,
  );
  assert.match(bad.manifestError, /unknown-key/);
  const none = manifestVerdict(null, sha);
  assert.equal(none.manifest.legacy, true);
  assert.equal(none.manifest.version.sha256, sha);
});
