import { test } from "node:test";
import assert from "node:assert/strict";
import {
  diffList,
  applyOps,
  encodeBinary,
  decodeBinary,
  createFrameDecoder,
  negotiateFormat,
} from "../public/frame-codec.js";
import { FrameStream } from "../src/server/frame-stream.js";
import { compactState, encodeMessage } from "../src/traffic.js";

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r1 = (v) => Math.round(v * 10) / 10 || 0; // the controller never emits -0 over JSON
function randomPrim(rand, id) {
  const kind = ["rect", "circle", "line", "text", "sprite"][Math.floor(rand() * 5)];
  const p = { t: kind };
  if (kind === "line") Object.assign(p, { x1: r1(rand() * 1280), y1: r1(rand() * 720), x2: r1(rand() * 1280), y2: r1(-rand() * 50), w: 2 });
  else Object.assign(p, { x: r1(rand() * 1280), y: r1(rand() * 720) });
  if (kind === "rect") Object.assign(p, { w: 10, h: r1(rand() * 30), color: "#abc", rot: Math.round(rand() * 6283) / 1000 });
  if (kind === "circle") Object.assign(p, { r: 8, color: rand() < 0.5 ? "#fff" : "#0006", fill: rand() < 0.5 });
  if (kind === "text") Object.assign(p, { text: "név ✓ " + Math.floor(rand() * 99), size: 14, align: "left" });
  if (kind === "sprite") Object.assign(p, { w: 64, h: 64, src: "/curated/test/a.png" });
  if (id !== undefined) p.id = id;
  return p;
}
function mutate(rand, list) {
  const out = list.map((p) => ({ ...p }));
  for (const p of out) {
    if (rand() < 0.3 && "x" in p) p.x = r1(p.x + (rand() - 0.5) * 40);
    if (rand() < 0.05) delete p.color;
    if (rand() < 0.05 && p.t === "text") p.text = "changed";
  }
  if (rand() < 0.3) out.splice(Math.floor(rand() * out.length), 1);
  if (rand() < 0.3) out.splice(Math.floor(rand() * out.length), 0, randomPrim(rand, rand() < 0.5 ? "new" + Math.floor(rand() * 1e6) : undefined));
  if (rand() < 0.2) out.reverse();
  if (rand() < 0.1 && out.length) out[0] = randomPrim(rand, out[0].id);
  return out;
}

test("deltas rebuild the exact next list for random edits, with and without ids", () => {
  const rand = rng(7);
  for (let round = 0; round < 300; round++) {
    let base = Array.from({ length: Math.floor(rand() * 40) }, (_, i) =>
      randomPrim(rand, rand() < 0.5 ? (rand() < 0.5 ? "p" + i : i) : undefined),
    );
    for (let step = 0; step < 5; step++) {
      const next = mutate(rand, base);
      const ops = diffList(base, next);
      assert.deepEqual(applyOps(base, ops), next);
      // The binary layout carries the same ops exactly.
      const view = { L: ops, H: [] };
      const back = decodeBinary(encodeBinary({ kind: "d", s: 2, env: {}, v: view }));
      assert.deepEqual(applyOps(base, back.v.L), next);
      base = next;
    }
  }
});

test("unchanged scenery costs one copy run and a moving id costs one small patch", () => {
  const scenery = Array.from({ length: 120 }, (_, i) => ({ t: "circle", x: i * 10, y: 300, r: 14, color: "#2b3a67" }));
  const marble = { t: "circle", x: 100, y: 60, r: 11, color: "#f00", id: "m:ana" };
  const ops = diffList([...scenery, marble], [...scenery, { ...marble, y: 72.5 }]);
  assert.deepEqual(ops, [[0, 0, 120], [1, 120, { y: 72.5 }]]);
  assert.ok(encodeBinary({ kind: "d", s: 2, env: {}, v: { L: ops, H: [] } }).length < 30);
});

test("keyframes and deltas decode to the same full state in JSON and binary", () => {
  const stream = new FrameStream();
  const state = (x, players) =>
    compactState({ t: "state", activity: null, view: { bg: "#111", world: { w: 1280, h: 720 }, layers: [{ t: "rect", x: 0, y: 0, w: 1280, h: 720, color: "#000" }, { t: "circle", x, y: 10, r: 5, id: "me" }], hud: [{ t: "text", x: 10, y: 10, text: "hi" }] }, players, fund: { balance: 0.25 } });
  const a = stream.next(state(10, [{ id: 1, name: "ana" }])),
    b = stream.next(state(12.3, [{ id: 1, name: "ana" }])),
    c = stream.next(state(14, [{ id: 1, name: "ana" }, { id: 2, name: "bo" }]));
  for (const format of ["d1", "b1"]) {
    const decoder = createFrameDecoder();
    const first = decoder.decode(a.for(format, -1));
    assert.deepEqual({ ...first, s: undefined }, { ...JSON.parse(a.full()), s: undefined });
    const second = decoder.decode(b.for(format, a.seq));
    assert.equal(second.view.layers[1].x, 12.3);
    assert.deepEqual(second.players, [{ id: 1, name: "ana" }]);
    const third = decoder.decode(c.for(format, b.seq));
    assert.deepEqual(third.view, JSON.parse(c.full()).view);
    assert.deepEqual(third.players.map((p) => p.name), ["ana", "bo"]);
    assert.deepEqual(third.fund, { balance: 0.25 }, "money keeps full precision");
  }
  assert.equal(a.for(undefined, -1), encodeMessage({ t: "state", activity: null, view: JSON.parse(a.full()).view, players: [{ id: 1, name: "ana" }], fund: { balance: 0.25 } }));
});

test("a socket that skipped a frame gets a keyframe, and a gap in deltas asks for resync", () => {
  const stream = new FrameStream();
  const s = (x) => compactState({ t: "state", view: { layers: [{ t: "circle", x, y: 0, r: 1, id: 1 }] } });
  const f1 = stream.next(s(1)),
    f2 = stream.next(s(2)),
    f3 = stream.next(s(3));
  assert.equal(decodeBinary(f3.for("b1", f2.seq)).kind, "d");
  assert.equal(decodeBinary(f3.for("b1", f1.seq)).kind, "k", "skipped f2: keyframe");
  const decoder = createFrameDecoder();
  decoder.decode(f1.for("d1", -1));
  assert.equal(decoder.decode(f3.for("d1", f2.seq)).t, "resync");
  assert.equal(decoder.decode(f3.for("d1", -1)).view.layers[0].x, 3);
});

test("a delta that would be larger than its keyframe is replaced by the keyframe", () => {
  const stream = new FrameStream();
  const list = (t) => Array.from({ length: 50 }, (_, i) => (t === "rect" ? { t, x: i, y: 1, w: 1, h: 1 } : { t, x: i, y: 2, text: "n" }));
  stream.next(compactState({ t: "state", view: { layers: list("rect") } }));
  const whole = stream.next(compactState({ t: "state", view: { layers: list("text") } }));
  assert.equal(JSON.parse(whole.for("d1", whole.seq - 1)).t, "k");
  assert.equal(decodeBinary(whole.for("b1", whole.seq - 1)).kind, "k");
});

test("format negotiation picks the first supported entry and falls back to full JSON", () => {
  assert.equal(negotiateFormat("b1,d1"), "b1");
  assert.equal(negotiateFormat("x9,d1"), "d1");
  assert.equal(negotiateFormat("none"), "none");
  assert.equal(negotiateFormat(null), "full");
  assert.equal(negotiateFormat("zz"), "full");
});
