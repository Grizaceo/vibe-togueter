// Durable controller orchestration. Candidate bytes remain data in BuildQuarantine.
import { contributorCredits } from "./contributor-credits.js";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const active = new Set([
  "queued",
  "building",
  "quarantined",
  "testing",
  "cancel-requested",
  "reconcile-required",
]);
const phases = new Set([
  ...active,
  "tested",
  "tests-failed",
  "failed",
  "cancelled",
  "reviewed-publication",
]);
const actor = {
  owner: true,
  name: "isolated-worker-supervisor",
  source: "operator-worker",
};
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const validId = (value) =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
function validate(job) {
  if (
    !validId(job.id) ||
    !validId(job.ticketId) ||
    !validId(job.roundId) ||
    !validId(job.buildVmId) ||
    !phases.has(job.phase) ||
    !/^[a-f0-9]{64}$/.test(job.approvedInputHash) ||
    typeof job.idea !== "string" ||
    job.idea.length > 100000 ||
    !Number.isSafeInteger(job.at) ||
    !Array.isArray(job.history)
  )
    throw Error("Invalid studio build journal; preserve and reconcile.");
}
export class StudioBuilds {
  constructor(
    file,
    {
      enabled = false,
      adapter = null,
      rounds,
      quarantine,
      evidenceDir,
      now = Date.now,
      onChange = () => {},
    } = {},
  ) {
    Object.assign(this, {
      file,
      enabled: enabled === true,
      adapter,
      rounds,
      quarantine,
      evidenceDir,
      now,
      onChange,
    });
    this.running = null;
    this.dispatching = false;
    this.readyState = null;
    this.data = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, "utf8"))
      : { version: 1, jobs: [] };
    if (
      this.data.version !== 1 ||
      !Array.isArray(this.data.jobs) ||
      this.data.jobs.length > 16 ||
      new Set(this.data.jobs.map((j) => j.id)).size !== this.data.jobs.length ||
      new Set(this.data.jobs.map((j) => j.ticketId)).size !==
        this.data.jobs.length
    )
      throw Error("Invalid studio build store.");
    this.data.jobs.forEach(validate);
    if (
      this.data.jobs.some(
        (j) => active.has(j.phase) && j.phase !== "reconcile-required",
      )
    )
      this.change(() => {
        for (const j of this.data.jobs)
          if (active.has(j.phase))
            this.set(
              j,
              "reconcile-required",
              "Controller restarted; reconcile exact VM identities before another run.",
            );
      });
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + "." + crypto.randomUUID() + ".tmp";
    let fd;
    try {
      fd = fs.openSync(tmp, "wx", 0o600);
      fs.writeFileSync(fd, JSON.stringify(this.data) + "\n");
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;
      fs.renameSync(tmp, this.file);
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  }
  change(fn) {
    const previous = structuredClone(this.data);
    let result;
    try {
      result = fn();
      this.data.jobs.forEach(validate);
      this.save();
    } catch (error) {
      this.data = previous;
      throw error;
    }
    try {
      this.onChange(this.public());
    } catch {}
    return structuredClone(result);
  }
  set(job, phase, message) {
    job.phase = phase;
    job.history.push({ at: this.now(), phase, message });
  }
  job(id) {
    const job = this.data.jobs.find((j) => j.id === id);
    if (!job) throw Error("Unknown studio build.");
    return job;
  }
  update(id, phase, message, fields = {}) {
    return this.change(() => {
      const job = this.job(id);
      Object.assign(job, fields);
      this.set(job, phase, message);
      return job;
    });
  }
  public() {
    const job = this.data.jobs.at(-1);
    return job
      ? {
          id: job.id,
          ticketId: job.ticketId,
          roundId: job.roundId,
          phase: job.phase,
          at: job.at,
          message: job.history.at(-1)?.message,
          adapter: job.adapter,
          codeSha256: job.codeSha256 || null,
          artifactHash: job.artifactHash || null,
          reportHash: job.reportHash || null,
          cleanupConfirmed: job.cleanup?.confirmed === true,
          liveRuntime: false,
        }
      : null;
  }
  status() {
    return {
      enabled: this.enabled,
      workerConnected: !!(
        this.enabled &&
        this.readyState &&
        this.readyState.expiresAt > this.now() + 7 * 60000 &&
        this.now() - this.readyState.checkedAt < 60000
      ),
      adapter: this.adapter?.kind || null,
      job: this.public(),
    };
  }
  assertRoundCanAdvance() {
    const id = this.rounds.current()?.id;
    if (
      this.data.jobs.some(
        (j) =>
          j.roundId === id && (active.has(j.phase) || j.phase === "tested"),
      )
    )
      throw Error(
        "Approve the exact artifact or cancel/reconcile this build before opening another round.",
      );
  }
  async check() {
    if (!this.enabled || !this.adapter)
      throw Error("Isolated studio worker is disabled.");
    this.readyState = null;
    const ready = await this.adapter.ready();
    if (
      !validId(ready.buildVmId) ||
      !Number.isFinite(ready.expiresAt) ||
      ready.expiresAt <= this.now() + 7 * 60000
    )
      throw Error("Fresh authenticated worker lease required.");
    this.readyState = { ...ready, checkedAt: this.now() };
    return this.status();
  }
  async dispatch(expected) {
    if (!this.enabled || !this.adapter)
      throw Error("Isolated studio worker is disabled.");
    if (
      this.dispatching ||
      this.running ||
      this.data.jobs.some((j) => active.has(j.phase))
    )
      throw Error("A worker or uncertain cleanup already owns the build slot.");
    if (this.data.jobs.length >= 16)
      throw Error(
        "Archive completed build evidence explicitly before another job.",
      );
    this.dispatching = true;
    let ticket, job;
    try {
      await this.check();
      if (
        this.readyState.approvalId &&
        this.data.jobs.some((j) => j.approvalId === this.readyState.approvalId)
      )
        throw Error(
          "This bounded spending approval already has a job; obtain a new explicit allocation before another attempt.",
        );
      const round = this.rounds.public(),
        idea = round?.selected
          .map((id) => round.ideas.find((i) => i.id === id).text)
          .join("\n\n");
      if (!this.rounds.buildPermission(idea, expected))
        throw Error("Dispatch requires the current exact approved inputs.");
      // This increment tests bundled reviewed image bytes only, never arbitrary downloads.
      if (
        round.resourceManifest?.assets.some(
          (a) =>
            a.origin !== "curated-public-source" ||
            !/^\/curated\/[a-z0-9-]+\/[a-zA-Z0-9_-]+\.png$/.test(a.sourceURL),
        )
      )
        throw Error("Worker requires reviewed bundled resource bytes.");
      ticket = this.quarantine.issue(actor, round, {
        buildVmId: this.readyState.buildVmId,
        runtimeVmId: "reviewed-publication-only",
        agentProfile: "codex-gpt-6_1-terra-subscription",
      });
      job = {
        id: crypto.randomUUID(),
        ticketId: ticket.id,
        roundId: round.id,
        approvedInputHash: round.approvedInputHash,
        idea,
        resources: structuredClone(round.resourceManifest),
        buildVmId: this.readyState.buildVmId,
        adapter: this.adapter.kind,
        approvalId: this.readyState.approvalId || null,
        phase: "queued",
        at: this.now(),
        history: [],
      };
      this.change(() => {
        this.set(job, "queued", "Approved inputs queued for the separate VM.");
        this.data.jobs.push(job);
        return job;
      });
      this.rounds.beginBuild(idea, expected);
      const controller = new AbortController();
      this.running = { id: job.id, controller, promise: null };
      this.running.promise = this.execute(job.id, controller.signal);
      return this.public();
    } catch (error) {
      if (ticket) {
        try {
          this.closeTicket(ticket.id, "cancelled");
        } catch {}
        if (job && this.data.jobs.some((j) => j.id === job.id))
          try {
            this.update(
              job.id,
              "cancelled",
              "Dispatch did not start; no model call.",
            );
          } catch {}
      }
      throw error;
    } finally {
      this.dispatching = false;
    }
  }
  closeTicket(id, state) {
    const current = this.quarantine.inspect(id);
    return ["cancelled", "rejected"].includes(current.state)
      ? current
      : this.quarantine.close(actor, id, state);
  }
  async execute(id, signal) {
    let failure = null,
      passed = false;
    const interrupted = () => {
      signal.throwIfAborted();
      if (this.job(id).phase === "cancel-requested")
        throw Error("Cancellation requested");
    };
    try {
      this.update(id, "building", "Codex construction in the isolated VM.");
      interrupted();
      const built = await this.adapter.build(structuredClone(this.job(id)), {
        signal,
      });
      interrupted();
      if (
        built.vmId !== this.job(id).buildVmId ||
        built.kind !== this.adapter.kind ||
        built.cleanupConfirmed !== true
      )
        throw Error("Construction identity or cleanup was not verified.");
      const received = this.quarantine.receive(actor, this.job(id).ticketId, {
        source: built.source,
        expectedCodeSha256: built.codeSha256,
      });
      this.update(
        id,
        "quarantined",
        "Candidate is inert; preparing separate-VM protocol tests.",
        {
          codeSha256: received.codeSha256,
          artifactHash: received.artifactHash,
          construction: built.evidence,
        },
      );
      interrupted();
      const attempt = this.quarantine.beginTest(
        actor,
        received.id,
        received.artifactHash,
      );
      this.update(id, "testing", "Protocol tests in a distinct VM.");
      const tested = await this.adapter.test(attempt, {
        signal,
        job: structuredClone(this.job(id)),
      });
      interrupted();
      if (tested.kind !== this.adapter.kind || tested.cleanupConfirmed !== true)
        throw Error("Test execution or cleanup was not verified.");
      const result = this.quarantine.recordTest(
        actor,
        received.id,
        tested.report,
      );
      passed = result.report.passed;
      this.update(
        id,
        "testing",
        "Tests returned; confirming all managed guests are destroyed.",
        {
          reportHash: result.reportHash,
          testEvidence: tested.evidence,
          preview: tested.preview || null,
        },
      );
    } catch {
      failure = signal.aborted ? "cancelled" : "failed";
    } finally {
      let cleanup;
      try {
        cleanup = await this.adapter.cleanup(structuredClone(this.job(id)));
      } catch {
        cleanup = { confirmed: false };
      }
      try {
        const job = this.job(id);
        if (cleanup?.confirmed !== true) {
          this.update(
            id,
            "reconcile-required",
            "VM cleanup is uncertain; no replacement or retry is allowed.",
            { cleanup: { confirmed: false } },
          );
          if (this.rounds.current()?.phase === "building")
            this.rounds.recoverInterrupted();
        } else {
          const cancelled = signal.aborted || job.phase === "cancel-requested";
          if (cancelled || failure) {
            this.closeTicket(
              job.ticketId,
              cancelled ? "cancelled" : "rejected",
            );
            this.finishRound(job, false);
            this.update(
              id,
              cancelled ? "cancelled" : "failed",
              cancelled
                ? "Cancelled after confirmed guest destruction."
                : "Build/test failed; no local fallback or automatic retry.",
              { cleanup },
            );
          } else {
            this.finishRound(job, true);
            this.update(
              id,
              passed ? "tested" : "tests-failed",
              passed
                ? "Separate-VM checks passed; review exact source/report before approval."
                : "Separate-VM checks failed; artifact cannot be approved.",
              { cleanup },
            );
          }
        }
      } catch {
        try {
          this.update(
            id,
            "reconcile-required",
            "Persistence or round reconciliation needs operator attention.",
          );
        } catch {}
      }
      this.readyState = null;
      if (this.running?.id === id) this.running = null;
    }
  }
  finishRound(job, ok) {
    const current = this.rounds.current();
    if (
      current?.id === job.roundId &&
      current.approvedInputHash === job.approvedInputHash &&
      current.phase === "building"
    )
      this.rounds.finishBuild(
        { roundId: job.roundId, approvedInputHash: job.approvedInputHash },
        ok,
      );
  }
  async cancel(id) {
    const job = this.job(id);
    if (job.phase === "reconcile-required")
      throw Error("Reconcile unknown guest state before cancelling.");
    if (this.running?.id === id) {
      this.update(
        id,
        "cancel-requested",
        "Cancellation requested; waiting for confirmed guest destruction.",
      );
      this.running.controller.abort();
      return this.public();
    }
    if (["cancelled", "failed"].includes(job.phase)) return this.public();
    this.closeTicket(job.ticketId, "cancelled");
    this.update(
      id,
      "cancelled",
      "Artifact cancelled; no runtime was deployed.",
    );
    return this.public();
  }
  async reconcile(id) {
    const job = this.job(id);
    if (job.phase !== "reconcile-required" || this.running)
      throw Error("No stopped uncertain job to reconcile.");
    const cleanup = await this.adapter.cleanup(structuredClone(job));
    if (cleanup?.confirmed !== true)
      throw Error("Provider terminal destruction is still unconfirmed.");
    this.closeTicket(job.ticketId, "cancelled");
    const round = this.rounds.current();
    if (round?.id === job.roundId) {
      if (round.phase === "building") this.finishRound(job, false);
      else if (round.phase === "reconcile-required") this.rounds.cancel(actor);
    }
    this.update(
      id,
      "cancelled",
      "Exact managed guests confirmed destroyed; cancelled without retry.",
      { cleanup },
    );
    return this.public();
  }
  inspect(id) {
    const job = this.job(id);
    return {
      job: structuredClone(job),
      ticket: this.quarantine.inspect(job.ticketId),
    };
  }
  publish(id, expected, owner) {
    const job = this.job(id);
    if (
      !["tested", "reviewed-publication"].includes(job.phase) ||
      job.cleanup?.confirmed !== true
    )
      throw Error("A fully tested, cleaned job is required.");
    const round = this.rounds.public();
    if (
      round?.id !== job.roundId ||
      round.phase !== "completed" ||
      this.rounds.inputHash() !== job.approvedInputHash
    )
      throw Error("Matching completed approved inputs required.");
    let ticket = this.quarantine.inspect(job.ticketId);
    const participation = ticket.communityCredit || round.credit;
    if (!participation) throw Error("Approved input attribution is missing.");
    const artists = [
      ...new Map(
        (ticket.resources?.assets || []).map((a) => [
          a.creator.name + "|" + a.creator.website,
          { name: a.creator.name, url: a.creator.website },
        ]),
      ).values(),
    ];
    const contributors = contributorCredits({
        gameAuthors: expected.gameAuthors,
        ideaAuthors: participation.ideaAuthors,
        ...(artists.length
          ? { artAuthors: artists }
          : { artNote: "Code-drawn art; no external image assets selected." }),
        communityCredit: participation,
      }),
      contributorCreditsSha256 = sha(JSON.stringify(contributors));
    if (ticket.state !== "approved")
      ticket = this.quarantine.approve(
        owner,
        job.ticketId,
        { ...expected, contributors },
        round,
      );
    else if (
      expected.artifactHash !== ticket.artifactHash ||
      expected.reportHash !== ticket.reportHash ||
      expected.rightsAttested !== true ||
      ticket.approval.contributorCreditsSha256 !== contributorCreditsSha256
    )
      throw Error(
        "Review the exact current artifact, report and approved creator credit metadata.",
      );
    const publication = {
      kind: "reviewed-isolated-artifact-evidence",
      at: new Date(this.now()).toISOString(),
      adapter: job.adapter,
      roundId: job.roundId,
      inputHash: job.approvedInputHash,
      codeSha256: ticket.codeSha256,
      artifactHash: ticket.artifactHash,
      reportHash: ticket.reportHash,
      communityCredit: ticket.communityCredit || null,
      contributors,
      contributorCreditsSha256,
      manifest: ticket.resources || null,
      artifactApproval: ticket.approval,
      construction: job.construction,
      tests: job.testEvidence,
      cleanup: job.cleanup,
      candidateExecutedOnHost: false,
      liveRuntime: false,
      limitations: [
        "Local reviewed publication evidence, not a deployed game.",
        "Protocol checks do not establish human gameplay quality.",
      ],
    };
    fs.mkdirSync(this.evidenceDir, { recursive: true });
    const file = path.join(this.evidenceDir, "studio-build-" + id + ".json"),
      bytes = JSON.stringify(publication, null, 2) + "\n";
    if (fs.existsSync(file)) {
      const previous = JSON.parse(fs.readFileSync(file));
      if (
        previous.artifactHash !== ticket.artifactHash ||
        previous.reportHash !== ticket.reportHash ||
        previous.contributorCreditsSha256 !== contributorCreditsSha256
      )
        throw Error("Existing publication evidence differs; preserve it.");
    } else fs.writeFileSync(file, bytes, { flag: "wx" });
    this.update(
      id,
      "reviewed-publication",
      "Exact artifact approved; reviewed evidence saved. No live runtime.",
      {
        publicationFile: path.basename(file),
        publicationSha256: sha(fs.readFileSync(file)),
      },
    );
    return { ...this.public(), publicationFile: path.basename(file) };
  }
}
