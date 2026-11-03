// Mode-A data plane: keyframes and deltas of the display list.
// Shared by the controller (encode) and the browser (decode); pure, no DOM.
//
// Formats, negotiated per socket with ?frames=b1,d1 (first supported wins):
//   full  legacy {t:'state'} JSON, every frame complete (clients that ask nothing)
//   d1    JSON keyframes {t:'k'} and deltas {t:'d'} against the previous frame
//   b1    the same keyframes/deltas in a compact binary layout
// A delta lists, for layers and hud, how to rebuild the new list from the
// previous one: copy a run, patch one primitive (by id, else same position),
// or send a new primitive. Unchanged (static) primitives therefore travel once,
// in the keyframe, and afterwards only as copy runs.
export const FORMATS = ["b1", "d1"];
export const NUMBER_FIELDS = ["x", "y", "x1", "y1", "x2", "y2", "w", "h", "r", "size", "rot"];
const STRING_FIELDS = ["color", "align", "text", "src"];
const FIELDS = [...NUMBER_FIELDS, ...STRING_FIELDS, "fill", "id"];
const TYPES = ["rect", "circle", "line", "text", "sprite"];
const COPY = 0,
  PATCH = 1,
  NEW = 2;

// "none" is for sockets that never draw (feed and control messages only).
export function negotiateFormat(requested) {
  for (const f of String(requested || "").split(",").slice(0, 8))
    if ([...FORMATS, "none"].includes(f.trim())) return f.trim();
  return "full";
}

// ---------- list diff ----------
function fieldPatch(a, b) {
  let patch = null;
  for (const key in b)
    if (a[key] !== b[key]) (patch ??= {})[key] = b[key];
  for (const key in a) if (!(key in b)) (patch ??= {})[key] = null;
  return patch;
}

export function diffList(base, next) {
  const ops = [],
    byId = new Map();
  base.forEach((p, i) => {
    if (p.id !== undefined && !byId.has(p.id)) byId.set(p.id, i);
  });
  next.forEach((p, j) => {
    let k = -1;
    if (p.id !== undefined) k = byId.get(p.id) ?? -1;
    else if (j < base.length && base[j].id === undefined) k = j;
    if (k < 0 || base[k].t !== p.t) return ops.push([NEW, p]);
    const patch = fieldPatch(base[k], p);
    if (patch) return ops.push([PATCH, k, patch]);
    const last = ops[ops.length - 1];
    if (last && last[0] === COPY && last[1] + last[2] === k) last[2]++;
    else ops.push([COPY, k, 1]);
  });
  return ops;
}

export function applyOps(base, ops) {
  if (!Array.isArray(ops)) throw Error("bad ops");
  const out = [];
  for (const op of ops) {
    if (op[0] === COPY) {
      const [, from, len] = op;
      if (!(from >= 0 && len >= 0 && from + len <= base.length))
        throw Error("copy out of range");
      for (let i = from; i < from + len; i++) out.push(base[i]);
    } else if (op[0] === PATCH) {
      const source = base[op[1]];
      if (!source) throw Error("patch out of range");
      const p = { ...source };
      for (const key in op[2]) {
        if (op[2][key] === null) delete p[key];
        else p[key] = op[2][key];
      }
      out.push(p);
    } else if (op[0] === NEW) out.push(op[1]);
    else throw Error("unknown op");
  }
  return out;
}

// ---------- binary writer / reader ----------
const encoder = new TextEncoder(),
  decoder = new TextDecoder();
class Writer {
  constructor() {
    this.buf = new Uint8Array(1024);
    this.view = new DataView(this.buf.buffer);
    this.n = 0;
  }
  room(k) {
    if (this.n + k <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.n + k) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.n));
    this.buf = next;
    this.view = new DataView(next.buffer);
  }
  u8(v) {
    this.room(1);
    this.buf[this.n++] = v;
  }
  u32(v) {
    this.room(4);
    this.view.setUint32(this.n, v);
    this.n += 4;
  }
  f64(v) {
    this.room(8);
    this.view.setFloat64(this.n, v);
    this.n += 8;
  }
  varint(v) {
    this.room(5);
    v >>>= 0;
    while (v > 0x7f) {
      this.buf[this.n++] = (v & 0x7f) | 0x80;
      v >>>= 7;
    }
    this.buf[this.n++] = v;
  }
  sint(v) {
    this.varint((v << 1) ^ (v >> 31));
  }
  str(s) {
    const bytes = encoder.encode(s);
    this.varint(bytes.length);
    this.room(bytes.length);
    this.buf.set(bytes, this.n);
    this.n += bytes.length;
  }
  bytes() {
    return this.buf.slice(0, this.n);
  }
}
class Reader {
  constructor(data) {
    this.buf =
      data instanceof Uint8Array ? data : new Uint8Array(data);
    this.view = new DataView(this.buf.buffer, this.buf.byteOffset, this.buf.byteLength);
    this.n = 0;
  }
  need(k) {
    if (this.n + k > this.buf.length) throw Error("truncated frame");
  }
  u8() {
    this.need(1);
    return this.buf[this.n++];
  }
  u32() {
    this.need(4);
    const v = this.view.getUint32(this.n);
    this.n += 4;
    return v;
  }
  f64() {
    this.need(8);
    const v = this.view.getFloat64(this.n);
    this.n += 8;
    return v;
  }
  varint() {
    let v = 0,
      shift = 0,
      b;
    do {
      if (shift > 28) throw Error("bad varint");
      b = this.u8();
      v |= (b & 0x7f) << shift;
      shift += 7;
    } while (b & 0x80);
    return v >>> 0;
  }
  sint() {
    const v = this.varint();
    return (v >>> 1) ^ -(v & 1);
  }
  str() {
    const len = this.varint();
    this.need(len);
    const s = decoder.decode(this.buf.subarray(this.n, this.n + len));
    this.n += len;
    return s;
  }
}

// Coordinates are already rounded by the controller to 0.1 (rotation 0.001),
// so fixed-point integers carry them exactly.
const scaleOf = (key) => (key === "rot" ? 1000 : 10);
function writeFields(w, p, keys, deleted = 0) {
  let mask = 0;
  for (let i = 0; i < FIELDS.length; i++)
    if (keys(FIELDS[i]) && p[FIELDS[i]] !== null && p[FIELDS[i]] !== undefined)
      mask |= 1 << i;
  w.varint(mask);
  if (deleted !== null) w.varint(deleted);
  for (let i = 0; i < FIELDS.length; i++) {
    if (!(mask & (1 << i))) continue;
    const key = FIELDS[i],
      v = p[key];
    if (i < NUMBER_FIELDS.length) w.sint(Math.round(v * scaleOf(key)));
    else if (key === "fill") w.u8(v ? 1 : 0);
    else if (key === "id") {
      if (typeof v === "number") {
        w.u8(1);
        w.sint(v);
      } else {
        w.u8(0);
        w.str(String(v));
      }
    } else w.str(String(v));
  }
}
function readFields(r, withDeleted) {
  const mask = r.varint(),
    deleted = withDeleted ? r.varint() : 0,
    p = {};
  for (let i = 0; i < FIELDS.length; i++) {
    if (!(mask & (1 << i))) continue;
    const key = FIELDS[i];
    if (i < NUMBER_FIELDS.length) p[key] = r.sint() / scaleOf(key);
    else if (key === "fill") p[key] = r.u8() === 1;
    else if (key === "id") p[key] = r.u8() === 1 ? r.sint() : r.str();
    else p[key] = r.str();
  }
  for (let i = 0; i < FIELDS.length; i++)
    if (deleted & (1 << i)) p[FIELDS[i]] = null;
  return p;
}
function writePrim(w, p) {
  const type = TYPES.indexOf(p.t);
  if (type < 0) throw Error("unknown primitive");
  w.u8(type);
  writeFields(w, p, () => true, null);
}
function readPrim(r) {
  const t = TYPES[r.u8()];
  if (!t) throw Error("unknown primitive");
  return { t, ...readFields(r, false) };
}
function writeOps(w, ops) {
  w.varint(ops.length);
  for (const op of ops) {
    w.u8(op[0]);
    if (op[0] === COPY) {
      w.varint(op[1]);
      w.varint(op[2]);
    } else if (op[0] === PATCH) {
      w.varint(op[1]);
      let deleted = 0;
      for (let i = 0; i < FIELDS.length; i++)
        if (op[2][FIELDS[i]] === null) deleted |= 1 << i;
      writeFields(w, op[2], (key) => key in op[2], deleted);
    } else writePrim(w, op[1]);
  }
}
function readOps(r) {
  const count = r.varint(),
    ops = [];
  if (count > 100000) throw Error("too many ops");
  for (let i = 0; i < count; i++) {
    const code = r.u8();
    if (code === COPY) ops.push([COPY, r.varint(), r.varint()]);
    else if (code === PATCH) ops.push([PATCH, r.varint(), readFields(r, true)]);
    else if (code === NEW) ops.push([NEW, readPrim(r)]);
    else throw Error("unknown op");
  }
  return ops;
}

// frame: {kind:'k'|'d', s, ts?, env: {...}, view?: {bg,world,layers,hud}, v?: {bg?,world?,L,H}}
export function encodeBinary(frame) {
  const w = new Writer();
  w.u8((frame.kind === "k" ? 1 : 2) | (frame.ts !== undefined ? 0x80 : 0));
  w.u32(frame.s >>> 0);
  if (frame.ts !== undefined) w.f64(frame.ts);
  const env = frame.env && Object.keys(frame.env).length ? JSON.stringify(frame.env) : "";
  w.str(env);
  const v = frame.kind === "k" ? frame.view : frame.v;
  const flags = (v.bg !== undefined ? 1 : 0) | (v.world !== undefined ? 2 : 0);
  w.u8(flags);
  if (flags & 1) w.str(v.bg);
  if (flags & 2) {
    w.sint(Math.round(v.world.w * 10));
    w.sint(Math.round(v.world.h * 10));
  }
  if (frame.kind === "k") {
    for (const list of [v.layers, v.hud]) {
      w.varint(list.length);
      for (const p of list) writePrim(w, p);
    }
  } else {
    writeOps(w, v.L);
    writeOps(w, v.H);
  }
  return w.bytes();
}

export function decodeBinary(data) {
  const r = new Reader(data),
    head = r.u8(),
    kind = (head & 0x7f) === 1 ? "k" : (head & 0x7f) === 2 ? "d" : null;
  if (!kind) throw Error("unknown frame kind");
  const frame = { kind, s: r.u32() };
  if (head & 0x80) frame.ts = r.f64();
  const env = r.str();
  frame.env = env ? JSON.parse(env) : {};
  const flags = r.u8(),
    v = {};
  if (flags & 1) v.bg = r.str();
  if (flags & 2) v.world = { w: r.sint() / 10, h: r.sint() / 10 };
  if (kind === "k") {
    for (const key of ["layers", "hud"]) {
      const count = r.varint();
      if (count > 100000) throw Error("too many primitives");
      v[key] = [];
      for (let i = 0; i < count; i++) v[key].push(readPrim(r));
    }
    frame.view = v;
  } else {
    v.L = readOps(r);
    v.H = readOps(r);
    frame.v = v;
  }
  return frame;
}

// ---------- client-side reassembly ----------
// Returns full state messages ({t:'state', ...}) from k/d frames in either format,
// or {resync:true} when a delta does not follow the frame it was built against.
export function createFrameDecoder() {
  let base = null;
  return {
    decode(data) {
      let frame;
      if (typeof data === "string") {
        const msg = JSON.parse(data);
        if (msg.t !== "k" && msg.t !== "d") return msg;
        const { t, s, ts, view, v, ...env } = msg;
        frame = { kind: t, s, ts, env, view, v };
      } else frame = decodeBinary(data);
      if (frame.kind === "k") {
        base = { ...frame.env, t: "state", s: frame.s, view: frame.view };
      } else {
        if (!base || frame.s !== base.s + 1) {
          base = null;
          return { t: "resync" };
        }
        const v = frame.v;
        base = {
          ...base,
          ...frame.env,
          t: "state",
          s: frame.s,
          view: {
            bg: v.bg ?? base.view.bg,
            world: v.world ?? base.view.world,
            layers: applyOps(base.view.layers, v.L),
            hud: applyOps(base.view.hud, v.H),
          },
        };
      }
      if (frame.ts !== undefined) base.ts = frame.ts;
      return base;
    },
  };
}
