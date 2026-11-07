import { createCDP } from "./rehearsal/cdp.mjs";
import { rehearseLobby, socket } from "./rehearsal/lobby.mjs";
import { rehearseOverlay } from "./rehearsal/overlay.mjs";
import { rehearseStudio } from "./rehearsal/studio.mjs";
import { rehearsePrivacy } from "./rehearsal/privacy.mjs";
// Disposable local browser rehearsal. No owner .env, credentials, Twitch or cloud calls.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import WebSocket from "ws";
const root = path.resolve(new URL("..", import.meta.url).pathname),
  temp = fs.mkdtempSync(path.join(os.tmpdir(), "va-ui-"));
const runId = "local-ui-" + Date.now();
const evidence = path.join(root, "docs", "evidence"),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const free = () =>
  new Promise((r) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => r(p));
    });
  });
for (const name of [
  "src",
  "public",
  "games",
  "templates",
  "package.json",
  "vibe-arena.config.json",
])
  fs.cpSync(path.join(root, name), path.join(temp, name), {
    recursive: true,
    filter: (p) => !p.includes("/auto-"),
  });
fs.symlinkSync(
  path.join(root, "node_modules"),
  path.join(temp, "node_modules"),
  "dir",
);
const port = await free(),
  debugPort = await free(),
  base = "http://127.0.0.1:" + port;
const env = {
  PATH: process.env.PATH,
  HOME: temp,
  LANG: "C.UTF-8",
  VA_STREAMER_KEY: "local-ui-fixture-key",
};
const server = spawn(
  process.execPath,
  [
    "--experimental-vm-modules",
    "src/server.js",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--game-dir",
    "games/community-grove",
  ],
  { cwd: temp, env, stdio: "ignore" },
);
let browser, cdp;
const checks = [],
  errors = [],
  requests = [],
  violations = [];
const check = (name, ok) => {
  checks.push({ name, ok });
  if (!ok) throw Error(name);
};
const wait = async (fn) => {
  for (let n = 0; n < 100; n++) {
    try {
      const result = await fn();
      if (result) return result;
    } catch {}
    await sleep(100);
  }
  throw Error("Readiness deadline");
};
try {
  await wait(async () => (await fetch(base + "/community/state")).ok);
  const post = async (route, body) => {
    const response = await fetch(base + route, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-streamer-key": env.VA_STREAMER_KEY,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw Error(await response.text());
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  };
  const assetIds = [];
  for (const key of [
    "kenney-background-sky",
    "kenney-background-hills1",
    "kenney-background-tree01",
  ]) {
    const asset = await post("/admin/assets/import", { key });
    if (asset.status === "pending-review")
      await post("/admin/assets/review", {
        id: asset.id,
        approved: true,
        rightsAttested: true,
      });
    assetIds.push(asset.id);
  }
  const reviewed = await post("/admin/game-publication", {
    action: "review",
    gameId: "community-grove",
  });
  await post("/admin/game-publication", {
    action: "publish",
    gameId: "community-grove",
    expectedCodeSha256: reviewed.codeSha256,
    assetIds,
  });
  browser = spawn(
    "chromium",
    [
      "--headless",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=" + debugPort,
      "--user-data-dir=" + path.join(temp, "browser-profile"),
      "about:blank",
    ],
    { env, stdio: "ignore" },
  );
  const target = await wait(async () => {
    const r = await fetch(
      "http://127.0.0.1:" + debugPort + "/json/new?about:blank",
      { method: "PUT" },
    );
    return r.ok ? r.json() : null;
  });
  cdp = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => cdp.once("open", r));
  const { command, evaluate, click, navigate, capture } = await createCDP(cdp, {
    base,
    wait,
    sleep,
    evidence,
    runId,
    errors,
    requests,
    violations,
  });
  await rehearseLobby({
    base,
    navigate,
    wait,
    evaluate,
    check,
    command,
    capture,
  });
  await rehearseOverlay({
    sleep,
    post,
    command,
    navigate,
    wait,
    evaluate,
    check,
    capture,
    base,
  });
  await rehearseStudio({
    navigate,
    check,
    evaluate,
    capture,
    click,
    wait,
    base,
    env,
  });
  await rehearsePrivacy({ navigate, check, evaluate, capture });
  check("no browser JavaScript exception occurred", errors.length === 0);
  check(
    "no Content Security Policy violation was logged",
    violations.length === 0,
  );
  check(
    "credit clients make no HTTP polling requests",
    !requests.some((url) => url.includes("/community/game-credits")),
  );
  fs.writeFileSync(
    path.join(evidence, runId + "-rehearsal.json"),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        kind: "automated-local-Chromium-rehearsal",
        checks,
        errors,
        violations,
        temp,
        limits: [
          "Disposable checkout without owner configuration.",
          "No real Twitch traffic, human gameplay, OBS recording or submission video.",
          "Warm-session controls and interrupted artifact publication UI use mocked HTTP; no real VM or candidate runs.",
          "Maximum-field sidebar shots use synthetic activity and long fallback-banner text in the real overlay DOM, not actual audience or backend-failure evidence.",
          "Lobby 1600x900, overlay 1920x1080 and 1280x720; not a mobile usability claim.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ checks, errors, temp }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
  fs.writeFileSync(
    path.join(evidence, "local-ui-failure-" + Date.now() + ".json"),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        error: error.message,
        checks,
        errors,
        temp,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  socket?.close();
  cdp?.close();
  browser?.kill("SIGTERM");
  server.kill("SIGTERM");
  await sleep(300);
  fs.rmSync(temp, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
