// Generator: turns an idea + the SDK contract into a game.js via an LLM.
// Providers are OpenAI-compatible chat endpoints:
//   mode 'local' -> http://<dgx-spark>:11434/v1  (Ollama / vLLM / llama.cpp server)
//   mode 'cloud' -> api.deepseek.com / openrouter.ai / any compatible API
// Cost per generation is metered from token usage against provider pricing,
// or 0 for local (hardware cost is the streamer's, amortized).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SDK_SPEC = fs.readFileSync(path.join(__dirname, 'sdk-prompt.md'), 'utf8');

const PRICING = {
  // USD per 1M tokens [input, output] — edit as prices move
  'deepseek-chat': [0.27, 1.10],
  'deepseek-reasoner': [0.55, 2.19],
  'google/gemini-2.5-flash': [0.30, 2.50],
  'local': [0, 0],
};

export class Generator {
  constructor(config, treasury, log = console.log) {
    this.cfg = config;         // {mode, baseUrl, apiKey, model, maxCostUsd, gameCostUsd}
    this.treasury = treasury;
    this.log = log;
  }

  estimateCost(usage) {
    if (this.cfg.mode === 'local') return 0;
    const [inP, outP] = PRICING[this.cfg.model] || [1, 3];
    return ((usage.prompt_tokens || 0) * inP + (usage.completion_tokens || 0) * outP) / 1e6;
  }

  async generateGame(idea, outDir) {
    if (!this.treasury.canAfford(this.cfg.gameCostUsd)) {
      return { ok: false, reason: `fondo insuficiente ($${this.treasury.balance} < $${this.cfg.gameCostUsd})` };
    }
    const body = {
      model: this.cfg.model,
      messages: [
        { role: 'system', content: SDK_SPEC },
        { role: 'user', content: `Genera un juego para esta idea del chat: "${idea}". Devuelve SOLO el contenido de game.js, sin fences ni explicación.` },
      ],
      temperature: 0.8,
      max_tokens: 8000,
    };
    const res = await fetch(`${this.cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.cfg.apiKey ? { authorization: `Bearer ${this.cfg.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.cfg.timeoutMs || 120_000),
    });
    if (!res.ok) return { ok: false, reason: `LLM ${res.status}: ${await res.text().then(t => t.slice(0, 200))}` };
    const data = await res.json();
    let code = data.choices?.[0]?.message?.content || '';
    code = code.replace(/^```(?:js|javascript)?\n?/m, '').replace(/```\s*$/m, '').trim();
    if (!code.includes('export function tick')) {
      return { ok: false, reason: 'The model did not return a valid game.js' };
    }
    const cost = this.estimateCost(data.usage || {});
    if (cost > this.cfg.maxCostUsd) {
      return { ok: false, reason: `Cost $${cost.toFixed(3)} exceeds the per-game maximum $${this.cfg.maxCostUsd}` };
    }
    if (!this.treasury.spend(cost, { kind: 'game-gen', model: this.cfg.model, idea, tokens: data.usage })) {
      return { ok: false, reason: 'fondo insuficiente al momento de cobrar' };
    }
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'game.js'), code);
    fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify({ idea, model: this.cfg.model, costUsd: cost, usage: data.usage, at: Date.now() }, null, 2));
    return { ok: true, dir: outDir, costUsd: cost, usage: data.usage };
  }
}
