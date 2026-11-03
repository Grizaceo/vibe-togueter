import { test } from "node:test";
import assert from "node:assert/strict";
import { createInterpolator } from "../public/interpolate.js";

const view = (layers, hud = []) => ({ bg: "#111", world: { w: 1280, h: 720 }, layers, hud });

test("games without ids render exactly the latest state", () => {
  const i = createInterpolator();
  const a = view([{ t: "circle", x: 10, y: 10, r: 5 }]),
    b = view([{ t: "circle", x: 20, y: 10, r: 5 }]);
  i.push(a, 0);
  i.push(b, 33);
  assert.equal(i.sample(40), b);
  assert.equal(i.animating(40), false, "no redraw loop when nothing can move");
});

test("id-matched primitives move from the shown position to the latest state", () => {
  const i = createInterpolator();
  i.push(view([{ t: "rect", x: 0, y: 0, w: 10, h: 10, id: "p" }, { t: "text", x: 5, y: 5, text: "static" }]), 0);
  i.push(view([{ t: "rect", x: 30, y: 0, w: 10, h: 10, id: "p" }, { t: "text", x: 9, y: 5, text: "moved" }]), 33);
  const half = i.sample(33 + 16.5);
  assert.equal(Math.round(half.layers[0].x), 15);
  assert.deepEqual(half.layers[1], { t: "text", x: 9, y: 5, text: "moved" }, "no-id primitives are not interpolated");
  assert.equal(i.animating(40), true);
  assert.equal(i.sample(33 + 40).layers[0].x, 30, "lands exactly on the received state");
  assert.equal(i.animating(33 + 40), false);
  // A new state mid-flight continues from what is on screen, without a jump back.
  i.push(view([{ t: "rect", x: 60, y: 0, w: 10, h: 10, id: "p" }]), 33 + 16.5);
  assert.equal(Math.round(i.sample(33 + 16.5).layers[0].x), 15);
});

test("teleports snap, new ids appear at once and rotation takes the short way", () => {
  const i = createInterpolator();
  i.push(view([{ t: "circle", x: 0, y: 0, r: 4, id: 1 }, { t: "rect", x: 0, y: 0, w: 1, h: 1, rot: 3.1, id: 2 }]), 0);
  i.push(view([{ t: "circle", x: 1000, y: 0, r: 4, id: 1 }, { t: "rect", x: 0, y: 0, w: 1, h: 1, rot: -3.1, id: 2 }, { t: "circle", x: 7, y: 7, r: 1, id: 3 }]), 33);
  const mid = i.sample(50);
  assert.equal(mid.layers[0].x, 1000);
  assert.ok(Math.abs(mid.layers[1].rot) > 3.1, "crosses pi instead of spinning through zero");
  assert.equal(mid.layers[2].x, 7);
});
