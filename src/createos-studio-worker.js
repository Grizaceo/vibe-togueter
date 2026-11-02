import {
  execute,
  STUDIO_MODEL,
  providerCli,
  providerJson,
  managedProcess,
} from "./studio-worker/provider.js";
import { buildArtifact } from "./studio-worker/build.js";
import { testArtifact } from "./studio-worker/test.js";
import {
  destroyBuild,
  destroyTest,
  cleanupTest,
  cleanup,
} from "./studio-worker/cleanup.js";
import { BuilderLeaseControl } from "./builder-lease-control.js";
// Trusted operator-side adapter. Provider CLI holds host auth; only fresh guest auth is used by Codex.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  VMBuilderPreflight,
  validateBuildSession,
  TRIAL_PROFILE,
} from "./vm-builder-preflight.js";
const sameRules = (a, b) =>
  Array.isArray(a) &&
  a.length === b.length &&
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const vmId = (id) => typeof id === "string" && /^sb-[a-z0-9]{20,40}$/.test(id);
export { STUDIO_MODEL } from "./studio-worker/provider.js";
export class CreateOSStudioWorker {
  constructor(
    root,
    {
      approvalId = null,
      vmBudgetMinor = 0,
      run = execute,
      now = Date.now,
    } = {},
  ) {
    Object.assign(this, { root, approvalId, vmBudgetMinor, run, now });
    this.kind = "createos-subscription";
  }
  authorized() {
    if (
      typeof this.approvalId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(this.approvalId) ||
      !Number.isSafeInteger(this.vmBudgetMinor) ||
      this.vmBudgetMinor < 25 ||
      this.vmBudgetMinor > 300
    )
      throw Error(
        "A separately confirmed remaining VM allocation and approval ID are required.",
      );
  }
  async cli(args, options) {
    return providerCli(this, args, options);
  }
  async json(args, options) {
    return providerJson(this, args, options);
  }
  session() {
    return new VMBuilderPreflight(
      path.join(this.root, "runtime", "builder-session.json"),
      { run: this.run },
    );
  }
  file(job) {
    if (!/^[a-f0-9-]{36}$/.test(job.id)) throw Error("Invalid operator job ID");
    return path.join(this.root, "runtime", "studio-worker", job.id);
  }
  journal(job) {
    const file = path.join(this.file(job), "provider.json");
    if (!fs.existsSync(file)) return null;
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    if (
      value.version !== 1 ||
      value.jobId !== job.id ||
      value.buildVmId !== job.buildVmId ||
      !/^va-build-[a-f0-9]{12}$/.test(value.buildName || "") ||
      !Number.isSafeInteger(value.buildRequestedAt) ||
      value.buildCleanupUnit !==
        "vibe-arena-builder-" + value.buildName.slice(-12)
    )
      throw Error("Worker ownership journal mismatch.");
    return value;
  }
  save(job, state) {
    const dir = this.file(job);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const file = path.join(dir, "provider.json"),
      tmp = file + "." + crypto.randomUUID() + ".tmp";
    let fd;
    try {
      fd = fs.openSync(tmp, "wx", 0o600);
      fs.writeFileSync(fd, JSON.stringify(state) + "\n");
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;
      fs.renameSync(tmp, file);
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  }
  async ready({ jobId = null, signal } = {}) {
    this.authorized();
    const builder = this.session();
    if (!builder.state) throw Error("Prepare a fresh builder lease first.");
    const leaseControl = new BuilderLeaseControl(this.root, builder.state.name),
      leaseState = leaseControl.deadline();
    if (
      leaseState.closed ||
      (leaseState.claimedBy && leaseState.claimedBy !== jobId)
    )
      throw Error("Builder lease is closing or belongs to another build.");
    const expiresAt = leaseState.expiresAt,
      unit = validateBuildSession({ ...builder.state, expiresAt }, this.now());
    const lease = JSON.parse(
      fs.readFileSync(
        path.join(
          this.root,
          "runtime",
          "builder-leases",
          builder.state.name + ".json",
        ),
        "utf8",
      ),
    );
    if (
      builder.state.cleanupLeaseVersion !== 2 ||
      lease.cleanupLeaseVersion !== 2 ||
      lease.name !== builder.state.name ||
      lease.requestedAt !== builder.state.requestedAt ||
      lease.cleanupUnit !== unit ||
      lease.creationRequested !== true
    )
      throw Error("A pre-armed independent builder cleanup lease is required.");
    if (builder.state.claimedBy && builder.state.claimedBy !== jobId)
      throw Error("This builder lease already belongs to a job.");
    await this.run("systemctl", ["--user", "is-active", unit + ".timer"], {
      timeout: 10000,
      signal,
    });
    const vm = builder.owned(
      await this.json(["sandbox", "get", builder.state.id], { signal }),
    );
    if (vm.status !== "running" || !sameRules(vm.egress, TRIAL_PROFILE.egress))
      throw Error(
        "Builder VM is not running with its exact reviewed isolation policy.",
      );
    const probe =
      "const cp=require('node:child_process'),os=require('node:os');let authenticated=false;try{cp.execFileSync('codex',['-c','forced_login_method=\"chatgpt\"','login','status'],{env:{PATH:process.env.PATH,HOME:os.homedir(),CODEX_HOME:'/opt/vibe-codex'},stdio:'pipe',timeout:15000});authenticated=true;}catch{}console.log(JSON.stringify({authenticated,method:'chatgpt-subscription'}));";
    const status = await this.json(
      ["sandbox", "exec", vm.id, "--", "node", "-e", probe],
      { signal },
    );
    if (
      status.authenticated !== true ||
      status.method !== "chatgpt-subscription"
    )
      throw Error("Complete fresh guest subscription login first.");
    const latest = leaseControl.deadline();
    if (latest.closed || (latest.claimedBy && latest.claimedBy !== jobId))
      throw Error("Builder cleanup or claim changed during readiness check.");
    validateBuildSession(
      { ...builder.state, expiresAt: latest.expiresAt },
      this.now(),
    );
    return {
      buildVmId: vm.id,
      expiresAt: latest.expiresAt,
      model: STUDIO_MODEL,
      approvalId: this.approvalId,
    };
  }
  async managed(vm, command, job, state, field, options) {
    return managedProcess(this, vm, command, job, state, field, options);
  }
  async build(job, options) {
    return buildArtifact(this, job, options);
  }
  async destroyBuild(job, state) {
    return destroyBuild(this, job, state);
  }
  async test(ticket, options) {
    return testArtifact(this, ticket, options, vmId);
  }
  validateTestJournal(record) {
    if (
      !/^va-stest-[a-f0-9]{12}$/.test(record?.name || "") ||
      !Number.isSafeInteger(record.requestedAt) ||
      record.cleanupUnit !==
        "vibe-arena-studio-test-" + record.name.slice(-12) ||
      !Array.isArray(record.existingIds) ||
      record.existingIds.some((id) => !vmId(id))
    )
      throw Error("Invalid test ownership journal.");
  }
  ownTest(vm, record) {
    this.validateTestJournal(record);
    if (
      !vmId(vm?.id) ||
      vm.id !== record.id ||
      vm.name !== record.name ||
      record.existingIds.includes(vm.id) ||
      !Number.isFinite(Date.parse(vm.created_at)) ||
      Date.parse(vm.created_at) < record.requestedAt - 5000 ||
      vm.rootfs !== "devbox:1" ||
      vm.shape !== "s-1vcpu-2gb" ||
      vm.ingress_enabled !== false ||
      !sameRules(vm.egress, ["blocked.invalid"])
    )
      throw Error(
        "Test VM ownership/settings mismatch; no destructive operation.",
      );
    return vm;
  }
  async destroyTest(job, state) {
    return destroyTest(this, job, state);
  }
  async cleanupTest(job) {
    return cleanupTest(this, job);
  }
  async cleanup(job) {
    return cleanup(this, job);
  }
}
