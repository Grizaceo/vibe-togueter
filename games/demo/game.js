// Bumper Arena — demo vibe-codificado contra el SDK de vibe-arena.
// Activo: WASD/flechas mueven tu blob; chocar a otros da puntos.
// Pasivo (chat): !quake, !gravity, !ball, !big, !tiny

export const meta = {
  name: 'Bumper Arena',
  description: 'Bump others to score points · chat: !quake !gravity !ball !big !tiny',
  world: { w: 1280, h: 720 },
  tickRate: 30,
};

const COLORS = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#a78bfa', '#6bcb77', '#ff9f68', '#64dfdf', '#f15bb5'];
const SPEED = 260, FRICTION = 0.90;

export function createState() {
  return {
    __players: new Map(),
    balls: [],
    gravity: 0,          // px/s^2, toggled by chat
    shake: 0,
    round: 1,
    winner: null,
    winnerTimer: 0,
  };
}

export function onJoin(state, player) {
  state.__players.set(player.id, {
    id: player.id, name: player.name,
    x: 100 + Math.random() * 1080, y: 100 + Math.random() * 520,
    vx: 0, vy: 0, r: 22,
    color: COLORS[player.id % COLORS.length],
    score: 0, keys: {},
  });
}

export function onLeave(state, player) {
  state.__players.delete(player.id);
}

export function onInput(state, playerId, input) {
  const p = state.__players.get(playerId);
  if (!p) return;
  if (input.kind === 'key') p.keys[input.key] = input.down;
}

export function onChat(state, user, cmd, args) {
  switch (cmd) {
    case 'quake':
      for (const p of state.__players.values()) {
        const a = Math.random() * Math.PI * 2;
        p.vx += Math.cos(a) * 600; p.vy += Math.sin(a) * 600;
      }
      state.shake = 14;
      return true;
    case 'gravity':
      state.gravity = state.gravity === 0 ? 900 : 0;
      return true;
    case 'ball':
      if (state.balls.length < 8) {
        state.balls.push({
          x: 640, y: 120, r: 16 + Math.random() * 20,
          vx: (Math.random() - 0.5) * 500, vy: 0,
          color: '#ffffff',
        });
      }
      return true;
    case 'big':
      for (const p of state.__players.values()) p.r = Math.min(60, p.r * 1.3);
      return true;
    case 'tiny':
      for (const p of state.__players.values()) p.r = Math.max(10, p.r * 0.75);
      return true;
  }
  return false;
}

export function tick(state, dt) {
  const W = meta.world.w, H = meta.world.h;
  const players = [...state.__players.values()];

  // movement
  for (const p of players) {
    if (p.keys.left) p.vx -= SPEED * dt * 4;
    if (p.keys.right) p.vx += SPEED * dt * 4;
    if (p.keys.up) p.vy -= SPEED * dt * 4;
    if (p.keys.down) p.vy += SPEED * dt * 4;
    p.vy += state.gravity * dt;
    p.vx *= FRICTION; p.vy *= FRICTION;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.x < p.r) { p.x = p.r; p.vx = -p.vx * 0.7; }
    if (p.x > W - p.r) { p.x = W - p.r; p.vx = -p.vx * 0.7; }
    if (p.y < p.r) { p.y = p.r; p.vy = -p.vy * 0.7; }
    if (p.y > H - p.r) { p.y = H - p.r; p.vy = -p.vy * 0.7; }
  }

  // player-player collisions -> points
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i], b = players[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy), min = a.r + b.r;
      if (d > 0 && d < min) {
        const nx = dx / d, ny = dy / d, push = (min - d) / 2;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        const rel = Math.hypot(a.vx - b.vx, a.vy - b.vy);
        [a.vx, b.vx] = [b.vx * 0.9, a.vx * 0.9];
        [a.vy, b.vy] = [b.vy * 0.9, a.vy * 0.9];
        if (rel > 220) {
          const faster = Math.hypot(a.vx, a.vy) > Math.hypot(b.vx, b.vy) ? a : b;
          faster.score += 1;
          state.shake = Math.min(10, rel / 80);
        }
      }
    }
  }

  // balls
  for (const b of state.balls) {
    b.vy += (state.gravity || 300) * dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < b.r || b.x > W - b.r) b.vx = -b.vx * 0.8;
    if (b.y < b.r || b.y > H - b.r) b.vy = -b.vy * 0.8;
    b.x = Math.max(b.r, Math.min(W - b.r, b.x));
    b.y = Math.max(b.r, Math.min(H - b.r, b.y));
  }

  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 20);

  // round winner at 20 points
  const top = players.sort((a, b) => b.score - a.score)[0];
  if (top && top.score >= 20 && !state.winner) {
    state.winner = top.name;
    state.winnerTimer = 4;
  }
  if (state.winner) {
    state.winnerTimer -= dt;
    if (state.winnerTimer <= 0) {
      for (const p of players) p.score = 0;
      state.winner = null;
      state.round += 1;
    }
  }
}

export function view(state) {
  const W = meta.world.w, H = meta.world.h;
  const sx = state.shake ? (Math.random() - 0.5) * state.shake : 0;
  const sy = state.shake ? (Math.random() - 0.5) * state.shake : 0;
  const layers = [];

  // border
  layers.push({ t: 'rect', x: 0, y: 0, w: W, h: H, color: '#0d0d14' });
  layers.push({ t: 'rect', x: 4, y: 4, w: W - 8, h: H - 8, color: '#14141f' });

  for (const b of state.balls) {
    layers.push({ t: 'circle', x: b.x + sx, y: b.y + sy, r: b.r, color: b.color });
  }
  for (const p of state.__players.values()) {
    layers.push({ t: 'circle', x: p.x + sx, y: p.y + sy, r: p.r, color: p.color });
    layers.push({ t: 'text', x: p.x + sx, y: p.y - p.r - 12 + sy, text: p.name, size: 13, color: '#ddd' });
    layers.push({ t: 'text', x: p.x + sx, y: p.y + sy, text: p.score, size: 16, color: '#111' });
  }

  const hud = [];
  const board = [...state.__players.values()].sort((a, b) => b.score - a.score).slice(0, 5);
  hud.push({ t: 'text', x: 90, y: 30, text: `ROUND ${state.round}`, size: 20, color: '#8ef', align: 'left' });
  board.forEach((p, i) => hud.push({
    t: 'text', x: 90, y: 60 + i * 24, align: 'left', size: 16,
    text: `${i + 1}. ${p.name} — ${p.score}`, color: p.color,
  }));
  if (state.winner) {
    hud.push({ t: 'text', x: W / 2, y: H / 2 - 60, text: `🏆 ${state.winner} wins round ${state.round}`, size: 42, color: '#ffe66d' });
  }
  if (state.__players.size === 0) {
    hud.push({ t: 'text', x: W / 2, y: H / 2, text: 'Waiting for players…', size: 30, color: '#666' });
  }
  return { bg: '#0d0d14', layers, hud };
}
