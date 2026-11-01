export const meta = {
  name: 'Cooperative Seed Race',
  description: 'Help all six seeds reach the grove! Select a lane with up/down or click it, then press space or click to boost. Chat: !seed 1-6, !water 1-6, !wind. Background art by Kenney, CC0: https://kenney.nl/ (https://creativecommons.org/publicdomain/zero/1.0/).',
  world: { w: 1280, h: 720 }, tickRate: 30
};
const SKY = '/curated/kenney-background-elements/sky.png';
const HILLS = '/curated/kenney-background-elements/hills1.png';
const TREE = '/curated/kenney-background-elements/tree01.png';
const colors = ['#f6bb54', '#f08a6c', '#d88ec3', '#96bde4', '#a4d682', '#e4ce73'];
const freshSeeds = () => Array.from({ length: 6 }, () => ({ progress: 0 }));
export function createState() {
  return { __players: new Map(), seeds: freshSeeds(), round: 1, time: 0, cooldowns: new Map(), celebration: 0, finished: false };
}
export function onJoin(state, player) {
  if (!player || player.id == null || state.__players.has(player.id) || state.__players.size >= 500) return;
  const name = typeof player.name === 'string' ? player.name.replace(/\s+/g, ' ').trim().slice(0, 20) : '';
  state.__players.set(player.id, { name: name || 'Player', lane: state.__players.size % 6, keys: Object.create(null), pointerDown: false });
}
export function onLeave(state, player) {
  if (player && player.id != null) state.__players.delete(player.id);
}
function contribute(state, actor, lane, amount) {
  if (state.finished || !Number.isInteger(lane) || lane < 0 || lane > 5) return;
  const last = state.cooldowns.get(actor);
  if (last !== undefined && state.time - last < 0.7) return;
  if (last === undefined && state.cooldowns.size >= 1000) {
    state.cooldowns.delete(state.cooldowns.keys().next().value);
  }
  state.cooldowns.delete(actor);
  state.cooldowns.set(actor, state.time);
  if (lane === 0 && amount === 0) return;
  state.seeds[lane].progress = Math.min(1, state.seeds[lane].progress + amount);
}
export function onInput(state, playerId, input) {
  const player = state.__players.get(playerId);
  if (!player || !input || typeof input !== 'object') return;
  if (input.kind === 'key') {
    const key = input.key;
    if (!['up', 'down', 'w', 's', 'space'].includes(key) || typeof input.down !== 'boolean') return;
    const wasDown = !!player.keys[key];
    player.keys[key] = input.down;
    if (!input.down || wasDown) return;
    if (key === 'up' || key === 'w') player.lane = (player.lane + 5) % 6;
    else if (key === 'down' || key === 's') player.lane = (player.lane + 1) % 6;
    else contribute(state, 'player:' + String(playerId), player.lane, 0.055);
  } else if (input.kind === 'pointer') {
    if (typeof input.down !== 'boolean' || !Number.isFinite(input.x) || !Number.isFinite(input.y)) return;
    const wasDown = player.pointerDown;
    player.pointerDown = input.down;
    if (!input.down || wasDown || input.x < 0 || input.x > 1280 || input.y < 160 || input.y >= 640) return;
    player.lane = Math.floor((input.y - 160) / 80);
    contribute(state, 'player:' + String(playerId), player.lane, 0.055);
  }
}
export function onChat(state, user, cmd, args) {
  if (cmd !== 'seed' && cmd !== 'water' && cmd !== 'wind') return false;
  if (!user || typeof user.name !== 'string' || !user.name.trim() || !Array.isArray(args)) return true;
  const actor = 'chat:' + String(user.source || '').slice(0, 80) + ':' + user.name.trim().toLowerCase().slice(0, 80);
  if (cmd === 'wind') {
    if (args.length !== 0 || state.finished) return true;
    const last = state.cooldowns.get(actor);
    if (last !== undefined && state.time - last < 0.7) return true;
    if (last === undefined && state.cooldowns.size >= 1000) state.cooldowns.delete(state.cooldowns.keys().next().value);
    state.cooldowns.delete(actor);
    state.cooldowns.set(actor, state.time);
    for (const seed of state.seeds) seed.progress = Math.min(1, seed.progress + 0.018);
    return true;
  }
  if (args.length !== 1 || typeof args[0] !== 'string' || !/^[1-6]$/.test(args[0])) return true;
  contribute(state, actor, Number(args[0]) - 1, cmd === 'water' ? 0.05 : 0.06);
  return true;
}
export function tick(state, dt) {
  if (!Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(dt, 0.25);
  state.time += dt;
  for (const [actor, last] of state.cooldowns) if (state.time - last >= 10) state.cooldowns.delete(actor);
  if (!state.finished && state.seeds.every(seed => seed.progress >= 1)) {
    state.finished = true;
    state.celebration = 0;
  }
  if (state.finished) {
    state.celebration += dt;
    if (state.celebration >= 8) {
      state.seeds = freshSeeds();
      state.round += 1;
      state.finished = false;
      state.celebration = 0;
      state.cooldowns.clear();
    }
  }
}
export function view(state) {
  const layers = [
    { t: 'sprite', x: 0, y: 0, w: 1280, h: 720, src: SKY },
    { t: 'sprite', x: 0, y: 310, w: 1280, h: 410, src: HILLS },
    { t: 'rect', x: 0, y: 0, w: 1280, h: 135, color: '#244f46' },
    { t: 'text', x: 40, y: 47, text: 'COOPERATIVE SEED RACE', size: 32, color: '#ffffff', align: 'left' },
    { t: 'text', x: 40, y: 85, text: 'Grow together: bring every seed to the grove!', size: 20, color: '#e3f5cd', align: 'left' },
    { t: 'text', x: 1235, y: 50, text: 'ROUND ' + state.round, size: 22, color: '#ffffff', align: 'right' },
    { t: 'sprite', x: 1100, y: 80, w: 150, h: 200, src: TREE }
  ];
  for (let i = 0; i < 6; i++) {
    const y = 160 + i * 80;
    const progress = Math.max(0, Math.min(1, state.seeds[i].progress));
    const players = Array.from(state.__players.values()).filter(player => player.lane === i);
    const names = players.slice(0, 3).map(player => player.name || 'Player');
    const laneLabel = names.join(', ') + (players.length > 3 ? ' +' + (players.length - 3) + ' more' : '');
    layers.push({ t: 'rect', x: 100, y: y + 10, w: 1000, h: 56, color: i % 2 ? '#eef4d5' : '#f7f5db' });
    layers.push({ t: 'rect', x: 145, y: y + 34, w: 900, h: 5, color: '#b2cb95' });
    layers.push({ t: 'text', x: 125, y: y + 48, text: String(i + 1), size: 24, color: '#42634a', align: 'center' });
    layers.push({ t: 'circle', x: 160 + progress * 870, y: y + 36, r: 19, color: colors[i] });
    layers.push({ t: 'circle', x: 160 + progress * 870, y: y + 36, r: 19, color: '#685845', fill: false, w: 2 });
    layers.push({ t: 'text', x: 1065, y: y + 46, text: progress >= 1 ? '✓' : Math.floor(progress * 100) + '%', size: 18, color: '#42634a', align: 'center' });
    if (laneLabel) layers.push({ t: 'text', x: 145, y: y + 78, text: laneLabel, size: 12, color: '#173d31', align: 'left' });
  }
  if (state.finished) {
    layers.push({ t: 'rect', x: 310, y: 292, w: 660, h: 120, color: '#244f46' });
    layers.push({ t: 'text', x: 640, y: 340, text: 'THE GROVE IS GROWING!', size: 35, color: '#fff6b3', align: 'center' });
    layers.push({ t: 'text', x: 640, y: 383, text: 'Wonderful teamwork! Next round in ' + Math.max(1, Math.ceil(8 - state.celebration)), size: 20, color: '#ffffff', align: 'center' });
  }
  const hud = [
    { t: 'text', x: 30, y: 669, text: '↑ / ↓ choose lane  •  SPACE or click to boost  •  Chat: !seed 1-6  !water 1-6  !wind', size: 18, color: '#173d31', align: 'left' },
    { t: 'text', x: 30, y: 703, text: 'Background art: Kenney · CC0 · https://kenney.nl/ · https://creativecommons.org/publicdomain/zero/1.0/', size: 14, color: '#173d31', align: 'left' }
  ];
  return { bg: '#b8e5ec', layers, hud };
}
