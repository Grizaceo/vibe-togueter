export const meta = {
  name: 'Lantern Table',
  description: 'Cooperate to clear five rounds. Move with WASD or arrows; attack with Space or click. Chat: !enemy summons a foe, !heal restores the team, !roll rolls a die.',
  world: { w: 1280, h: 720 },
  tickRate: 30
};

const W = 1280, H = 720, MAX_ENEMIES = 18;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const colors = ['#ffcf70', '#7fdccb', '#b7a1f5', '#f49ca5', '#91c8ff', '#b8df86'];

export function createState() {
  return { __players: new Map(), enemies: [], effects: [], log: ['The lantern is lit. Clear five rounds together.'], cooldowns: new Map(), round: 1, phase: 'play', timer: 0, spawnTimer: 0, remaining: 3, nextId: 1 };
}
function say(s, message) {
  s.log.unshift(String(message).slice(0, 90));
  if (s.log.length > 5) s.log.length = 5;
}
function spawn(s) {
  if (s.enemies.length >= MAX_ENEMIES) return false;
  const side = Math.floor(Math.random() * 4);
  const x = side === 0 ? 85 : side === 1 ? 1195 : 100 + Math.random() * 1080;
  const y = side === 2 ? 145 : side === 3 ? 575 : 155 + Math.random() * 410;
  s.enemies.push({ id: s.nextId++, x, y, hp: 2 + Math.floor((s.round - 1) / 2), attack: 0, wobble: Math.random() * 6 });
  return true;
}
function startRound(s, round) {
  s.round = round; s.phase = 'play'; s.timer = 0; s.spawnTimer = 0; s.remaining = Math.min(12, 2 + round * 2);
  say(s, `Round ${round} begins!`);
}
function reset(s) {
  s.enemies.length = 0; s.effects.length = 0; s.cooldowns.clear();
  let i = 0;
  for (const p of s.__players.values()) {
    p.x = 600 + (i % 4) * 30; p.y = 345 + Math.floor(i / 4) * 30; p.hp = 10; p.attack = 0; p.keys = {}; i++;
  }
  startRound(s, 1);
}
export function onJoin(s, player) {
  if (!player || s.__players.has(player.id)) return;
  const i = s.__players.size;
  s.__players.set(player.id, { x: 600 + (i % 4) * 30, y: 345 + (Math.floor(i / 4) % 4) * 30, hp: 10, attack: 0, keys: {}, color: colors[i % colors.length], name: String(player.name || 'Hero').slice(0, 18), aimX: 1, aimY: 0 });
  say(s, `${String(player.name || 'A hero').slice(0, 18)} joins the table.`);
}
export function onLeave(s, player) { if (player) s.__players.delete(player.id); }
function strike(s, p) {
  if (s.phase !== 'play' || p.hp <= 0 || p.attack > 0) return;
  p.attack = 0.5;
  s.effects.push({ x: p.x, y: p.y, life: 0.25, color: '#ffe7a1' });
  let hits = 0;
  for (const e of s.enemies) {
    if (distance(p, e) <= 85) { e.hp--; hits++; }
  }
  if (hits) say(s, `${p.name} strikes ${hits} ${hits === 1 ? 'foe' : 'foes'}!`);
}
export function onInput(s, id, input) {
  const p = s.__players.get(id);
  if (!p || !input) return;
  if (input.kind === 'key') {
    const key = String(input.key || '').toLowerCase();
    if (['up', 'down', 'left', 'right', 'w', 'a', 's', 'd', 'space'].includes(key)) {
      p.keys[key] = !!input.down;
      if (key === 'space' && input.down) strike(s, p);
    }
  } else if (input.kind === 'pointer' && input.down) {
    if (Number.isFinite(input.x) && Number.isFinite(input.y)) {
      p.aimX = input.x - p.x; p.aimY = input.y - p.y;
    }
    strike(s, p);
  }
}
export function onChat(s, user, cmd, args) {
  cmd = String(cmd || '').toLowerCase();
  if (!['enemy', 'heal', 'roll'].includes(cmd)) return false;
  const name = String((user && user.name) || 'Guest').slice(0, 30);
  const key = `${String((user && user.source) || '').slice(0, 30)}:${name.toLowerCase()}`;
  const cd = s.cooldowns.get(key) || 0;
  if (cd > 0) return true;
  if (s.cooldowns.size >= 256 && !s.cooldowns.has(key)) return true;
  s.cooldowns.set(key, cmd === 'heal' ? 12 : 5);
  if (cmd === 'roll') {
    const roll = 1 + Math.floor(Math.random() * 6);
    say(s, `${name} rolled a ${roll}.`);
  } else if (cmd === 'heal') {
    let count = 0;
    for (const p of s.__players.values()) if (p.hp > 0 && p.hp < 10) { p.hp = Math.min(10, p.hp + 2); count++; }
    say(s, count ? `${name} restores 2 health to the team.` : `${name} offers a healing light.`);
  } else if (s.phase === 'play' && spawn(s)) say(s, `${name} summons a shadow!`);
  else say(s, 'No room for another shadow right now.');
  return true;
}
export function tick(s, dt) {
  dt = Number.isFinite(dt) ? clamp(dt, 0, 0.1) : 0;
  for (const [key, value] of s.cooldowns) { const n = value - dt; if (n <= 0) s.cooldowns.delete(key); else s.cooldowns.set(key, n); }
  for (const e of s.effects) e.life -= dt;
  s.effects = s.effects.filter(e => e.life > 0).slice(-30);
  if (s.phase !== 'play') {
    s.timer -= dt;
    if (s.timer <= 0) { if (s.phase === 'between') startRound(s, s.round + 1); else reset(s); }
    return;
  }
  s.spawnTimer -= dt;
  if (s.remaining > 0 && s.spawnTimer <= 0 && spawn(s)) { s.remaining--; s.spawnTimer = 0.8; }
  let alive = 0;
  for (const p of s.__players.values()) {
    p.attack = Math.max(0, p.attack - dt);
    if (p.hp <= 0) continue;
    alive++;
    let dx = (p.keys.right || p.keys.d ? 1 : 0) - (p.keys.left || p.keys.a ? 1 : 0);
    let dy = (p.keys.down || p.keys.s ? 1 : 0) - (p.keys.up || p.keys.w ? 1 : 0);
    const len = Math.hypot(dx, dy);
    if (len) { dx /= len; dy /= len; p.x = clamp(p.x + dx * 175 * dt, 65, 1215); p.y = clamp(p.y + dy * 175 * dt, 130, 590); }
    if (p.keys.space) strike(s, p);
  }
  for (const e of s.enemies) {
    e.attack = Math.max(0, e.attack - dt); e.wobble += dt * 3;
    let target = null, best = Infinity;
    for (const p of s.__players.values()) if (p.hp > 0) { const d = distance(e, p); if (d < best) { best = d; target = p; } }
    if (target) {
      if (best > 27) { e.x = clamp(e.x + (target.x - e.x) / best * 48 * dt, 55, 1225); e.y = clamp(e.y + (target.y - e.y) / best * 48 * dt, 120, 600); }
      else if (e.attack <= 0) { target.hp = Math.max(0, target.hp - 1); e.attack = 1; if (!target.hp) say(s, `${target.name} has fallen.`); }
    }
  }
  const before = s.enemies.length;
  s.enemies = s.enemies.filter(e => e.hp > 0);
  if (before > s.enemies.length) s.effects.push({ x: 640, y: 355, life: 0.12, color: '#ffcd71' });
  if (s.__players.size && !alive) { s.phase = 'lost'; s.timer = 7; say(s, 'The lantern fades. A new game begins soon.'); }
  else if (s.remaining === 0 && !s.enemies.length) {
    s.phase = s.round >= 5 ? 'won' : 'between'; s.timer = s.phase === 'won' ? 9 : 4;
    if (s.phase === 'won') say(s, 'Victory! The table is safe. A new game begins soon.');
    else { for (const p of s.__players.values()) p.hp = Math.min(10, p.hp + 2); say(s, 'Round cleared! The team recovers 2 health.'); }
  }
}
export function view(s) {
  const layers = [
    { t: 'rect', x: 0, y: 0, w: W, h: H, color: '#171720' },
    { t: 'rect', x: 32, y: 95, w: 1216, h: 520, color: '#5c4035' },
    { t: 'rect', x: 46, y: 109, w: 1188, h: 492, color: '#293d38' },
    { t: 'circle', x: 640, y: 355, r: 108, color: '#344b40' },
    { t: 'circle', x: 640, y: 355, r: 68, color: '#4c5c42' },
    { t: 'circle', x: 640, y: 355, r: 24, color: '#e0ad56' },
    { t: 'circle', x: 640, y: 355, r: 12, color: '#fff0ae' }
  ];
  for (const e of s.enemies) {
    layers.push({ t: 'circle', x: e.x, y: e.y, r: 18, color: '#29283a' }, { t: 'circle', x: e.x - 6, y: e.y - 3, r: 3, color: '#f47d88' }, { t: 'circle', x: e.x + 6, y: e.y - 3, r: 3, color: '#f47d88' });
  }
  for (const p of s.__players.values()) {
    layers.push({ t: 'circle', x: p.x, y: p.y, r: 19, color: p.hp ? p.color : '#77717b' }, { t: 'circle', x: p.x, y: p.y - 4, r: 7, color: '#fff3d8' }, { t: 'text', x: p.x, y: p.y - 29, text: `${p.name} ${p.hp}/10`, size: 13, color: '#fff4db' });
  }
  for (const e of s.effects) layers.push({ t: 'circle', x: e.x, y: e.y, r: 78 * (1 - e.life / 0.3), color: e.color, fill: false, w: 4 });
  if (s.phase !== 'play') {
    const message = s.phase === 'won' ? 'VICTORY!' : s.phase === 'lost' ? 'THE LANTERN FADES' : 'ROUND CLEARED';
    layers.push({ t: 'rect', x: 400, y: 286, w: 480, h: 110, color: '#171720' }, { t: 'text', x: 640, y: 330, text: message, size: 32, color: '#ffdf9a' }, { t: 'text', x: 640, y: 368, text: `${s.phase === 'between' ? 'Next round' : 'New game'} in ${Math.ceil(s.timer)}...`, size: 18, color: '#e8e1cc' });
  }
  const hud = [
    { t: 'text', x: 40, y: 42, text: 'LANTERN TABLE', size: 28, color: '#ffdf9a', align: 'left' },
    { t: 'text', x: 40, y: 71, text: `ROUND ${s.round} / 5   •   SHADOWS ${s.enemies.length + s.remaining}`, size: 16, color: '#e8e1cc', align: 'left' },
    { t: 'text', x: 1240, y: 43, text: 'Move: WASD / arrows   •   Attack: Space / click', size: 16, color: '#e8e1cc', align: 'right' },
    { t: 'text', x: 1240, y: 70, text: 'Chat: !enemy   !heal   !roll', size: 16, color: '#a9d8c4', align: 'right' },
    { t: 'text', x: 42, y: 642, text: 'RECENT ACTIONS', size: 15, color: '#ffdf9a', align: 'left' }
  ];
  s.log.forEach((line, i) => hud.push({ t: 'text', x: 42 + (i >= 3 ? 610 : 0), y: 662 + (i % 3) * 18, text: line, size: 14, color: '#ded8c8', align: 'left' }));
  return { bg: '#171720', layers, hud };
}
