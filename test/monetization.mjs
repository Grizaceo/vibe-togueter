// Test monetization loop: deposit -> generate via mock LLM -> game loads -> treasury spent.
const BASE = (process.env.VA_ARENA_URL || 'http://localhost:8420');
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

// Owner explicitly reviews the exact input before even a trusted local build.
const roundAction=async data=>{const response=await fetch(BASE+'/admin/round',{method:'POST',headers:{'content-type':'application/json','x-streamer-key':process.env.VA_STREAMER_KEY||''},body:JSON.stringify(data)});return response.json();};
await fetch(BASE+'/admin/round',{method:'POST',headers:{'content-type':'application/json','x-streamer-key':process.env.VA_STREAMER_KEY||''},body:JSON.stringify({action:'cancel'})});
await roundAction({action:'open',settings:{maxIdeas:1}});
await post('/admin/chat',{user:'reviewed-builder',text:'!idea pong del caos controlado por chat'});
await roundAction({action:'close'});let approved=await roundAction({action:'select',ids:[1]});
approved=await roundAction({action:'approve',roundId:approved.id,reviewToken:approved.reviewToken});
r = await post('/admin/generate', { idea: 'pong del caos controlado por chat',roundId:approved.id,approvedInputHash:approved.approvedInputHash });
const gen = await r.json();
ok('generación vía mock LLM', gen.ok === true, JSON.stringify(gen));

stats = await (await fetch(BASE + '/admin/treasury')).json();
ok('spend registrado', stats.gamesGenerated === 1, JSON.stringify(stats));

// verify the live game switched
const http = await import('node:http');
const wsMod = await import('ws');
const ws = new wsMod.WebSocket(BASE.replace(/^http/,'ws')+'/play?name=checker');
await new Promise(res => ws.on('message', function h(r) {
  const m = JSON.parse(r);
  if (m.t === 'welcome') { ok('juego cargado es el generado', m.game?.name === 'MockLLM Game', m.game?.name); ws.close(); res(); }
}));
