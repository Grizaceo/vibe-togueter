// E2E smoke test: 2 players + spectator, inputs, chat commands, state broadcasts.
import WebSocket from 'ws';

const URL = (process.env.VA_ARENA_URL || 'http://localhost:8420').replace(/^http/,'ws');
const results = [];
const ok = (name, cond, extra = '') => { results.push([name, !!cond]); console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); };

function client(name, spectate = false) {
  const ws = new WebSocket(`${URL}${spectate ? '/spectate' : '/play'}?name=${name}`);
  const c = { ws, name, welcome: null, states: [], feeds: [], send: m => ws.send(JSON.stringify(m)) };
  ws.on('message', r => {
    const m = JSON.parse(r);
    if (m.t === 'welcome') c.welcome = m;
    if (m.t === 'state') c.states.push(m);
    if (m.t === 'feed') c.feeds.push(m);
  });
  return c;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ensure the demo game is the live one (idempotent)
await fetch((process.env.VA_ARENA_URL || 'http://localhost:8420')+'/admin/load', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ game: 'demo' }),
});
await sleep(300);

const alice = client('alice');
const bob = client('bob');
const spec = client('spec', true);
await sleep(400);

ok('welcome alice', alice.welcome?.t === 'welcome' && alice.welcome.id > 0);
ok('welcome spectator', spec.welcome?.kind === 'spectator');
ok('game loaded', alice.welcome?.game?.name === 'Bumper Arena');

// inputs + chat command
alice.send({ t: 'input', data: { kind: 'key', key: 'right', down: true } });
alice.send({ t: 'chat', text: '!ball' });
await sleep(300);
alice.send({ t: 'chat', text: '!quake' });
await sleep(300);
alice.send({ t: 'chat', text: '!idea un juego de naves con el chat' });
await sleep(700);

const st = alice.states.at(-1);
ok('state broadcasts', alice.states.length > 5, `(${alice.states.length} states)`);
ok('players in state', st?.players?.length === 2, JSON.stringify(st?.players?.map(p => p.name)));
ok('view has layers', st?.view?.layers?.length > 0);

// balls spawned? layers include white circles + player circles
const circles = st?.view?.layers?.filter(l => l.t === 'circle') || [];
ok('!ball spawned + players', circles.length >= 3, `(${circles.length} circles)`);
ok('chat feed relayed', spec.feeds.some(f => f.text.includes('!quake')));
ok('idea ack', spec.feeds.some(f => f.text.includes('Idea saved')));

// spectator cannot inject inputs (no crash = pass), alice moves right
const st2 = alice.states.at(-1);
const hud = st2?.view?.hud || [];
ok('hud has scoreboard', hud.some(h => String(h.text).includes('ROUND')));

alice.ws.close(); bob.ws.close(); spec.ws.close();
await sleep(200);
const fails = results.filter(r => !r[1]);
console.log(`\n${results.length - fails.length}/${results.length} passed`);
process.exit(fails.length ? 1 : 0);
