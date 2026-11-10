// Private owner controls for one preapproved builder. Preparation never approves inputs or calls a model.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { VMBuilderPreflight, TRIAL_PROFILE } from "./vm-builder-preflight.js";
import { BuilderLeaseControl } from "./builder-lease-control.js";
const execute = promisify(execFile),
  decision = (id) =>
    typeof id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(id);
export class BuilderWarmSessions {
  constructor(
    root,
    {
      enabled = false,
      approvalId = null,
      vmBudgetMinor = 0,
      maxWarmMinutes = 60,
      decisionUsed = () => false,
      run = execute,
      now = Date.now,
    } = {},
  ) {
    Object.assign(this, {
      root,
      enabled: enabled === true,
      approvalId,
      vmBudgetMinor,
      maxWarmMinutes,
      decisionUsed,
      run,
      now,
    });
    this.preparing = false;
    this.heartbeating = false;
    this.file = path.join(root, "runtime", "builder-warm-decisions.json");
  }
  authorize() {
    if (!this.enabled) throw Error("Builder preparation is disabled.");
    if (
      !decision(this.approvalId) ||
      !Number.isInteger(this.vmBudgetMinor) ||
      this.vmBudgetMinor < 25 ||
      this.vmBudgetMinor > 300 ||
      !Number.isInteger(this.maxWarmMinutes) ||
      this.maxWarmMinutes < 30 ||
      this.maxWarmMinutes > 180
    )
      throw Error(
        "Configure a unique owner decision, VM reservation and bounded warm limit first.",
      );
  }
  session() {
    return new VMBuilderPreflight(
      path.join(this.root, "runtime", "builder-session.json"),
      { run: this.run },
    );
  }
  control(state) {
    return new BuilderLeaseControl(this.root, state.name, { now: this.now });
  }
  decisions() {
    const d = fs.existsSync(this.file)
      ? JSON.parse(fs.readFileSync(this.file, "utf8"))
      : [];
    if (
      !Array.isArray(d) ||
      d.length > 128 ||
      d.some((x) => !decision(x.approvalId) || !Number.isFinite(x.at))
    )
      throw Error("Invalid preparation history.");
    return d;
  }
  summary() {
    if (!this.enabled)
      return { enabled: false, phase: "disabled", canPrepare: false };
    if (this.preparing)
      return { enabled: true, phase: "preparing", canPrepare: false };
    try {
      this.authorize();
      const s = this.session().state,
        used =
          this.decisionUsed() ||
          this.decisions().some((x) => x.approvalId === this.approvalId);
      if (!s || s.phase === "released")
        return { enabled: true, phase: "none", canPrepare: !used };
      const policy = this.control(s).lease();
      if (policy.warmApprovalId !== this.approvalId)
        return { enabled: true, phase: "other-session", canPrepare: false };
      const timing = this.control(s).summary();
      return {
        enabled: true,
        phase:
          s.claimedBy || timing.claimedBy
            ? "owned-by-job"
            : timing.remainingSeconds === 0
              ? "expired"
              : "prepared",
        ...timing,
        lastReadyCheckAt: this.lastReadyCheckAt || null,
        readinessWarning: this.readinessWarning || null,
        canPrepare: false,
        canClose: s.phase === "awaiting-login" && !s.claimedBy,
      };
    } catch {
      return { enabled: true, phase: "inspection-required", canPrepare: false };
    }
  }
  privateSummary() {
    return {
      ...this.summary(),
      instructionsFile: fs.existsSync(
        path.join(this.root, "runtime", "codex-vm-device-login.txt"),
      )
        ? path.join(this.root, "runtime", "codex-vm-device-login.txt")
        : null,
    };
  }
  async helper(action) {
    try {
      const result = await this.run(
        process.execPath,
        [path.join(this.root, "scripts", "builder-login.mjs"), action],
        { cwd: this.root, timeout: 90000, maxBuffer: 65536 },
      );
      return JSON.parse(result.stdout);
    } catch {
      throw Error(
        "Builder preparation/control failed; preserve the exact session for reconciliation.",
      );
    }
  }
  async prepare() {
    this.authorize();
    if (this.preparing) throw Error("Builder preparation is already running.");
    const history = this.decisions();
    if (this.decisionUsed())
      throw Error(
        "This spending decision already has a build; no replacement.",
      );
    if (history.some((x) => x.approvalId === this.approvalId))
      throw Error(
        "This preparation decision is already consumed; no automatic replacement.",
      );
    if (history.length >= 128)
      throw Error("Archive preparation decisions before another session.");
    const current = this.session().state;
    if (current && current.phase !== "released")
      throw Error(
        "Close or reconcile the existing guest before preparing another.",
      );
    this.preparing = true;
    let prepared = false;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + ".tmp",
        fd = fs.openSync(tmp, "w", 0o600);
      try {
        fs.writeFileSync(
          fd,
          JSON.stringify([
            ...history,
            {
              approvalId: this.approvalId,
              at: this.now(),
              maxWarmMinutes: this.maxWarmMinutes,
              vmBudgetMinor: this.vmBudgetMinor,
            },
          ]) + "\n",
        );
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(tmp, this.file);
      await this.helper("prepare");
      prepared = true;
      const state = this.session().state;
      if (state?.phase !== "awaiting-login" || state.claimedBy)
        throw Error("Fresh unclaimed prepared session required.");
      this.control(state).bind({
        approvalId: this.approvalId,
        maxMinutes: this.maxWarmMinutes,
      });
    } catch (error) {
      if (prepared) {
        try {
          await this.helper("release");
        } catch {}
      }
      throw error;
    } finally {
      this.preparing = false;
    }
    return this.privateSummary();
  }
  owned({ allowClosing = false } = {}) {
    this.authorize();
    const builder = this.session(),
      state = builder.state;
    if (state?.phase !== "awaiting-login" || state.claimedBy)
      throw Error(
        "Session is unavailable or already belongs to a build; use job cancellation.",
      );
    const lease = this.control(state).deadline();
    if (lease.lease.warmApprovalId !== this.approvalId)
      throw Error("Guest belongs to another preparation decision.");
    if (lease.claimedBy)
      throw Error("Guest belongs to a build; use job cancellation.");
    if (lease.closed && !allowClosing) throw Error("Guest cleanup has begun.");
    return builder;
  }
  assertUnclaimed(builder) {
    const current = this.owned();
    if (
      current.state.id !== builder.state.id ||
      current.state.name !== builder.state.name
    )
      throw Error("Prepared guest changed.");
  }
  async verify(builder) {
    const state = builder.state;
    await this.run(
      "systemctl",
      ["--user", "is-active", state.cleanupUnit + ".timer"],
      { timeout: 10000 },
    );
    const vm = builder.owned(
      JSON.parse(await builder.cli(["sandbox", "get", state.id])),
    );
    if (vm.status === "paused") {
      // Provider pause is only a cost fuse: destroy the guest, never resume it.
      this.readinessWarning =
        "The provider paused the guest (its cost fuse); it is destroyed, never resumed. A new preparation needs a new owner decision.";
      this.control(state).beginClose({ pausedByProvider: true });
      await this.helper("release");
      const error = Error(
        "Prepared guest was paused by the provider and destroyed; it is never resumed.",
      );
      error.providerPaused = true;
      throw error;
    }
    if (vm.status !== "running")
      throw Error("Prepared guest is not available.");
    this.assertUnclaimed(builder);
    return vm;
  }
  async extend() {
    const builder = this.owned();
    await this.verify(builder);
    this.control(builder.state).extend();
    await this.verify(builder);
    if (this.control(builder.state).closing())
      throw Error(
        "Cleanup raced extension; keeping the guest is not confirmed.",
      );
    return this.privateSummary();
  }
  async close() {
    const builder = this.owned({ allowClosing: true });
    this.control(builder.state).beginClose({ explicit: true });
    await this.helper("release");
    return this.privateSummary();
  }
  async heartbeat() {
    if (!this.enabled || this.preparing || this.heartbeating) return false;
    const summary = this.summary();
    if (
      summary.phase !== "prepared" ||
      summary.remainingSeconds < 60 ||
      summary.stopRequested
    )
      return false;
    this.heartbeating = true;
    try {
      const builder = this.owned(),
        vm = await this.verify(builder);
      if (
        JSON.stringify([...(vm.egress || [])].sort()) !==
        JSON.stringify([...TRIAL_PROFILE.egress].sort())
      )
        throw Error("Warm guest egress changed.");
      this.assertUnclaimed(builder);
      await builder.cli([
        "sandbox",
        "exec",
        vm.id,
        "--",
        "node",
        "-e",
        'process.stdout.write("warm")',
      ]);
      this.lastReadyCheckAt = this.now();
      this.readinessWarning = null;
      return true;
    } catch (error) {
      if (!error.providerPaused)
        this.readinessWarning =
          "Readiness check failed; the guest may be unavailable. Check before building.";
      throw error;
    } finally {
      this.heartbeating = false;
    }
  }
}
