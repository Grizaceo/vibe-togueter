// Shared client: connects over WS, forwards inputs, renders states.
import { drawFrame } from './render.js';

export function connect({ spectator = false, canvas, onWelcome, onFeed, onPlayers, onRole } = {}) {
  const params = new URLSearchParams(location.search);
  const name = params.get('name') || localStorage.getItem('va-name') || `anon-${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('va-name', name);

  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const path = spectator ? '/spectate' : '/play';
  const ws = new WebSocket(`${proto}://${location.host}${path}?name=${encodeURIComponent(name)}`);
  const ctx = canvas?.getContext('2d');
  let world = { w: 1280, h: 720 };

  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.t === 'welcome') { world = msg.world; onWelcome?.(msg); }
    if (msg.t === 'state') {
      onPlayers?.(msg.players, msg.game, msg.error, msg.fund);
      if (ctx && canvas) {
        if (canvas.width !== canvas.clientWidth) { canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight; }
        drawFrame(ctx, msg.view, canvas, msg.view.world || world);
      }
    }
    if (msg.t === 'role') onRole?.(msg);
    if (msg.t === 'feed') onFeed?.(msg);
  };

  // --- inputs ---
  if (!spectator && canvas) {
    const send = data => { if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'input', data })); };
    const KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D']);
    addEventListener('keydown', e => { if (!['INPUT','TEXTAREA','SELECT','BUTTON'].includes(e.target?.tagName) && KEYS.has(e.key)) { e.preventDefault(); send({ kind: 'key', key: norm(e.key), down: true }); } });
    addEventListener('keyup', e => { if (KEYS.has(e.key)) send({ kind: 'key', key: norm(e.key), down: false }); });
    addEventListener('blur',()=>{for(const key of ['left','right','w','a','s','d','space'])send({kind:'key',key,down:false});});
    canvas.addEventListener('pointerdown', e => send({ kind: 'pointer', ...toWorld(e, canvas, world), down: true }));
    canvas.addEventListener('pointermove', e => { if (e.buttons) send({ kind: 'pointer', ...toWorld(e, canvas, world), down: true }); });
    canvas.addEventListener('pointerup', e => send({ kind: 'pointer', ...toWorld(e, canvas, world), down: false }));
  }

  function norm(k) {
    return ({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', ' ': 'space' })[k] || k.toLowerCase();
  }
  function toWorld(e, canvas, world) {
    const r = canvas.getBoundingClientRect();
    const s = Math.min(r.width / world.w, r.height / world.h);
    return {
      x: (e.clientX - r.left - (r.width - world.w * s) / 2) / s,
      y: (e.clientY - r.top - (r.height - world.h * s) / 2) / s,
    };
  }

  return {
    sendChat: text => ws.readyState === 1 && ws.send(JSON.stringify({ t: 'chat', text })),
    claimStreamer: key => ws.readyState===1 && ws.send(JSON.stringify({t:'claim-streamer',key})),
    name,
  };
}
