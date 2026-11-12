// Standalone funnel entrypoint for the CreateOS deploy
// (scripts/vm3/funnel-createos.mjs). Secrets arrive via files, never argv
// or environment values: VA_FUNNEL_SECRET_FILE is required,
// VA_KICK_PUBKEY_FILE optional. Env: PORT (default 8080).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFunnel } from "./index.js";
import { KickKeyCache } from "../chat/kick-webhook.js";

export function readSecretFile(file, what) {
  if (!file) return null;
  const value = fs.readFileSync(file, "utf8").trim();
  if (!value) throw Error(`${what} file is empty: ${file}`);
  return value;
}

export function funnelMain(env = process.env) {
  const secretFile = env.VA_FUNNEL_SECRET_FILE;
  if (!secretFile)
    throw Error("VA_FUNNEL_SECRET_FILE is required (path to the vault secret).");
  const vaultSecret = readSecretFile(secretFile, "VA_FUNNEL_SECRET_FILE");
  if (vaultSecret.length < 16)
    throw Error("VA_FUNNEL_SECRET_FILE must hold at least 16 chars.");
  const kickPublicKey = readSecretFile(env.VA_KICK_PUBKEY_FILE, "VA_KICK_PUBKEY_FILE");
  const port = Number(env.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw Error("PORT must be an integer 1-65535.");
  const funnel = createFunnel({
    vaultSecret,
    kickKeys: kickPublicKey
      ? new KickKeyCache({ staticKey: kickPublicKey })
      : undefined,
    log: (kind, fields) =>
      console.log(JSON.stringify({ kind, ...(fields || {}) })),
  });
  const server = funnel.server.listen(port, "0.0.0.0", () => {
    console.log(JSON.stringify({ kind: "listen", port }));
  });
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    funnel.close();
    server.once("close", () => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref?.();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  return { funnel, server };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  funnelMain();
