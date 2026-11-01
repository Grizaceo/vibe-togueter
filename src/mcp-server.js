// vibe-arena MCP server (stdio). Lets any agent adapt pre-existing chat-game
// formats or generate new ones, a prompt away from going live on stream.
//
// Tools:
//   arena_status        live state: current game, players, fund, errors
//   get_sdk_spec        the game.js contract every game must implement
//   list_templates      catalog of pre-existing chat-game formats
//   get_template        full source + adaptation notes of one template
//   install_game        write games/<name>/game.js and validate it compiles in the sandbox
//   load_game           put an installed game live on stream
//   generate_game       ask the LLM provider to generate a game from an idea (uses fund)
//   list_ideas          chat-proposed game ideas queue (!idea)
//   clear_ideas         wipe the idea queue
//   treasury_stats      fund balance / raised / spent / games generated
//   deposit             add funds manually (testing; real money via webhook)
//   inject_chat         send a chat command as a user (testing commands)

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './auth/twitch.js';
import { GameHost } from './gamehost.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const TEMPLATES = path.join(ROOT, 'templates');
const GAMES = path.join(ROOT, 'games');
loadEnv(path.join(ROOT,'.env'));
const ARENA = process.env.VA_ARENA_URL || 'http://localhost:8420';

const text = obj => ({ content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] });
const ok = (o = 'done') => text(o);
const fail = (msg, extra = {}) => ({ content: [{ type: 'text', text: `ERROR: ${msg}` }], isError: true, ...extra });

async function api(p, body) {
  const headers={'content-type':'application/json'};
  if(process.env.VA_ADMIN_TOKEN)headers.authorization='Bearer '+process.env.VA_ADMIN_TOKEN;
  const res=await fetch(`${ARENA}${p}`,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)});
  const t = await res.text();
  let parsed; try { parsed = JSON.parse(t); } catch { parsed = t; }
  if (!res.ok) throw new Error(`${res.status}: ${t.slice(0, 300)}`);
  return parsed;
}

const server = new McpServer({ name: 'vibe-arena', version: '0.1.0' });

server.registerTool('arena_status', {
  description: 'Estado en vivo de vibe-arena: juego activo, jugadores, fondo, errores.',
  inputSchema: {},
}, async () => {
  try { return ok(await api('/admin/status')); }
  catch (e) { return fail(`arena no responde en ${ARENA}: ${e.message}`); }
});

server.registerTool('get_sdk_spec', {
  description: 'Devuelve el contrato SDK que debe implementar todo game.js (léelo antes de escribir/adaptar un juego).',
  inputSchema: {},
}, async () => ok(fs.readFileSync(path.join(__dirname, 'sdk-prompt.md'), 'utf8')));

server.registerTool('list_templates', {
  description: 'Catálogo de formatos de chat-games preexistentes listos para adaptar (marble-race, trivia, chat-vs-streamer...).',
  inputSchema: {},
}, async () => {
  const out = [];
  for (const d of fs.readdirSync(TEMPLATES)) {
    const md = path.join(TEMPLATES, d, 'template.md');
    if (!fs.existsSync(md)) continue;
    const doc = fs.readFileSync(md, 'utf8');
    const fm = Object.fromEntries([...doc.matchAll(/^(\w+):\s*(.+)$/gm)].map(m => [m[1], m[2].trim()]));
    out.push({
      template: d,
      format: fm.format || '',
      modes: fm.modes || '',
      status: fm.status || 'unknown',
      hasCode: fs.existsSync(path.join(TEMPLATES, d, 'game.js')),
    });
  }
  return ok(out);
});

server.registerTool('get_template', {
  description: 'Fuente completa de un template: template.md (contrato de chat + notas de adaptación) y game.js si existe.',
  inputSchema: { name: z.string().describe('nombre del template, ej. marble-race') },
}, async ({ name }) => {
  const dir = path.resolve(TEMPLATES, String(name));
  if (!dir.startsWith(TEMPLATES) || !fs.existsSync(dir)) return fail(`template desconocido: ${name}`);
  const out = {};
  for (const f of ['template.md', 'game.js']) {
    const p = path.join(dir, f);
    if (fs.existsSync(p)) out[f] = fs.readFileSync(p, 'utf8');
  }
  return ok(out);
});

server.registerTool('install_game', {
  description: 'Escribe games/<name>/game.js y lo valida compilándolo en el sandbox (no lo pone en vivo). Usa activate=true para además cargarlo.',
  inputSchema: {
    name: z.string().regex(/^[\w-]+$/).describe('slug del juego'),
    code: z.string().describe('contenido completo de game.js según get_sdk_spec'),
    activate: z.boolean().default(false),
  },
}, async ({ name, code, activate }) => {
  const dir = path.resolve(GAMES, name);
  if (!dir.startsWith(GAMES)) return fail('nombre inválido');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'game.js'), code);
  // validación real: compilar en el sandbox sin tocar el juego en vivo
  const probe = new GameHost({ gameDir: dir, onEvent: () => {} });
  await probe.load();
  if (probe.error) return fail(`no compila en el sandbox: ${probe.error}`);
  if (activate) {
    try {
      await api('/admin/load', { game: name });
      const st = await api('/admin/status');
      return ok({ installed: name, live: st.game?.name, error: st.error });
    } catch (e) { return fail(`instalado pero no se pudo cargar: ${e.message}`); }
  }
  return ok({ installed: name, validated: true });
});

server.registerTool('load_game', {
  description: 'Pone en vivo un juego ya instalado en games/<name>.',
  inputSchema: { name: z.string() },
}, async ({ name }) => {
  try { await api('/admin/load', { game: name }); return ok(await api('/admin/status')); }
  catch (e) { return fail(e.message); }
});

server.registerTool('generate_game', {
  description: 'Pide al proveedor LLM configurado (local o nube) generar un juego desde una idea; cobra del fondo y lo pone en vivo.',
  inputSchema: { idea: z.string() },
}, async ({ idea }) => {
  try { return ok(await api('/admin/generate', { idea })); }
  catch (e) { return fail(e.message); }
});

server.registerTool('list_ideas', {
  description: 'Ideas de juegos propuestas por el chat con !idea.',
  inputSchema: {},
}, async () => {
  try { return ok(await api('/admin/ideas')); }
  catch (e) { return fail(e.message); }
});

server.registerTool('clear_ideas', {
  description: 'Vacía la cola de ideas.',
  inputSchema: {},
}, async () => {
  try {
    fs.writeFileSync(path.join(ROOT, 'ideas.jsonl'), '');
    return ok();
  } catch (e) { return fail(e.message); }
});

server.registerTool('treasury_stats', {
  description: 'Balance del fondo: recaudado, gastado, juegos generados.',
  inputSchema: {},
}, async () => {
  try { return ok(await api('/admin/treasury')); }
  catch (e) { return fail(e.message); }
});

server.registerTool('deposit', {
  description: 'Depósito manual al fondo (testing; el dinero real entra por /webhook/donation).',
  inputSchema: { amountUsd: z.number().positive(), source: z.string().default('mcp') },
}, async ({ amountUsd, source }) => {
  try { await api('/admin/fund', { amountUsd, source }); return ok(await api('/admin/treasury')); }
  catch (e) { return fail(e.message); }
});

server.registerTool('inject_chat', {
  description: 'Inyecta un mensaje de chat como si viniera de un usuario (para probar comandos del juego).',
  inputSchema: { user: z.string(), text: z.string() },
}, async ({ user, text }) => {
  try { await api('/admin/chat', { user, text }); return ok(); }
  catch (e) { return fail(e.message); }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[vibe-arena-mcp] stdio listo · arena:', ARENA);
