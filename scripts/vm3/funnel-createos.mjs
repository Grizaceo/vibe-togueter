// Deploys the standalone funnel (src/funnel/main.js) into a CreateOS sandbox
// with --ingress, and tears it down. Journals runtime/vm3/funnel.json (0600,
// atomic) so the controller can find the public URL and vault secret.
// Provider output is never retained: cli errors keep sizes and sha256 only.
// Usage: node scripts/vm3/funnel-createos.mjs up [--kick-test-key] | down | status
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execute = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const JOURNAL = path.join(ROOT, "runtime", "vm3", "funnel.json");
const DIAGNOSTIC = path.join(ROOT, "runtime", "vm3", "funnel.diagnostic.json");
const KICK_KEY_FILE = path.join(ROOT, "runtime", "vm3", "kick-test-key.pem");
const SHAPE = "s-0.5vcpu-1gb";
const ROOTFS = "devbox:1";
const AUTO_PAUSE = "3h";
const PROBE_MS = 180000;
const DOWN_BUDGET = { polls: 30, pollMs: 2000 }; // ~60 s
const TERMINAL = new Set(["destroyed", "deleted", "missing", "not-found", "terminated"]);
const NOT_FOUND = /not.?found|404|no such|missing/i;
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function writeJson0600(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + "." + crypto.randomUUID() + ".tmp";
  let fd;
  try {
    fd = fs.openSync(tmp, "wx", 0o600);
    fs.writeFileSync(fd, JSON.stringify(value, null, 2) + "\n");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tmp, file);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

export function readJournal(file = JOURNAL) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

// Same cli discipline as vm-builder-preflight: raw provider stdout/stderr is
// never kept — diagnostics record sizes and sha256 only.
export function makeCli(run, diagnosticFile = DIAGNOSTIC) {
  return async (args, options = {}) => {
    try {
      const result = await run("createos", args, {
        timeout: options.timeout ?? 60000,
        maxBuffer: 4 * 1024 * 1024,
        ...options,
      });
      return result.stdout;
    } catch (error) {
      const hash = (value) =>
        crypto.createHash("sha256").update(value || "").digest("hex");
      try {
        fs.mkdirSync(path.dirname(diagnosticFile), { recursive: true });
        fs.writeFileSync(
          diagnosticFile,
          JSON.stringify({
            operation: args.slice(0, 3).join(" "),
            exit: error.code ?? null,
            signal: error.signal ?? null,
            killed: !!error.killed,
            stdoutBytes: Buffer.byteLength(error.stdout || ""),
            stdoutSha256: hash(error.stdout),
            stderrBytes: Buffer.byteLength(error.stderr || ""),
            stderrSha256: hash(error.stderr),
            at: new Date().toISOString(),
          }) + "\n",
          { mode: 0o600 },
        );
      } catch {}
      throw Error(
        `createos ${args.slice(0, 3).join(" ")} failed (exit ${error.code ?? "?"})`,
      );
    }
  };
}

const cliJson = async (cli, args, options) =>
  JSON.parse(await cli(args, options));

// `sandbox get` JSON shape for the ingress URL is not documented; look for
// the common field names first, then fall back to the observed pattern
// sb-<x> -> https://<x>-8080.app.sb.createos.sh.
export function ingressUrl(get, id) {
  const urlFrom = (value, depth = 0) => {
    if (depth > 2 || value == null) return null;
    if (typeof value === "string") {
      if (/^https?:\/\//.test(value)) return value;
      if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(:\d+)?$/i.test(value))
        return "https://" + value;
      return null;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = urlFrom(item, depth + 1);
        if (found) return found;
      }
      return null;
    }
    if (typeof value === "object") {
      for (const key of ["url", "uri", "endpoint", "address", "host", "origin"]) {
        const found = urlFrom(value[key], depth + 1);
        if (found) return found;
      }
    }
    return null;
  };
  for (const key of [
    "ingress_url", "ingressUrl", "public_url", "publicUrl", "url",
    "https_url", "http_url", "endpoint", "endpoints", "ingress", "ports",
    "http", "https",
  ]) {
    const found = urlFrom(get?.[key]);
    if (found) return found;
  }
  const match = /^sb-(.+)$/.exec(String(id));
  if (match) return `https://${match[1]}-8080.app.sb.createos.sh`;
  throw Error("Could not discover the sandbox ingress URL.");
}

// rm --force then poll `get` until a terminal state (or not-found). Returns
// the terminal status, or null when the budget ran out.
export async function destroySandbox(cli, id, { polls = DOWN_BUDGET.polls, pollMs = DOWN_BUDGET.pollMs, sleep = defaultSleep } = {}) {
  await cli(["sandbox", "rm", id, "--force"], { timeout: 60000 }).catch(() => {});
  for (let attempt = 0; attempt < polls; attempt++) {
    if (attempt > 0) await sleep(pollMs);
    try {
      const got = await cliJson(cli, ["sandbox", "get", id], { timeout: 30000 });
      const status = String(got?.status || "").toLowerCase();
      if (got?.id !== id || TERMINAL.has(status)) return status || "missing";
    } catch (error) {
      if (NOT_FOUND.test(String(error?.message || error))) return "missing";
    }
  }
  return null;
}

export async function funnelUp({
  run = execute,
  root = ROOT,
  journalFile = JOURNAL,
  diagnosticFile = DIAGNOSTIC,
  kickKeyFile = KICK_KEY_FILE,
  kickTestKey = false,
  log = (line) => console.log(line),
  sleep = defaultSleep,
  fetchImpl = fetch,
  now = Date.now,
} = {}) {
  const prior = readJournal(journalFile);
  if (prior && prior.phase !== "destroyed")
    throw Error(`A funnel already exists (phase ${prior.phase}); run 'down' first.`);
  const cli = makeCli(run, diagnosticFile);
  const name = "va-funnel-" + crypto.randomBytes(3).toString("hex");
  const state = {
    version: 1,
    phase: "creating",
    name,
    kickTestKey: !!kickTestKey,
    createdAt: new Date(now()).toISOString(),
  };
  let id = null;
  try {
    const created = await cliJson(
      cli,
      [
        "sandbox", "create",
        "--shape", SHAPE,
        "--rootfs", ROOTFS,
        "--name", name,
        "--ingress",
        "--auto-pause", AUTO_PAUSE,
      ],
      { timeout: 120000 },
    );
    id = created?.id;
    if (typeof id !== "string" || !/^sb-/.test(id))
      throw Error("Provider did not return a sandbox id.");
    state.id = id;
    writeJson0600(journalFile, state); // journal the id immediately

    const nodeOut = await cli(["sandbox", "exec", id, "--", "node", "--version"], {
      timeout: 30000,
    });
    const nodeVersion = String(nodeOut).trim().slice(0, 40);
    const nodeMajor = Number(/v?(\d+)\./.exec(nodeVersion)?.[1]);
    if (!Number.isInteger(nodeMajor) || nodeMajor < 22) {
      state.node = nodeVersion;
      throw Error(
        `devbox:1 node is ${nodeVersion || "missing"}; guest-agent needs node >= 22 (global WebSocket).`,
      );
    }
    state.node = nodeVersion;

    // Ship the funnel: package.json (type: module), src, public, node_modules/ws.
    if (!fs.existsSync(path.join(root, "node_modules", "ws", "package.json")))
      throw Error("node_modules/ws missing; run npm ci first.");
    const tarLocal = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "va-funnel-tar-")),
      "va-funnel.tar",
    );
    try {
      await execute("tar", [
        "-cf", tarLocal, "-C", root,
        "package.json", "src", "public", "node_modules/ws",
      ], { timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
      await cli(["sandbox", "push", id, tarLocal, "/tmp/va-funnel.tar"], {
        timeout: 300000,
      });
    } finally {
      fs.rmSync(path.dirname(tarLocal), { recursive: true, force: true });
    }
    await cli(["sandbox", "exec", id, "--", "mkdir", "-p", "/opt/va"], {
      timeout: 30000,
    });
    await cli(["sandbox", "exec", id, "--", "tar", "-xf", "/tmp/va-funnel.tar", "-C", "/opt/va"], {
      timeout: 120000,
    });

    const secret = crypto.randomBytes(32).toString("base64url");
    const secretLocal = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "va-funnel-secret-")),
      "funnel.secret",
    );
    try {
      fs.writeFileSync(secretLocal, secret + "\n", { mode: 0o600 });
      await cli(["sandbox", "push", id, secretLocal, "/opt/va/funnel.secret"], {
        timeout: 60000,
      });
    } finally {
      fs.rmSync(path.dirname(secretLocal), { recursive: true, force: true });
    }

    const env = [
      "PORT=8080",
      "VA_FUNNEL_SECRET_FILE=/opt/va/funnel.secret",
    ];
    if (kickTestKey) {
      const pair = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
      const privatePem = pair.privateKey.export({ type: "pkcs8", format: "pem" });
      const publicPem = pair.publicKey.export({ type: "spki", format: "pem" });
      fs.mkdirSync(path.dirname(kickKeyFile), { recursive: true });
      fs.writeFileSync(kickKeyFile, privatePem, { mode: 0o600 });
      const pubLocal = path.join(
        fs.mkdtempSync(path.join(os.tmpdir(), "va-kick-pub-")),
        "kick.pub",
      );
      try {
        fs.writeFileSync(pubLocal, publicPem, { mode: 0o600 });
        await cli(["sandbox", "push", id, pubLocal, "/opt/va/kick.pub"], {
          timeout: 60000,
        });
      } finally {
        fs.rmSync(path.dirname(pubLocal), { recursive: true, force: true });
      }
      env.push("VA_KICK_PUBKEY_FILE=/opt/va/kick.pub");
    }

    await cliJson(
      cli,
      [
        "sandbox", "process", "start", id,
        "--cwd", "/opt/va",
        ...env.flatMap((entry) => ["--env", entry]),
        "--", "node", "src/funnel/main.js",
      ],
      { timeout: 60000 },
    );

    const got = await cliJson(cli, ["sandbox", "get", id], { timeout: 30000 });
    const url = ingressUrl(got, id).replace(/\/+$/, "");
    const parsed = new URL(url);
    state.url = url;
    state.wsUrl = (parsed.protocol === "https:" ? "wss://" : "ws://") + parsed.host;
    state.host = parsed.host;
    state.secret = secret;
    state.phase = "up";
    state.updatedAt = new Date(now()).toISOString();
    writeJson0600(journalFile, state);

    // Probe until the funnel page answers (ingress propagation takes a while).
    const deadline = now() + PROBE_MS;
    let ready = false;
    while (now() < deadline) {
      try {
        const res = await fetchImpl(url + "/", { signal: AbortSignal.timeout(10000) });
        if (res.ok && (await res.text()).includes("Open your invite link")) {
          ready = true;
          break;
        }
      } catch {}
      await sleep(2000);
    }
    if (!ready) throw Error("Funnel did not answer its invite page within 180 s.");
    log(JSON.stringify({ kind: "funnel-up", phase: "up", host: state.host }));
    return state;
  } catch (error) {
    if (id) {
      const terminal = await destroySandbox(cli, id).catch(() => null);
      state.phase = "destroyed";
      state.destroyedAt = new Date(now()).toISOString();
      state.terminalStatus = terminal;
      state.error = String(error?.message || error).slice(0, 200);
      writeJson0600(journalFile, state);
      if (!terminal)
        throw Error(
          `${state.error} (sandbox destruction also unconfirmed; reconcile ${id} manually)`,
        );
    }
    throw error;
  }
}

export async function funnelDown({
  run = execute,
  journalFile = JOURNAL,
  diagnosticFile = DIAGNOSTIC,
  log = (line) => console.log(line),
  sleep = defaultSleep,
  now = Date.now,
} = {}) {
  const state = readJournal(journalFile);
  if (!state?.id) {
    log(JSON.stringify({ kind: "funnel-down", phase: "none" }));
    return null;
  }
  if (state.phase === "destroyed") return state;
  const cli = makeCli(run, diagnosticFile);
  const terminal = await destroySandbox(cli, state.id, { sleep });
  if (!terminal)
    throw Error(`Funnel sandbox destruction not confirmed within budget; retry 'down'.`);
  state.phase = "destroyed";
  state.terminalStatus = terminal;
  state.destroyedAt = new Date(now()).toISOString();
  delete state.secret;
  writeJson0600(journalFile, state);
  log(JSON.stringify({ kind: "funnel-down", phase: "destroyed" }));
  return state;
}

export function funnelStatus({ journalFile = JOURNAL, log = (line) => console.log(line) } = {}) {
  const state = readJournal(journalFile);
  log(
    JSON.stringify({
      kind: "funnel-status",
      phase: state?.phase || "none",
      id: state?.id || null,
      url: state?.phase === "up" ? state.url : null,
    }),
  );
  return state;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  const run = async () => {
    if (command === "up")
      await funnelUp({ kickTestKey: process.argv.includes("--kick-test-key") });
    else if (command === "down") await funnelDown({});
    else if (command === "status") funnelStatus({});
    else {
      console.error("usage: funnel-createos.mjs up [--kick-test-key] | down | status");
      process.exitCode = 2;
    }
  };
  run().catch((error) => {
    console.error("funnel-createos: " + (error?.message || error));
    process.exitCode = 1;
  });
}
