// Marble Race — adaptación del formato clásico "Marbles on Stream" al SDK vibe-arena.
// Puro chat: !play/!join mete tu canica, !race larga, !reset limpia.
// Jugadores web que se conectan también reciben canica.

export const meta = {
  name: 'Marble Race',
  description: '!play para entrar tu canica · !race larga · !reset limpia · carrera plinko',
  world: { w: 1280, h: 720 },
  tickRate: 30,
};

const W = 1280, H = 720;
const FINISH_Y = 660;
const SPAWN_Y = 60;
const G = 1400;             // gravedad px/s²
const REST = 0.55;          // restitución contra pegs/paredes
const MARBLE_R = 11;
const MAX_MARBLES = 60;
const COUNTDOWN = 3;
const RACE_TIMEOUT = 120;

const COLORS = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#a78bfa', '#6bcb77', '#ff9f68', '#64dfdf', '#f15bb5', '#e63946', '#8ecae6'];

// pegs: filas escalonadas de obstáculos circulares (campo plinko)
function buildPegs() {
  const pegs = [];
  const rows = 7, gapY = 62;
  for (let r = 0; r < rows; r++) {
    const y = 150 + r * gapY;
    const n = r % 2 === 0 ? 8 : 9;
    const span = 1000, x0 = (W - span) / 2;
    for (let i = 0; i < n; i++) {
      pegs.push({ x: x0 + (span / (n - 1)) * i, y, r: 14 });
    }
  }
  return pegs;
}

export function createState() {
  return {
    __players: new Map(),          // web clients (reserved)
    marbles: new Map(),            // name -> marble
    pegs: buildPegs(),
    phase: 'lobby',                // lobby | countdown | racing | finished
    phaseT: 0,
    raceT: 0,
    placements: [],                // names in finish order
    wins: new Map(),               // name -> total wins (persist across resets within game session)
    tick: 0,
  };
}

function addMarble(state, name) {
  name = String(name).slice(0, 16);
  if (state.marbles.has(name) || state.marbles.size >= MAX_MARBLES) return false;
  const i = state.marbles.size;
  state.marbles.set(name, {
    name,
    x: 200 + (i % 30) * 30, y: SPAWN_Y - Math.floor(i / 30) * 40,
    vx: 0, vy: 0,
    color: COLORS[i % COLORS.length],
    finished: false, place: 0,
  });
  return true;
}

export function onJoin(state, player) {
  state.__players.set(player.id, { name: player.name });
  addMarble(state, player.name);
}

export function onLeave(state, player) {
  state.__players.delete(player.id);
  // la canica se queda — la carrera sigue sin su dueño
}

export function onInput() {}

export function onChat(state, user, cmd) {
  switch (cmd) {
    case 'play': case 'join': case 'jugar':
      if (state.phase !== 'lobby') return false;
      return addMarble(state, user.name);
    case 'race': case 'start': case 'largada':
      if (state.phase === 'lobby' && state.marbles.size >= 2) {
        state.phase = 'countdown'; state.phaseT = COUNTDOWN;
        return true;
      }
      return false;
    case 'reset': case 'reiniciar':
      for (const [n, m] of state.marbles) state.wins.set(n, (state.wins.get(n) || 0) + (m.place === 1 ? 0 : 0));
      state.marbles.clear(); state.placements = [];
      state.phase = 'lobby'; state.phaseT = 0; state.raceT = 0;
      return true;
  }
  return false;
}

export function tick(state, dt) {
  state.tick++;
  if (state.phase === 'countdown') {
    state.phaseT -= dt;
    if (state.phaseT <= 0) { state.phase = 'racing'; state.raceT = 0; }
    return;
  }
  if (state.phase !== 'racing') return;
  state.raceT += dt;

  const marbles = [...state.marbles.values()];
  for (const m of marbles) {
    if (m.finished) continue;
    m.vy += G * dt;
    m.vx *= 0.998;
    m.x += m.vx * dt; m.y += m.vy * dt;

    // paredes
    if (m.x < MARBLE_R) { m.x = MARBLE_R; m.vx = -m.vx * REST; }
    if (m.x > W - MARBLE_R) { m.x = W - MARBLE_R; m.vx = -m.vx * REST; }
    if (m.y < MARBLE_R) { m.y = MARBLE_R; m.vy = -m.vy * REST; }

    // pegs
    for (const p of state.pegs) {
      const dx = m.x - p.x, dy = m.y - p.y;
      const d = Math.hypot(dx, dy), min = MARBLE_R + p.r;
      if (d > 0.001 && d < min) {
        const nx = dx / d, ny = dy / d;
        m.x = p.x + nx * min; m.y = p.y + ny * min;
        const vn = m.vx * nx + m.vy * ny;
        if (vn < 0) {
          m.vx -= (1 + REST) * vn * nx;
          m.vy -= (1 + REST) * vn * ny;
        }
      }
    }

    // canica-canica (resolución posicional simple)
    for (const o of marbles) {
      if (o === m || o.finished) continue;
      const dx = m.x - o.x, dy = m.y - o.y;
      const d = Math.hypot(dx, dy), min = MARBLE_R * 2;
      if (d > 0.001 && d < min) {
        const nx = dx / d, push = (min - d) / 2;
        m.x += nx * push; o.x -= nx * push;
        const rel = (m.vx - o.vx) * nx;
        if (rel < 0) { m.vx -= rel * nx * 0.5; o.vx += rel * nx * 0.5; }
      }
    }

    // meta
    if (m.y >= FINISH_Y) {
      m.finished = true;
      m.place = state.placements.length + 1;
      state.placements.push(m.name);
      if (m.place === 1) state.wins.set(m.name, (state.wins.get(m.name) || 0) + 1);
    }
  }

  const pending = marbles.filter(m => !m.finished).length;
  if ((state.placements.length >= marbles.length && marbles.length > 0) || state.raceT > RACE_TIMEOUT) {
    state.phase = 'finished'; state.phaseT = 8;
  }
  if (pending === 0 && state.phase === 'racing') { state.phase = 'finished'; state.phaseT = 8; }
  if (state.phase === 'finished') {
    state.phaseT -= dt;
    if (state.phaseT <= 0) { // auto-vuelta al lobby con las mismas canicas
      for (const m of marbles) { m.finished = false; m.place = 0; m.x = 200 + (state.tick % 30) * 5; m.y = SPAWN_Y; m.vx = m.vy = 0; }
      state.placements = []; state.phase = 'lobby';
    }
  }
}

export function view(state) {
  const layers = [];
  layers.push({ t: 'rect', x: 0, y: 0, w: W, h: H, color: '#0b1020' });
  // pista
  for (const p of state.pegs) {
    layers.push({ t: 'circle', x: p.x, y: p.y, r: p.r, color: '#2b3a67' });
    layers.push({ t: 'circle', x: p.x, y: p.y, r: p.r, color: '#4a5f9e', fill: false, w: 2 });
  }
  // línea de meta
  layers.push({ t: 'line', x1: 0, y1: FINISH_Y, x2: W, y2: FINISH_Y, color: '#ffe66d', w: 4 });
  for (let x = 0; x < W; x += 40) {
    layers.push({ t: 'rect', x, y: FINISH_Y - 8, w: 20, h: 8, color: (x / 40) % 2 ? '#111' : '#eee' });
  }
  // canicas
  for (const m of state.marbles.values()) {
    layers.push({ t: 'circle', x: m.x, y: m.y, r: MARBLE_R, color: m.color });
    layers.push({ t: 'circle', x: m.x, y: m.y, r: MARBLE_R, color: '#0006', fill: false, w: 1 });
    layers.push({ t: 'text', x: m.x, y: m.y - MARBLE_R - 9, text: m.name, size: 11, color: '#ccc' });
  }

  const hud = [];
  hud.push({ t: 'text', x: 20, y: 26, align: 'left', size: 22, color: '#8ef', text: 'MARBLE RACE' });
  if (state.phase === 'lobby') {
    hud.push({ t: 'text', x: W / 2, y: 40, size: 26, color: '#fff', text: `${state.marbles.size}/${MAX_MARBLES} canicas — !play para entrar · !race para largar` });
  } else if (state.phase === 'countdown') {
    hud.push({ t: 'text', x: W / 2, y: H / 2 - 100, size: 90, color: '#ffe66d', text: Math.ceil(state.phaseT) });
  } else if (state.phase === 'racing') {
    hud.push({ t: 'text', x: W - 20, y: 26, align: 'right', size: 18, color: '#9ab', text: `⏱ ${state.raceT.toFixed(0)}s` });
  }
  // resultados
  const board = state.placements.slice(0, 5).map((n, i) => `${i + 1}. ${n}`);
  board.forEach((l, i) => hud.push({ t: 'text', x: W - 24, y: 60 + i * 26, align: 'right', size: 20, color: ['#ffe66d', '#ccc', '#cd7f32', '#9ab', '#9ab'][i], text: l }));
  if (state.phase === 'finished' && state.placements[0]) {
    hud.push({ t: 'text', x: W / 2, y: 120, size: 46, color: '#ffe66d', text: `🏁 gana ${state.placements[0]}` });
  }
  return { bg: '#0b1020', layers, hud };
}
