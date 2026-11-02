import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { encodeMessage } from "../traffic.js";
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const compact = (view) => JSON.parse(encodeMessage({ t: "state", view })).view;

export async function testArtifact(worker, ticket, { signal, job }, vmId) {
  worker.authorized();
  const state = worker.journal(job);
  if (!state?.buildDestroyed || state.test)
    throw Error("Build cleanup or test journal requires reconciliation.");
  const inventory = await worker.json(
      ["sandbox", "list", "--all", "--limit", "100"],
      { signal },
    ),
    name = "va-stest-" + crypto.randomBytes(6).toString("hex");
  state.test = {
    name,
    requestedAt: worker.now(),
    expiresAt: worker.now() + 300000,
    id: null,
    existingIds: inventory.map((v) => v.id),
    creationRequested: false,
    cleanupUnit: "vibe-arena-studio-test-" + name.slice(-12),
  };
  worker.save(job, state);
  signal.throwIfAborted();
  let creationSent = false;
  try {
    // Arm a recurring external reconciler before create: it can recover a lost create reply by unique name.
    await worker.run(
      "systemd-run",
      [
        "--user",
        "--unit=" + state.test.cleanupUnit,
        "--on-active=5m",
        "--on-unit-active=30s",
        "--timer-property=AccuracySec=1s",
        process.execPath,
        path.join(worker.root, "scripts", "cleanup-studio-worker.mjs"),
        job.id,
      ],
      { timeout: 10000, signal },
    );
    await worker.run(
      "systemctl",
      ["--user", "is-active", state.test.cleanupUnit + ".timer"],
      { timeout: 10000, signal },
    );
    signal.throwIfAborted();
    if (worker.now() >= state.test.expiresAt)
      throw Error("Test lease expired before VM creation.");
    state.test.creationRequested = true;
    worker.save(job, state);
    signal.throwIfAborted();
    if (worker.now() >= state.test.expiresAt)
      throw Error("Test lease expired before VM creation.");
    creationSent = true;
    const created = await worker.json(
      [
        "sandbox",
        "create",
        "--shape",
        "s-1vcpu-2gb",
        "--rootfs",
        "devbox:1",
        "--name",
        name,
        "--auto-pause",
        "2m",
        "--egress",
        "blocked.invalid",
      ],
      { signal },
    );
    if (!vmId(created.id) || state.test.existingIds.includes(created.id))
      throw Error("Fresh test VM identity required.");
    state.test.id = created.id;
    worker.save(job, state);
    const vm = worker.ownTest(
      await worker.json(["sandbox", "get", created.id], { signal }),
      state.test,
    );
    signal.throwIfAborted();
    if (worker.now() >= state.test.expiresAt)
      throw Error("Test lease expired before candidate transfer.");
    const dir = worker.file(job),
      source = path.join(dir, "candidate.js"),
      taskFile = path.join(dir, "test-task.json");
    fs.writeFileSync(source, ticket.source, { mode: 0o600 });
    fs.writeFileSync(
      taskFile,
      JSON.stringify({
        codeSha256: ticket.codeSha256,
        artifactHash: ticket.artifactHash,
        testNonce: ticket.testNonce,
        buildVmId: ticket.buildVmId,
        runtimeVmId: ticket.runtimeVmId,
        testVmId: vm.id,
        resources: ticket.resources,
      }) + "\n",
      { mode: 0o600 },
    );
    for (const [local, remote] of [
      [source, "/workspace/candidate/game.js"],
      [path.join(worker.root, "src", "gamehost.js"), "/workspace/gamehost.mjs"],
      [
        path.join(worker.root, "scripts", "vm-sdk-check.mjs"),
        "/workspace/check.mjs",
      ],
      [taskFile, "/workspace/task.json"],
    ])
      await worker.cli(["sandbox", "push", vm.id, local, remote], { signal });
    for (const asset of ticket.resources?.assets || []) {
      if (
        !/^[a-zA-Z0-9_-]{1,100}$/.test(asset.id) ||
        !/^\/curated\/[a-z0-9-]+\/[a-zA-Z0-9_-]+\.png$/.test(asset.sourceURL)
      )
        throw Error("Invalid resource path");
      const file = path.join(worker.root, "public", asset.sourceURL);
      if (
        fs.realpathSync(file) !== path.resolve(file) ||
        sha(fs.readFileSync(file)) !== asset.expectedContentSha256
      )
        throw Error("Approved resource bytes changed");
      await worker.cli(
        [
          "sandbox",
          "push",
          vm.id,
          file,
          "/workspace/assets/" + asset.id + ".png",
        ],
        { signal },
      );
    }
    await worker.managed(
      vm.id,
      "cd /workspace; VA_ISOLATED_GUEST=1 timeout --signal=TERM --kill-after=5s 30s node --experimental-vm-modules check.mjs",
      job,
      state,
      "testProcess",
      { signal, maxMs: 45000 },
    );
    const output = await worker.cli(
        ["sandbox", "exec", vm.id, "--", "cat", "/workspace/result.json"],
        { signal },
      ),
      result = JSON.parse(output);
    if (
      result.execution !== "separate-quarantine-vm" ||
      result.testVmId !== vm.id ||
      result.buildVmId !== job.buildVmId ||
      result.codeSha256 !== ticket.codeSha256 ||
      result.artifactHash !== ticket.artifactHash ||
      result.testNonce !== ticket.testNonce ||
      !Array.isArray(result.checks) ||
      result.checks.length !== 9 ||
      result.checks.some(
        (c) => typeof c.name !== "string" || typeof c.passed !== "boolean",
      ) ||
      result.passed !== result.checks.every((c) => c.passed)
    )
      throw Error("Malformed or stale test receipt.");
    await worker.destroyTest(job, state);
    const evidenceSha256 = sha(output);
    return {
      kind: worker.kind,
      cleanupConfirmed: true,
      report: {
        artifactHash: ticket.artifactHash,
        testNonce: ticket.testNonce,
        testVmId: vm.id,
        isolatedVmAttested: true,
        evidenceSha256,
        checks: result.checks,
      },
      preview: compact(result.frame),
      evidence: {
        kind: "real-separate-createos-protocol-tests",
        testVmId: vm.id,
        buildVmId: job.buildVmId,
        evidenceSha256,
        checks: result.checks,
        limitations: [
          "Trusted SDK protocol checks only; independent human gameplay is not established.",
        ],
      },
    };
  } catch (error) {
    if (!creationSent) {
      state.test.abandoned = true;
      worker.save(job, state);
    }
    throw error;
  }
}
