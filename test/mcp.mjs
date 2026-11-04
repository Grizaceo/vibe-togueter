// MCP stdio smoke test: spawn server, handshake, list+get+install+load marble-race.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} ${n} ${x}`);

const proc = spawn('node', ['--experimental-vm-modules', 'src/mcp-server.js'], {
  cwd: ROOT, stdio: ['pipe', 'pipe', 'inherit'],
});

let buf = '';
const pending = new Map();
let idc = 0;
proc.stdout.on('data', d => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    const m = JSON.parse(line);
    if (m.id !== undefined && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  }
});
const call = (method, params) => new Promise(res => {
  const id = ++idc;
  pending.set(id, res);
  proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});
const tool = (name, args = {}) => call('tools/call', { name, arguments: args });

await call('initialize', {
  protocolVersion: '2025-03-26',
  capabilities: {}, clientInfo: { name: 'smoke', version: '0' },
});
call('notifications/initialized', {});

const tools = await call('tools/list', {});
const names = tools.result.tools.map(t => t.name);
ok('tools/list', names.length >= 8, names.join(','));

const lt = await tool('list_templates');
const templates = JSON.parse(lt.result.content[0].text);
ok('list_templates', templates.some(t => t.template === 'marble-race' && t.hasCode));

const spec = await tool('get_sdk_spec');
ok('get_sdk_spec', spec.result.content[0].text.includes('export function tick'));

const gt = await tool('get_template', { name: 'marble-race' });
const tmpl = JSON.parse(gt.result.content[0].text);
ok('get_template', !!tmpl['game.js'] && !!tmpl['template.md']);

// install the template code as a live game via MCP
const ins = await tool('install_game', { name: 'marble-race', code: tmpl['game.js'], activate: false });
ok('install_game valida', !ins.result.isError, ins.result.content[0].text.slice(0, 120));

// a broken game must NOT validate
const escape = await tool('install_game', { name: '../games-escape', code: tmpl['game.js'], activate: false });
// The input schema only accepts [\w-]+, so a path never reaches the handler.
ok('install_game rejects a path as a game name', escape.result.isError === true && !fs.existsSync(path.join(ROOT, 'games-escape')), escape.result.content[0].text.slice(0, 100));
const bad = await tool('install_game', { name: 'roto', code: 'export function nope(){}', activate: false });
ok('install_game rechaza código inválido', bad.result.isError === true, bad.result.content[0].text.slice(0, 100));

const st = await tool('arena_status');
ok('arena_status', !st.result.isError);

const load = await tool('load_game', { name: 'marble-race' });
const stAfter = JSON.parse(load.result.content[0].text);
ok('load_game en vivo', stAfter.game?.name === 'Marble Race', stAfter.game?.name);

const inj = await tool('inject_chat', { user: 'fan_mcp', text: '!play' });
ok('inject_chat', !inj.result.isError);

const dep = await tool('treasury_stats');
ok('treasury_stats', !dep.result.isError);

proc.kill();
process.exit(0);
