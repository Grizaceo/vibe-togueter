// Disposable local Vibe Arena controller for console development/testing.
// Copies the controller source to a temp dir (never the repo), starts it on a
// fixture env, and can drive signed Kick webhook chat. No tunnel, no cloud.
// Usage:
//   node scripts/local-arena.mjs            # start controller, print URL, keep running
//   node scripts/local-arena.mjs chat --user-id 777 --name kick_fan [--mod] "text"
// Env: VA_LOCAL_ARENA_PORT (default 8431). State file: .tmp/local-arena.json.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const arenaRoot = path.resolve(root, "..");
const stateFile = path.join(root, ".tmp", "local-arena.json");
const port = Number(process.env.VA_LOCAL_ARENA_PORT || 8431); // guard:allow-env-credential — disposable test-fixture controller port, not a user credential
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (process.argv[2] === "chat") {
  const { url, kickKey } = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
  const mod = process.argv.includes("--mod");
  const text = process.argv[process.argv.length - 1];
  const raw = JSON.stringify({
    message_id: crypto.randomUUID(),
    broadcaster: { user_id: 1 },
    sender: {
      user_id: Number(arg("--user-id")),
      username: arg("--name"),
      ...(mod ? { identity: { badges: [{ type: "moderator" }] } } : { identity: { badges: [] } }),
    },
    content: text,
  });
  const id = crypto.randomUUID(),
    at = new Date().toISOString();
  const res = await fetch(url + "/webhook/kick", {
    method: "POST",
    headers: {
      "kick-event-type": "chat.message.sent",
      "kick-event-message-id": id,
      "kick-event-message-timestamp": at,
      "kick-event-signature": crypto
        .createSign("RSA-SHA256")
        .update(`${id}.${at}.${raw}`)
        .sign(fs.readFileSync(kickKey, "utf8"), "base64"),
    },
    body: raw,
  });
  console.log("chat", res.status);
  process.exit(res.ok ? 0 : 1);
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "va-arena-"));
for (const name of [
  "src",
  "public",
  "games",
  "templates",
  "scripts",
  "package.json",
  "vibe-arena.config.json",
])
  fs.cpSync(path.join(arenaRoot, name), path.join(temp, name), {
    recursive: true,
    filter: (p) => !p.includes("/auto-"),
  });
fs.symlinkSync(path.join(arenaRoot, "node_modules"), path.join(temp, "node_modules"), "dir");
const config = JSON.parse(
  fs.readFileSync(path.join(temp, "vibe-arena.config.json"), "utf8"),
);
config.features = {
  ...(config.features || {}),
  communityCredit: true,
  approvalDelegation: true,
};
config.kick = { ...(config.kick || {}), broadcasterUserId: 1 };
fs.writeFileSync(
  path.join(temp, "vibe-arena.config.json"),
  JSON.stringify(config, null, 2),
);
const kick = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const kickKey = path.join(temp, "kick-private.pem");
fs.writeFileSync(kickKey, kick.privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
const env = {
  PATH: process.env.PATH, // guard:allow-env-credential — PATH forwarded to the disposable fixture process, not a user credential
  HOME: temp,
  LANG: "C.UTF-8",
  VA_STREAMER_KEY: "local-console-fixture-key",
  VA_ADMIN_TOKEN: "local-console-admin-fixture",
  VA_TUNNEL: "off",
  VA_KICK_PUBKEY: kick.publicKey.export({ type: "spki", format: "pem" }),
  VA_BUILD_MODE: "trusted-local",
};
const server = spawn(
  process.execPath,
  ["--experimental-vm-modules", "src/server.js", "--host", "127.0.0.1", "--port", String(port), "--game-dir", "games/community-grove"],
  { cwd: temp, env, stdio: "inherit" },
);
fs.mkdirSync(path.dirname(stateFile), { recursive: true });
fs.writeFileSync(
  stateFile,
  JSON.stringify({ url: `http://127.0.0.1:${port}`, kickKey, pid: server.pid }),
);
const cleanup = () => {
  try { server.kill("SIGTERM"); } catch {}
  try { fs.rmSync(temp, { recursive: true, force: true }); } catch {}
  process.exit(0);
};
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
for (let i = 0; i < 100; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${port}/admin/status`)).ok) break;
  } catch {}
  await sleep(100);
}
console.log(`local arena ready at http://127.0.0.1:${port} (pid ${server.pid})`);
setInterval(() => {}, 60000);
