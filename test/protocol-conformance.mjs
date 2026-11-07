import { test } from "node:test";
import assert from "node:assert/strict";
import { GameSession } from "../src/protocol/session.js";
import { makeFixture } from "./protocol/fixture-adapter.mjs";
import { makeSdk } from "./protocol/sdk-fixture.mjs";
const ADAPTERS = [
  ["fixture", (s) => makeFixture(s)],
  ["sdk", (s) => makeSdk(s)],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OPTS = {
  id: "fixture",
  version: { sha256: "abc" },
  room: "room-1",
  loadDeadlineMs: 200,
  healthTimeoutMs: 300,
};
const session = async (t, make, scenario, extra = {}, events = []) => {
  const { adapter, received } = await make(scenario);
  const s = new GameSession({ adapter, ...OPTS, ...extra, onEvent: (k, d) => events.push([k, d]) });
  t.after(() => { if (!s._ended) s.stop("test-cleanup"); });
  const started = await s.start();
  return { s, received: () => received(s), events, started };
};
const types = (r) => r.map((m) => m.t);
for (const [name, make] of ADAPTERS) {
  const flush = () => sleep(name === "sdk" ? 120 : 0);
  test(name + ": handshake accepts a common version and rejects the rest", async (t) => {
    const ok = await session(t, make,{});
    assert.equal(ok.started, true);
    assert.equal(ok.s.state, "running");
    if (name !== "sdk")
      assert.equal(types(ok.received())[0], "hello");
    ok.s.stop("test-done");
    const no = await session(t, make,{ protocol: "va-game/9" });
    assert.equal(no.started, false);
    assert.equal(no.s.state, "ended");
    assert.ok(no.events.some(([k]) => k === "game-error"));
    const slow = await session(t, make,{ delay: 500 });
    assert.equal(slow.started, false);
    assert.match(slow.s.error, /watchdog|deadline|timeout/i);
  });
  test(name + ": manifest validation at ready", async (t) => {
    const valid = await session(t, make,{ manifest: { protocol: "va-game/1", id: "fixture", name: "F" } });
    assert.equal(valid.started, true);
    for (const [label, manifest] of [
      ["oversized", { protocol: "va-game/1", name: "x".repeat(16400) }],
      ["unknown-top", { protocol: "va-game/1", bogus: 1 }],
      ["version-in-game", { protocol: "va-game/1", version: {} }],
      ["foreign-resource", { protocol: "va-game/1", resources: ["nope"] }],
    ]) {
      const r = await session(t, make,{ manifest }, { approvedResources: ["ok"] });
      assert.equal(r.started, false, label);
    }
    const foreign = await session(t, make,
      { manifest: { protocol: "va-game/1", resources: ["nope"] } },
      { approvedResources: ["ok"] },
    );
    assert.match(foreign.s.error, /resource-not-approved/);
    const legacy = await session(t, make,{ manifest: null, legacy: true });
    assert.equal(legacy.started, true);
    assert.equal(legacy.s.manifest.legacy, true);
    if (name === "sdk")
      return t.skip("SdkAdapter always permits derived manifests (legacyManifest is fixed true)");
    const refused = await session(t, make,{ manifest: null, legacy: false });
    assert.equal(refused.started, false);
    assert.match(refused.s.error, /manifest-required/);
  });
  test(name + ": seats keep only allowed fields, max is enforced, re-join replaces", async (t) => {
    const { s, received } = await session(t, make,{
      manifest: { protocol: "va-game/1", seats: { player: 1 } },
    });
    assert.equal(
      s.join({ id: 1, type: "player", name: "Viewer", platform: "twitch", verified: true, ip: "1.2.3.4", token: "t", sub: "p" }),
      true,
    );
    await flush();
    const sent = received().find((m) => m.t === "join").seat;
    assert.deepEqual(
      Object.keys(sent).sort(),
      name === "sdk"
        ? ["id", "name", "platform", "role", "verified"]
        : ["id", "name", "platform", "role", "type", "verified"],
    );
    assert.equal(s.join({ id: 2, type: "player", name: "Full" }), false);
    assert.equal(s.join({ id: 1, type: "player", name: "Back" }), true, "re-join replaces");
    assert.equal(s.join({ id: 2, type: "streamer", name: "Owner" }), true, "streamer seat free");
    assert.equal(s.join({ id: 1, type: "streamer", name: "Type jump" }), false, "type change cannot bypass the streamer cap");
    assert.equal(s.leave(1), true);
    if (name !== "sdk")
      assert.equal(received().find((m) => m.t === "leave").reason, "closed");
    assert.equal(s.join({ id: 9, type: "spectator", name: "S" }), true);
    const beforeStop = received().length;
    s.stop("seats-done");
    assert.equal(s.error, null);
    assert.equal(s.stopReason, "seats-done");
    assert.equal(s.leave(2), true, "leaving an ended session just forgets the seat");
    assert.equal(received().length - beforeStop <= 1, true, "no leave line after end");
  });
  test(name + ": input is schema-checked and sanitized", async (t) => {
    const { s, received } = await session(t, make,{});
    s.join({ id: 1, type: "player", name: "V" });
    assert.equal(s.input(1, { kind: "key", key: "bogus", down: true }), false);
    assert.equal(s.input(1, { kind: "key", key: "left", down: true, evil: "x" }), true);
    await flush();
    const inputs = received().filter((m) => m.t === "input");
    assert.deepEqual(inputs.at(-1).data, { kind: "key", key: "left", down: true });
    if (name !== "sdk") assert.equal(inputs.at(-1).seq, 1);
    assert.equal(s.input(1, { kind: "pointer", x: 99999, y: -5, down: true }), true);
    await flush();
    assert.deepEqual(received().filter((m) => m.t === "input").at(-1).data, { kind: "pointer", x: 1280, y: 0, down: true });
    assert.equal(s.input(1, { kind: "action", name: "aim", fields: { x: 0.5, y: -1 } }), true);
    assert.equal(s.input(1, { kind: "action", name: "aim", fields: { x: 2, y: 0 } }), false);
    assert.equal(s.input(1, { kind: "action", name: "aim", fields: { x: 0 } }), false);
    assert.equal(s.input(2, { kind: "key", key: "left", down: true }), false, "unknown seat");
    s.stop("done");
  });
  test(name + ": declared effects reach once, bad ones and platform commands are dropped", async (t) => {
    const { s, received } = await session(t, make,{});
    const actor = { key: "u1", name: "U", platform: "twitch", moderator: false, broadcaster: false };
    assert.equal(s.chat({ cmd: "plant", args: ["3", "oak", "a tree"], actor }), "effect");
    await flush();
    const fx = received().filter((m) => m.t === "effect");
    assert.equal(fx.length, 1);
    assert.deepEqual(fx[0].args, [3, "oak", "a tree"]);
    assert.equal(s.chat({ cmd: "plant", args: ["3", "oak", "again"], actor }), null, "per-actor rate");
    assert.equal(s.chat({ cmd: "plant", args: ["9", "oak"], actor: { key: "u2", name: "V", platform: "twitch", moderator: false, broadcaster: false } }), null, "int out of bounds");
    assert.equal(s.chat({ cmd: "admin", args: [], actor }), null, "broadcaster only");
    assert.equal(s.chat({ cmd: "admin", args: [], actor: { key: "o", name: "O", platform: "twitch", moderator: false, broadcaster: true } }), "effect");
    for (const cmd of ["vote", "join", "pause"])
      assert.equal(s.chat({ cmd, args: [], actor }), null, "platform command " + cmd);
    s.stop("done");
  });
  test(name + ": undeclared commands are dropped with a manifest, passthrough for legacy", async (t) => {
    const { s, received } = await session(t, make,{});
    const actor = { key: "u", name: "U", platform: "twitch" };
    assert.equal(s.chat({ cmd: "undeclared", args: ["x"], actor }), null);
    await flush();
    assert.equal(received().filter((m) => m.t === "chat").length, 0);
    const legacy = await session(t, make,{ manifest: null, legacy: true });
    assert.equal(legacy.s.chat({ cmd: "anything", args: ["a"], actor }), "chat");
    await flush();
    const chatMsg = legacy.received().find((m) => m.t === "chat");
    assert.equal(chatMsg.cmd, "anything");
    assert.equal(legacy.s.chat({ cmd: "vote", args: [], actor }), null, "platform command cannot be shadowed even in passthrough");
    legacy.s.stop("done");
    s.stop("done");
  });
  test(name + ": pause drops input and effects but frames keep the session alive", async (t) => {
    const { s, received, events } = await session(t, make,{});
    s.join({ id: 1, type: "player", name: "V" });
    assert.equal(s.pause("hold"), true);
    assert.equal(s.input(1, { kind: "key", key: "left", down: true }), false);
    assert.equal(s.chat({ cmd: "plant", args: ["1", "oak", "x"], actor: { key: "u", name: "U", platform: "twitch" } }), null);
    await sleep(400);
    assert.equal(s.state, "paused", "watchdog alive through frames");
    assert.equal(s.resume("go"), true);
    assert.equal(s.input(1, { kind: "key", key: "left", down: true }), true);
    s.stop("done");
  });
  test(name + ": silent, malformed, oversized, unknown-t, failure and exit each end the game once", async (t) => {
    for (const behavior of ["silent", "malformed", "oversized", "unknown", "failure", "second-ready"]) {
      const events = [];
      const { s } = await session(t, make,{ behavior }, {}, events);
      await sleep(600);
      assert.equal(s.state, "ended", behavior);
      assert.equal(events.filter(([k]) => k === "game-error").length, 1, behavior);
      assert.ok(s.error);
    }
    const exits = [];
    const { s } = await session(t, make,{ exitAfter: 60 }, {}, exits);
    await sleep(300);
    assert.equal(s.state, "ended");
    assert.equal(exits.filter(([k]) => k === "game-error").length, 1);
    const failEvents = [];
    const { s: fs } = await session(t, make,{ behavior: "failure", failureMessage: "internal game text" }, {}, failEvents);
    await sleep(300);
    assert.match(fs.error, /^Game failure: internal game text/);
    const { s: ok } = await session(t, make,{});
    ok.join({ id: 1, type: "player", name: "V" });
    await sleep(60);
    assert.equal(ok.state, "running", "healthy game keeps running");
    ok.stop("done");
    assert.equal(ok.state, "ended");
  });
  test(name + ": round results naming unknown seats end the game", async (t) => {
    const bad = await session(t, make,{ rounds: true, behavior: "round", results: [{ seat: 99, score: 1 }] });
    bad.s.join({ id: 1, type: "player", name: "V" });
    await sleep(300);
    assert.equal(bad.s.state, "ended");
    assert.match(bad.s.error, /foreign-seat|Protocol error/);
    const good = await session(t, make,{ rounds: true, behavior: "round", results: [{ seat: 1, score: 1 }] });
    good.s.join({ id: 1, type: "player", name: "V" });
    await sleep(300);
    assert.equal(good.s.state, "running");
    good.s.stop("done");
    const undeclared = await session(t, make,{ rounds: false, behavior: "round", results: [] });
    undeclared.s.join({ id: 1, type: "player", name: "V" });
    await sleep(300);
    assert.equal(undeclared.s.state, "ended");
    assert.match(undeclared.s.error, /round-not-declared/);
  });
}
