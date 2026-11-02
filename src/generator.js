// Legacy trusted-local generator for OpenAI-compatible chat endpoints.
// The default cloud-vm build policy uses Studio instead of this adapter.
// Usage-based amounts are demo estimates, not settled provider bills.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SDK_SPEC = fs.readFileSync(path.join(__dirname, "sdk-prompt.md"), "utf8");

const PRICING = {
  // Historical USD/1M-token estimates [input, output], not live rates or spending caps.
  "deepseek-chat": [0.27, 1.1],
  "deepseek-reasoner": [0.55, 2.19],
  "google/gemini-2.5-flash": [0.3, 2.5],
  local: [0, 0],
};

export class Generator {
  constructor(config, treasury, log = console.log) {
    this.cfg = config; // {mode, baseUrl, apiKey, model, maxCostUsd, gameCostUsd}
    this.treasury = treasury;
    this.log = log;
  }

  estimateCost(usage) {
    if (this.cfg.mode === "local") return 0;
    const [inP, outP] = PRICING[this.cfg.model] || [1, 3];
    return (
      ((usage.prompt_tokens || 0) * inP +
        (usage.completion_tokens || 0) * outP) /
      1e6
    );
  }

  async generateGame(idea, outDir) {
    if (!this.treasury.canAfford(this.cfg.gameCostUsd)) {
      return {
        ok: false,
        reason: `Insufficient demo credits ($${this.treasury.balance} < $${this.cfg.gameCostUsd})`,
      };
    }
    const body = {
      model: this.cfg.model,
      messages: [
        { role: "system", content: SDK_SPEC },
        {
          role: "user",
          content: `Build a game with English UI for this chat idea: "${idea}". Return ONLY game.js contents, without fences or explanation.`,
        },
      ],
      temperature: 0.8,
      max_tokens: 8000,
    };
    const res = await fetch(`${this.cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.cfg.apiKey
          ? { authorization: `Bearer ${this.cfg.apiKey}` }
          : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.cfg.timeoutMs || 120_000),
    });
    if (!res.ok)
      return {
        ok: false,
        reason: `LLM ${res.status}: ${await res.text().then((t) => t.slice(0, 200))}`,
      };
    const data = await res.json();
    let code = data.choices?.[0]?.message?.content || "";
    code = code
      .replace(/^```(?:js|javascript)?\n?/m, "")
      .replace(/```\s*$/m, "")
      .trim();
    if (!code.includes("export function tick")) {
      return { ok: false, reason: "The model did not return a valid game.js" };
    }
    const cost = this.estimateCost(data.usage || {});
    if (cost > this.cfg.maxCostUsd) {
      return {
        ok: false,
        reason: `Cost $${cost.toFixed(3)} exceeds the per-game maximum $${this.cfg.maxCostUsd}`,
      };
    }
    if (
      !this.treasury.spend(cost, {
        kind: "game-gen",
        model: this.cfg.model,
        idea,
        tokens: data.usage,
      })
    ) {
      return {
        ok: false,
        reason: "Insufficient demo credits when recording usage",
      };
    }
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "game.js"), code);
    fs.writeFileSync(
      path.join(outDir, "meta.json"),
      JSON.stringify(
        {
          idea,
          model: this.cfg.model,
          costUsd: cost,
          usage: data.usage,
          at: Date.now(),
        },
        null,
        2,
      ),
    );
    return { ok: true, dir: outDir, costUsd: cost, usage: data.usage };
  }
}
