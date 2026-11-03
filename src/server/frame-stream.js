// Per-frame encodings for the mode-A data plane (see public/frame-codec.js).
// Each state frame is diffed once against the previous one; every encoding
// (legacy full JSON, d1 JSON, b1 binary; keyframe or delta) is built lazily and
// at most once, then shared by all sockets that need it.
import { diffList, encodeBinary } from "../../public/frame-codec.js";

const VIEW_KEYS = new Set(["t", "ts", "view"]);

export class FrameStream {
  constructor() {
    this.seq = 0;
    this.prev = null;
  }

  // state: {t:'state', ts?, ...envelope, view} with an already compacted view.
  next(state) {
    const seq = ++this.seq;
    const envJSON = {};
    for (const key in state)
      if (!VIEW_KEYS.has(key)) envJSON[key] = JSON.stringify(state[key]);
    const frame = new Frame(seq, state, envJSON, this.prev);
    this.prev = { seq, state, envJSON };
    return frame;
  }
}

class Frame {
  constructor(seq, state, envJSON, prev) {
    Object.assign(this, { seq, state, envJSON, prev, cache: {} });
  }
  get hasDelta() {
    return Boolean(this.prev && this.prev.seq === this.seq - 1);
  }
  env() {
    const env = {};
    for (const key in this.envJSON) env[key] = this.state[key];
    return env;
  }
  changedEnv() {
    const env = {};
    for (const key in this.envJSON)
      if (this.envJSON[key] !== this.prev.envJSON[key]) env[key] = this.state[key];
    return env;
  }
  deltaView() {
    if (this.cache.v) return this.cache.v;
    const a = this.prev.state.view,
      b = this.state.view,
      v = { L: diffList(a.layers, b.layers), H: diffList(a.hud, b.hud) };
    if (a.bg !== b.bg) v.bg = b.bg;
    if (a.world.w !== b.world.w || a.world.h !== b.world.h) v.world = b.world;
    return (this.cache.v = v);
  }
  full() {
    return (this.cache.full ??= JSON.stringify(this.state));
  }
  key(format) {
    const name = "key-" + format;
    if (this.cache[name]) return this.cache[name];
    const { ts } = this.state;
    return (this.cache[name] =
      format === "b1"
        ? encodeBinary({ kind: "k", s: this.seq, ts, env: this.env(), view: this.state.view })
        : JSON.stringify({ t: "k", ts, s: this.seq, ...this.env(), view: this.state.view }));
  }
  // Falls back to the keyframe when a delta would not be smaller.
  delta(format) {
    const name = "delta-" + format;
    if (this.cache[name]) return this.cache[name];
    const { ts } = this.state,
      v = this.deltaView(),
      env = this.changedEnv();
    const data =
      format === "b1"
        ? encodeBinary({ kind: "d", s: this.seq, ts, env, v })
        : JSON.stringify({ t: "d", ts, s: this.seq, ...env, v });
    const key = this.key(format);
    return (this.cache[name] = data.length < key.length ? data : key);
  }
  // Data for one socket: legacy clients get full JSON; others a delta when they
  // hold the previous frame, else a keyframe.
  for(format, lastSeq) {
    if (format !== "b1" && format !== "d1") return this.full();
    return this.hasDelta && lastSeq === this.seq - 1
      ? this.delta(format)
      : this.key(format);
  }
}
