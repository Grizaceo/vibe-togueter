// Smooths a display list between the last two states, by primitive id.
// Pure module (no DOM) shared by the browser client, tests and benchmarks.
//
// When a state arrives, motion restarts from what is on screen at that moment
// toward the new state over one measured send interval. Only primitives that
// carry the same optional `id` in both states move smoothly; everything else is
// drawn exactly as received, so games that never set ids render as before.
const NUMERIC = ["x", "y", "x1", "y1", "x2", "y2", "w", "h", "r", "size"];
// A jump larger than this (world units) is a teleport: snap, do not sweep.
const SNAP = 240;

function indexById(list) {
  const map = new Map();
  for (const p of list || []) if (p && p.id !== undefined) map.set(p.id, p);
  return map;
}

function blend(a, b, alpha) {
  if (a.t !== b.t) return b;
  for (const key of ["x", "y", "x1", "y1", "x2", "y2"])
    if (
      typeof a[key] === "number" &&
      typeof b[key] === "number" &&
      Math.abs(b[key] - a[key]) > SNAP
    )
      return b;
  let out = null;
  for (const key of NUMERIC) {
    const from = a[key],
      to = b[key];
    if (typeof from !== "number" || typeof to !== "number" || from === to)
      continue;
    out ??= { ...b };
    out[key] = from + (to - from) * alpha;
  }
  if (typeof a.rot === "number" && typeof b.rot === "number" && a.rot !== b.rot) {
    // Shortest way round, so 3.1 -> -3.1 does not spin a full turn.
    const turn = Math.PI * 2;
    const delta = ((((b.rot - a.rot) % turn) + turn * 1.5) % turn) - turn / 2;
    out ??= { ...b };
    out.rot = a.rot + delta * alpha;
  }
  return out || b;
}

function blendList(fromList, toList, alpha) {
  const from = indexById(fromList);
  if (!from.size) return toList || [];
  return (toList || []).map((p) => {
    const previous = p && p.id !== undefined ? from.get(p.id) : undefined;
    return previous ? blend(previous, p, alpha) : p;
  });
}

function travels(fromList, toList) {
  const from = indexById(fromList);
  if (!from.size) return false;
  for (const p of toList || []) {
    const previous = p && p.id !== undefined ? from.get(p.id) : undefined;
    if (!previous || previous.t !== p.t) continue;
    for (const key of [...NUMERIC, "rot"])
      if (
        typeof previous[key] === "number" &&
        typeof p[key] === "number" &&
        previous[key] !== p[key]
      )
        return true;
  }
  return false;
}

export function createInterpolator({ minMs = 16, maxMs = 250 } = {}) {
  let from = null,
    to = null,
    startedAt = 0,
    duration = 33,
    lastArrival = null,
    gap = 33,
    moving = false;

  const sample = (t) => {
    if (!to) return null;
    if (!moving) return to;
    const alpha = Math.min(1, Math.max(0, (t - startedAt) / duration));
    if (alpha >= 1) return to;
    return {
      ...to,
      layers: blendList(from.layers, to.layers, alpha),
      hud: blendList(from.hud, to.hud, alpha),
    };
  };

  return {
    // Accept a new state view received at time `at` (ms, same clock as sample).
    push(view, at) {
      if (lastArrival !== null) {
        const g = at - lastArrival;
        if (g > 0 && g < 1000) gap = gap * 0.75 + g * 0.25;
      }
      lastArrival = at;
      const shown = to ? sample(at) : view;
      from = shown;
      to = view;
      startedAt = at;
      duration = Math.min(maxMs, Math.max(minMs, gap));
      moving =
        from !== to &&
        (travels(from.layers, to.layers) || travels(from.hud, to.hud));
    },
    sample,
    // True while an id-matched primitive is still travelling toward the latest state.
    animating(t) {
      return moving && to !== null && t - startedAt < duration;
    },
  };
}
