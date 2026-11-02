import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../auth/twitch.js";

export async function loadServerConfig() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const ROOT = path.resolve(__dirname, "../..");
  const PUBLIC = path.join(ROOT, "public");
  const { acquireController } = await import("../controller-lock.js");
  await acquireController(path.join(ROOT, "runtime", "controller.lock"));
  const IDEAS_FILE = path.join(ROOT, "ideas.jsonl");

  const args = process.argv.slice(2);
  const arg = (name, dflt) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : dflt;
  };
  loadEnv(arg("env-file", path.join(ROOT, ".env")));
  const PORT = Number(arg("port", 8420));
  const LISTEN_HOST = arg("host", "0.0.0.0");
  const TWITCH_CHANNEL = arg("twitch", null);
  const KICK_CHANNEL = arg("kick", null);
  const GAME_DIR = path.resolve(ROOT, arg("game-dir", "games/demo"));

  const CONFIG = JSON.parse(
    fs.readFileSync(path.join(ROOT, "vibe-arena.config.json"), "utf8"),
  );
  // env overrides for cloud mode: VA_BASE_URL, VA_API_KEY, VA_MODEL
  if (process.env.VA_BASE_URL)
    CONFIG.generator.baseUrl = process.env.VA_BASE_URL;
  if (process.env.VA_API_KEY) CONFIG.generator.apiKey = process.env.VA_API_KEY;
  if (process.env.VA_MODEL) CONFIG.generator.model = process.env.VA_MODEL;

  if (process.env.VA_EVENTSUB_SECRET)
    CONFIG.monetization.eventsubSecret = process.env.VA_EVENTSUB_SECRET;
  if (process.env.VA_WEBHOOK_SECRET)
    CONFIG.monetization.webhookSecret = process.env.VA_WEBHOOK_SECRET;

  // Synthetic event accounting is opt-in for isolated fixtures only; never provider settlement.
  const simulateEventCredits = process.env.VA_SIMULATE_EVENT_CREDITS === "1";

  return {
    ROOT,
    PUBLIC,
    IDEAS_FILE,
    arg,
    PORT,
    LISTEN_HOST,
    TWITCH_CHANNEL,
    KICK_CHANNEL,
    GAME_DIR,
    CONFIG,
    simulateEventCredits,
  };
}
