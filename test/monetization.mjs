// Test monetization loop: deposit -> generate via mock LLM -> game loads -> treasury spent.
const BASE = 'http://localhost:8420';
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} ${n} ${x}`);
const post = (p, body) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

// bad secret rejected
let r = await fetch(BASE + '/webhook/donation?secret=malo', { method: 'POST', body: '{"amount":5}' });
ok('webhook rechaza secret malo', r.status === 403);

// good secret deposits
r = await fetch(BASE + '/webhook/donation?secret=cambia-esto', { method: 'POST', body: '{"amountUsd":1.5,"source":"kofi","user":"fan1"}' });
ok('webhook donación aceptada', r.status === 200);

r = await post('/admin/fund', { amountUsd: 1.0, source: 'test' });
ok('admin fund deposit', r.status === 200);

let stats = await (await fetch(BASE + '/admin/treasury')).json();
ok('treasury balance', Math.abs(stats.balance - 2.5) < 0.01, JSON.stringify(stats));

r = await post('/admin/generate', { idea: 'pong del caos controlado por chat' });
const gen = await r.json();
ok('generación vía mock LLM', gen.ok === true, JSON.stringify(gen));

stats = await (await fetch(BASE + '/admin/treasury')).json();
ok('spend registrado', stats.gamesGenerated === 1, JSON.stringify(stats));

// verify the live game switched
const http = await import('node:http');
const wsMod = await import('ws');
const ws = new wsMod.WebSocket('ws://localhost:8420/play?name=checker');
await new Promise(res => ws.on('message', function h(r) {
  const m = JSON.parse(r);
  if (m.t === 'welcome') { ok('juego cargado es el generado', m.game?.name === 'MockLLM Game', m.game?.name); ws.close(); res(); }
}));
