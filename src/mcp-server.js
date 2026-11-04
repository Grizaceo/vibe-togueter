// vibe-arena MCP server (stdio). Lets any agent adapt pre-existing chat-game
// formats in explicit trusted-local development. Cloud candidates use quarantine.
//
// Tools:
//   arena_status        live state: current game, players, simulated build credits, errors
//   get_sdk_spec        the game.js contract every game must implement
//   list_templates      catalog of pre-existing chat-game formats
//   get_template        full source + adaptation notes of one template
//   install_game        trusted-local only: write a reviewed SDK fixture and validate in the namespace guest
//   load_game           put an installed game live on stream
//   generate_game       ask the LLM provider to generate a game from an idea (uses simulated accounting; separate VM required by default)
//   list_ideas          chat-proposed game ideas queue (!idea)
//   clear_ideas         wipe the idea queue
//   treasury_stats      simulated credit balance / recorded usage / game count
//   deposit             add simulated credits for local testing; no payment is received
//   inject_chat         send a chat command as a user (testing commands)

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPolicy } from "./build-policy.js";
import { loadEnv } from "./auth/twitch.js";
import { IsolatedGameHost as GameHost } from "./isolated-gamehost.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const TEMPLATES = path.join(ROOT, "templates");
const GAMES = path.join(ROOT, "games");
loadEnv(path.join(ROOT, ".env"));
const ARENA = process.env.VA_ARENA_URL || "http://localhost:8420";

const text = (obj) => ({
  content: [
    {
      type: "text",
      text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2),
    },
  ],
});
const ok = (o = "done") => text(o);
const fail = (msg, extra = {}) => ({
  content: [{ type: "text", text: `ERROR: ${msg}` }],
  isError: true,
  ...extra,
});

async function api(p, body) {
  const headers = { "content-type": "application/json" };
  if (process.env.VA_ADMIN_TOKEN)
    headers.authorization = "Bearer " + process.env.VA_ADMIN_TOKEN;
  const res = await fetch(`${ARENA}${p}`, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(t);
  } catch {
    parsed = t;
  }
  if (!res.ok) throw new Error(`${res.status}: ${t.slice(0, 300)}`);
  return parsed;
}

const server = new McpServer({ name: "vibe-arena", version: "0.1.0" });

server.registerTool(
  "arena_status",
  {
    description:
      "Live game, players, simulated build-credit accounting and errors.",
    inputSchema: {},
  },
  async () => {
    try {
      return ok(await api("/admin/status"));
    } catch (e) {
      return fail(`arena no responde en ${ARENA}: ${e.message}`);
    }
  },
);

server.registerTool(
  "get_sdk_spec",
  {
    description:
      "The SDK contract every game.js must implement. Read it before writing or adapting a game.",
    inputSchema: {},
  },
  async () =>
    ok(fs.readFileSync(path.join(__dirname, "sdk-prompt.md"), "utf8")),
);

server.registerTool(
  "list_templates",
  {
    description:
      "Catalog of existing chat-game formats ready to adapt (marble-race, trivia, chat-vs-streamer...).",
    inputSchema: {},
  },
  async () => {
    const out = [];
    for (const d of fs.readdirSync(TEMPLATES)) {
      const md = path.join(TEMPLATES, d, "template.md");
      if (!fs.existsSync(md)) continue;
      const doc = fs.readFileSync(md, "utf8");
      const fm = Object.fromEntries(
        [...doc.matchAll(/^(\w+):\s*(.+)$/gm)].map((m) => [m[1], m[2].trim()]),
      );
      out.push({
        template: d,
        format: fm.format || "",
        modes: fm.modes || "",
        status: fm.status || "unknown",
        hasCode: fs.existsSync(path.join(TEMPLATES, d, "game.js")),
      });
    }
    return ok(out);
  },
);

server.registerTool(
  "get_template",
  {
    description:
      "Full source of one template: template.md (chat contract and adaptation notes) and game.js when it exists.",
    inputSchema: {
      name: z.string().describe("template name, for example marble-race"),
    },
  },
  async ({ name }) => {
    const dir = path.resolve(TEMPLATES, String(name));
    if (!dir.startsWith(TEMPLATES) || !fs.existsSync(dir))
      return fail(`template desconocido: ${name}`);
    const out = {};
    for (const f of ["template.md", "game.js"]) {
      const p = path.join(dir, f);
      if (fs.existsSync(p)) out[f] = fs.readFileSync(p, "utf8");
    }
    return ok(out);
  },
);

server.registerTool(
  "install_game",
  {
    description:
      "Explicit trusted-local development only: install a reviewed SDK fixture and validate in the namespace guest. Cloud artifacts must use quarantine; no host fallback.",
    inputSchema: {
      name: z
        .string()
        .regex(/^[\w-]+$/)
        .describe("game slug: letters, digits, underscores and dashes"),
      code: z
        .string()
        .describe("the complete game.js, following get_sdk_spec"),
      activate: z.boolean().default(false),
    },
  },
  async ({ name, code, activate }) => {
    if (
      !buildPolicy(
        JSON.parse(
          fs.readFileSync(path.join(ROOT, "vibe-arena.config.json"), "utf8"),
        ).build,
      ).localAllowed
    )
      return fail(
        "Use the isolated VM quarantine workflow; host installation is disabled in cloud-vm mode.",
      );
    const dir = path.resolve(GAMES, name);
    if (!dir.startsWith(GAMES)) return fail("invalid name");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "game.js"), code);
    // Real validation: load it in the sandbox without touching the live game.
    const probe = new GameHost({ gameDir: dir, onEvent: () => {} });
    await probe.load();
    probe.stop();
    if (probe.error) return fail(`does not load in the sandbox: ${probe.error}`);
    if (activate) {
      try {
        await api("/admin/load", { game: name });
        const st = await api("/admin/status");
        return ok({ installed: name, live: st.game?.name, error: st.error });
      } catch (e) {
        return fail(`installed but could not be loaded: ${e.message}`);
      }
    }
    return ok({ installed: name, validated: true });
  },
);

server.registerTool(
  "load_game",
  {
    description: "Put a game already installed in games/<name> live.",
    inputSchema: { name: z.string() },
  },
  async ({ name }) => {
    try {
      await api("/admin/load", { game: name });
      return ok(await api("/admin/status"));
    } catch (e) {
      return fail(e.message);
    }
  },
);

server.registerTool(
  "generate_game",
  {
    description:
      "Request an approved build under the owner execution policy. Default cloud mode blocks without an isolated worker. Legacy local usage records simulated credits, not settled payments.",
    inputSchema: { idea: z.string() },
  },
  async ({ idea }) => {
    try {
      return ok(await api("/admin/generate", { idea }));
    } catch (e) {
      return fail(e.message);
    }
  },
);

server.registerTool(
  "list_ideas",
  {
    description: "Game ideas proposed by chat with !idea.",
    inputSchema: {},
  },
  async () => {
    try {
      return ok(await api("/admin/ideas"));
    } catch (e) {
      return fail(e.message);
    }
  },
);

server.registerTool(
  "clear_ideas",
  {
    description: "Empty the idea queue.",
    inputSchema: {},
  },
  async () => {
    try {
      fs.writeFileSync(path.join(ROOT, "ideas.jsonl"), "");
      return ok();
    } catch (e) {
      return fail(e.message);
    }
  },
);

server.registerTool(
  "treasury_stats",
  {
    description:
      "Read simulated build-credit accounting; no cash balance or provider settlement.",
    inputSchema: {},
  },
  async () => {
    try {
      return ok(await api("/admin/treasury"));
    } catch (e) {
      return fail(e.message);
    }
  },
);

server.registerTool(
  "deposit",
  {
    description:
      "Add simulated build credits for a local fixture. No payment, donation or money transfer occurs.",
    inputSchema: {
      amountUsd: z.number().positive(),
      source: z.string().default("mcp"),
    },
  },
  async ({ amountUsd, source }) => {
    try {
      await api("/admin/fund", { amountUsd, source });
      return ok(await api("/admin/treasury"));
    } catch (e) {
      return fail(e.message);
    }
  },
);

server.registerTool(
  "inject_chat",
  {
    description:
      "Inject a chat message as if a user sent it, to test game commands.",
    inputSchema: { user: z.string(), text: z.string() },
  },
  async ({ user, text }) => {
    try {
      await api("/admin/chat", { user, text });
      return ok();
    } catch (e) {
      return fail(e.message);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[vibe-arena-mcp] stdio listo · arena:", ARENA);
