import fs from "node:fs";
import path from "node:path";
import { BuilderWarmSessions } from "../builder-warm-sessions.js";
import { StudioBuilds } from "../studio-builds.js";
import { CreateOSStudioWorker } from "../createos-studio-worker.js";
import { IdeaRounds } from "../idea-rounds.js";
import { BuildQuarantine } from "../build-quarantine.js";
import { Treasury } from "../treasury.js";
import { Generator } from "../generator.js";
import { buildPolicy, localBuildPermission } from "../build-policy.js";

export function createConstruction({ ROOT, CONFIG, IDEAS_FILE, feed, loadGameDir }) {
const treasury = new Treasury(path.join(ROOT, "treasury.jsonl"), {
  onChange: (e) => {
    if (e.kind === "deposit")
      feed(
        "system",
        `Demo build credits +${e.amountUsd.toFixed(2)} (${e.meta?.source || "manual"}); no payment received.`,
      );
  },
});
const generator = new Generator(CONFIG.generator, treasury, console.log);
let generating = false;
const executionPolicy = buildPolicy(CONFIG.build);
const ideaRounds = new IdeaRounds(
  path.join(ROOT, "runtime", "idea-rounds.json"),
  { settings: CONFIG.community?.rounds || {} },
);
ideaRounds.recoverInterrupted();
const buildQuarantine = new BuildQuarantine(
  path.join(ROOT, "runtime", "build-quarantine.json"),
);
const studioBuilds = new StudioBuilds(
  path.join(ROOT, "runtime", "studio-builds.json"),
  {
    enabled:
      executionPolicy.mode === "cloud-vm" &&
      CONFIG.build?.studioWorker?.enabled === true,
    adapter: new CreateOSStudioWorker(ROOT, CONFIG.build?.studioWorker || {}),
    rounds: ideaRounds,
    quarantine: buildQuarantine,
    evidenceDir: path.join(ROOT, "docs", "evidence"),
    onChange: (job) => {
      if (job)
        feed("system", "Isolated build: " + job.phase + ". " + job.message);
    },
  },
);
const builderWarm = new BuilderWarmSessions(ROOT, {
  ...CONFIG.build?.studioWorker,
  decisionUsed: () =>
    studioBuilds.data.jobs.some(
      (j) => j.approvalId === CONFIG.build?.studioWorker?.approvalId,
    ),
  enabled:
    executionPolicy.mode === "cloud-vm" &&
    CONFIG.build?.studioWorker?.enabled === true &&
    CONFIG.build?.studioWorker?.prewarmEnabled === true,
});
const builderWarmHeartbeat = setInterval(() => {
  void builderWarm.heartbeat().catch(() => {});
}, 60000);
let roundStorageHealthy = true;
function tickRounds() {
  try {
    ideaRounds.tick();
    roundStorageHealthy = true;
    return true;
  } catch {
    if (roundStorageHealthy)
      console.error(
        "Round storage unavailable; pending decisions are retained.",
      );
    roundStorageHealthy = false;
    return false;
  }
}

function requireNoPendingArtifact() {
  studioBuilds.assertRoundCanAdvance();
}

function readIdeas() {
  if (!fs.existsSync(IDEAS_FILE)) return [];
  return fs
    .readFileSync(IDEAS_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function generateFromIdea(idea, grant) {
  const permission = localBuildPermission(executionPolicy);
  if (!permission.ok) {
    feed("system", permission.reason);
    return permission;
  }
  if (!ideaRounds.buildPermission(idea, grant))
    return {
      ok: false,
      code: "round_approval_required",
      reason: "A matching streamer-approved round is required.",
    };
  if (generating)
    return { ok: false, reason: "A build is already in progress" };
  ideaRounds.beginBuild(idea, grant);
  generating = true;
  feed(
    "system",
    `Building game: "${idea}" (${CONFIG.generator.mode}/${CONFIG.generator.model})`,
  );
  try {
    const slug = `auto-${Date.now().toString(36)}`;
    const dir = path.join(ROOT, "games", slug);
    let r;
    try {
      r = await generator.generateGame(idea, dir);
    } catch (e) {
      r = { ok: false, reason: `Provider error: ${e.message}` };
    }
    if (r.ok) {
      ideaRounds.finishBuild(grant, true);
      await loadGameDir(dir);
      feed("system", `New game built ($${r.costUsd.toFixed(3)}): "${idea}"`);
      return { ok: true, game: slug, costUsd: r.costUsd };
    }
    ideaRounds.finishBuild(grant, false);
    feed("system", `Build failed: ${r.reason}`);
    return r;
  } finally {
    generating = false;
  }
}

// Community construction waits for a round decision and an isolated worker.
// A funded latest-message loop must not bypass the streamer's selection.
function startRoundTicks() {
  setInterval(tickRounds, 1000);
}

  return {
    treasury,
    executionPolicy,
    ideaRounds,
    buildQuarantine,
    studioBuilds,
    builderWarm,
    builderWarmHeartbeat,
    tickRounds,
    requireNoPendingArtifact,
    readIdeas,
    generateFromIdea,
    startRoundTicks,
    isGenerating: () => generating,
  };
}
