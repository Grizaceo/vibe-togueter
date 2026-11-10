// Candidate source is data only. This module never imports, evaluates, serves or deploys it.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { contributorCredits } from "./contributor-credits.js";
import { communityCredit } from "./community-credit.js";
import { creditManifestFingerprint } from "./creator-assets.js";

const digest = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[a-zA-Z0-9_-]{1,100}$/;
const STATES = new Set([
  "awaiting-artifact",
  "quarantined",
  "testing",
  "reconcile-required",
  "tested",
  "approved",
  "rejected",
  "cancelled",
]);
const terminal = new Set(["rejected", "cancelled"]);
const token = () => crypto.randomBytes(24).toString("hex");
function requireHash(value) {
  if (typeof value !== "string" || !HASH.test(value))
    throw Error("Expected SHA-256.");
  return value;
}
function requireId(value) {
  if (typeof value !== "string" || !ID.test(value))
    throw Error("Expected a bounded identifier.");
  return value;
}
function owner(actor) {
  if (actor?.owner !== true) throw Error("Streamer decision required.");
}
function version(job) {
  return digest(
    JSON.stringify({
      roundId: job.roundId,
      inputHash: job.inputHash,
      codeSha256: job.codeSha256,
      resourceHash: job.resources
        ? creditManifestFingerprint(job.resources)
        : null,
      ...(job.communityCredit
        ? { communityCreditSha256: digest(JSON.stringify(job.communityCredit)) }
        : {}),
    }),
  );
}
function reportValue(report, job) {
  if (
    !report ||
    report.artifactHash !== job.artifactHash ||
    report.testNonce !== job.testNonce
  )
    throw Error("Stale artifact or test attempt.");
  const testVmId = requireId(report.testVmId);
  if (testVmId === job.buildVmId || testVmId === job.runtimeVmId)
    throw Error("Tests require a separate quarantine VM.");
  if (report.isolatedVmAttested !== true)
    throw Error("Operator must attest isolated VM execution.");
  if (
    !Array.isArray(report.checks) ||
    !report.checks.length ||
    report.checks.length > 100
  )
    throw Error("Supply bounded test checks.");
  const checks = report.checks.map((check) => {
    if (
      !check ||
      typeof check.name !== "string" ||
      !check.name.trim() ||
      check.name.length > 160 ||
      typeof check.passed !== "boolean"
    )
      throw Error("Invalid test check.");
    return { name: check.name, passed: check.passed };
  });
  if (
    report.manifest !== undefined &&
    (typeof report.manifest !== "object" ||
      report.manifest === null ||
      Array.isArray(report.manifest)) ||
    (report.manifestError !== undefined &&
      typeof report.manifestError !== "string")
  )
    throw Error("Invalid manifest verdict.");
  return {
    artifactHash: job.artifactHash,
    testNonce: job.testNonce,
    testVmId,
    isolatedVmAttested: true,
    evidenceSha256: requireHash(report.evidenceSha256),
    checks,
    ...(report.manifest !== undefined
      ? { manifest: structuredClone(report.manifest) }
      : {}),
    ...(report.manifestError !== undefined
      ? { manifestError: report.manifestError.slice(0, 64) }
      : {}),
    passed: checks.every((c) => c.passed),
    verification: "operator-attested",
  };
}
function validate(job) {
  requireId(job.id);
  requireId(job.roundId);
  requireHash(job.inputHash);
  requireId(job.buildVmId);
  requireId(job.runtimeVmId);
  requireId(job.agentProfile);
  if (
    job.buildVmId === job.runtimeVmId ||
    !STATES.has(job.state) ||
    !Number.isSafeInteger(job.revision) ||
    job.revision < 1
  )
    throw Error("Invalid quarantine record.");
  if (job.resources) creditManifestFingerprint(job.resources);
  if (job.communityCredit) {
    const credit = communityCredit(job.communityCredit);
    if (
      credit.roundId !== job.roundId ||
      credit.approvedInputHash !== job.inputHash ||
      JSON.stringify(credit) !== JSON.stringify(job.communityCredit)
    )
      throw Error("Community credit integrity failure.");
  }
  if (
    !Array.isArray(job.attempts) ||
    job.attempts.length > 16 ||
    new Set(job.attempts.map((a) => a.nonce)).size !== job.attempts.length
  )
    throw Error("Invalid test attempt history.");
  for (const attempt of job.attempts) {
    if (
      !/^[a-f0-9]{48}$/.test(attempt.nonce) ||
      ![
        "testing",
        "completed",
        "interrupted",
        "cancelled",
        "rejected",
      ].includes(attempt.state)
    )
      throw Error("Invalid test attempt.");
    if (attempt.state === "completed") {
      const report = reportValue(attempt.report, {
        ...job,
        testNonce: attempt.nonce,
      });
      if (
        JSON.stringify(report) !== JSON.stringify(attempt.report) ||
        digest(JSON.stringify(report)) !== attempt.reportHash
      )
        throw Error("Historical test report integrity failure.");
    }
  }
  if (
    job.testNonce &&
    (job.attempts.at(-1)?.nonce !== job.testNonce ||
      (job.state === "testing" && job.attempts.at(-1).state !== "testing"))
  )
    throw Error("Invalid current test attempt.");
  if (job.source !== undefined) {
    if (
      typeof job.source !== "string" ||
      !job.source.trim() ||
      Buffer.byteLength(job.source) > 131072 ||
      digest(job.source) !== job.codeSha256 ||
      version(job) !== job.artifactHash
    )
      throw Error("Quarantine source integrity failure.");
  } else if (
    !["awaiting-artifact", "cancelled", "rejected"].includes(job.state)
  )
    throw Error("Missing quarantined source.");
  if (
    ["testing", "reconcile-required", "tested", "approved"].includes(
      job.state,
    ) &&
    !/^[a-f0-9]{48}$/.test(job.testNonce)
  )
    throw Error("Missing test attempt.");
  if (["tested", "approved"].includes(job.state)) {
    const normalized = reportValue(job.report, job);
    if (
      JSON.stringify(normalized) !== JSON.stringify(job.report) ||
      digest(JSON.stringify(job.report)) !== job.reportHash
    )
      throw Error("Test report integrity failure.");
  }
  if (
    ["tested", "approved"].includes(job.state) &&
    job.attempts.at(-1)?.reportHash !== job.reportHash
  )
    throw Error("Current test history integrity failure.");
  if (
    job.approval?.contributors !== undefined ||
    job.approval?.contributorCreditsSha256 !== undefined
  ) {
    const credits = contributorCredits(job.approval.contributors);
    if (
      !credits ||
      JSON.stringify(credits) !== JSON.stringify(job.approval.contributors) ||
      digest(JSON.stringify(credits)) !==
        requireHash(job.approval.contributorCreditsSha256)
    )
      throw Error("Approved contributor credit integrity failure.");
    if (
      credits.communityCredit &&
      (!job.communityCredit ||
        JSON.stringify(credits.communityCredit) !==
          JSON.stringify(job.communityCredit) ||
        JSON.stringify(credits.ideaAuthors) !==
          JSON.stringify(job.communityCredit.ideaAuthors))
    )
      throw Error("Approved participation credit changed.");
  }
  if (
    job.approval?.by &&
    (typeof job.approval.by.name !== "string" ||
      !job.approval.by.name.trim() ||
      job.approval.by.name.length > 100 ||
      typeof job.approval.by.source !== "string" ||
      !job.approval.by.source.trim() ||
      job.approval.by.source.length > 50)
  )
    throw Error("Invalid artifact approver.");
  if (
    job.state === "approved" &&
    (!job.report.passed ||
      job.approval?.artifactHash !== job.artifactHash ||
      job.approval?.reportHash !== job.reportHash ||
      job.approval?.rightsAttested !== true)
  )
    throw Error("Invalid artifact approval.");
}

export class BuildQuarantine {
  constructor(file) {
    this.file = file;
    this.data = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, "utf8"))
      : { version: 1, jobs: [] };
    if (
      this.data.version !== 1 ||
      !Array.isArray(this.data.jobs) ||
      this.data.jobs.length > 32 ||
      new Set(this.data.jobs.map((j) => j.id)).size !== this.data.jobs.length
    )
      throw Error("Invalid quarantine store; preserve and reconcile it.");
    this.data.jobs.forEach(validate);
    // A pending test cannot become a success just because the controller restarted.
    if (this.data.jobs.some((j) => j.state === "testing"))
      this.change(() => {
        for (const job of this.data.jobs)
          if (job.state === "testing") {
            job.state = "reconcile-required";
            job.attempts.at(-1).state = "interrupted";
            job.revision++;
          }
      });
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + "." + token() + ".tmp";
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
    const before = structuredClone(this.data);
    try {
      const result = fn();
      this.data.jobs.forEach(validate);
      this.save();
      return structuredClone(result);
    } catch (error) {
      this.data = before;
      throw error;
    }
  }
  job(id) {
    const job = this.data.jobs.find((j) => j.id === id);
    if (!job) throw Error("Unknown build ticket.");
    return job;
  }
  // Metadata and source are available only through authenticated local owner routes.
  inspect(id) {
    const job = this.job(id);
    validate(job);
    return structuredClone(job);
  }
  list() {
    return this.data.jobs.map(
      ({ source, resources, report, attempts, ...metadata }) =>
        structuredClone(metadata),
    );
  }
  issue(actor, round, { buildVmId, runtimeVmId, agentProfile }) {
    owner(actor);
    if (!round || round.phase !== "approved" || !round.selected?.length)
      throw Error("Approved community round required.");
    requireId(round.id);
    requireHash(round.approvedInputHash);
    requireId(buildVmId);
    requireId(runtimeVmId);
    requireId(agentProfile);
    if (buildVmId === runtimeVmId)
      throw Error("Build VM must differ from public runtime.");
    if (this.data.jobs.length >= 32)
      throw Error("Quarantine ticket capacity reached; archive explicitly.");
    if (
      this.data.jobs.some(
        (j) => j.roundId === round.id && !terminal.has(j.state),
      )
    )
      throw Error("Round already has a build ticket.");
    const job = {
      id: crypto.randomUUID(),
      roundId: round.id,
      inputHash: round.approvedInputHash,
      resources: structuredClone(round.resourceManifest || null),
      ...(round.credit
        ? { communityCredit: communityCredit(round.credit) }
        : {}),
      buildVmId,
      runtimeVmId,
      agentProfile,
      state: "awaiting-artifact",
      attempts: [],
      revision: 1,
      createdAt: Date.now(),
    };
    return this.change(() => {
      this.data.jobs.push(job);
      return job;
    });
  }
  receive(actor, id, { source, expectedCodeSha256 }) {
    owner(actor);
    const job = this.job(id);
    if (
      typeof source !== "string" ||
      !source.trim() ||
      Buffer.byteLength(source) > 131072
    )
      throw Error("Candidate must be nonempty UTF-8 source, at most 128 KiB.");
    if (digest(source) !== requireHash(expectedCodeSha256))
      throw Error("Candidate source hash mismatch.");
    if (terminal.has(job.state)) throw Error("Ticket is terminal.");
    if (job.source !== undefined) {
      if (job.source !== source)
        throw Error("Artifact is immutable; issue a new ticket.");
      return this.inspect(id); // Safe retry never revokes tests or approvals.
    }
    if (job.state !== "awaiting-artifact")
      throw Error("Ticket is not accepting an artifact.");
    return this.change(() => {
      job.source = source;
      job.codeSha256 = expectedCodeSha256;
      job.artifactHash = version(job);
      job.state = "quarantined";
      job.revision++;
      return job;
    });
  }
  beginTest(actor, id, artifactHash) {
    owner(actor);
    const job = this.job(id);
    if (
      !["quarantined", "reconcile-required", "tested", "approved"].includes(
        job.state,
      ) ||
      artifactHash !== job.artifactHash
    )
      throw Error("Review the current quarantined artifact.");
    if (job.attempts.length >= 16)
      throw Error(
        "Test attempt capacity reached; preserve evidence and issue a replacement ticket.",
      );
    return this.change(() => {
      job.testNonce = token();
      job.attempts.push({
        nonce: job.testNonce,
        state: "testing",
        at: Date.now(),
      });
      job.state = "testing";
      delete job.report;
      delete job.reportHash;
      delete job.approval;
      job.revision++;
      return job;
    });
  }
  recordTest(actor, id, report) {
    owner(actor);
    const job = this.job(id);
    if (job.state !== "testing")
      throw Error(
        "No active quarantine test; restart requires a new test attempt.",
      );
    const normalized = reportValue(report, job);
    return this.change(() => {
      job.report = normalized;
      job.reportHash = digest(JSON.stringify(normalized));
      Object.assign(job.attempts.at(-1), {
        state: "completed",
        report: structuredClone(normalized),
        reportHash: job.reportHash,
      });
      job.state = "tested";
      job.revision++;
      return job;
    });
  }
  approve(
    actor,
    id,
    { artifactHash, reportHash, rightsAttested, contributors },
    round,
  ) {
    owner(actor);
    const job = this.job(id);
    if (
      !["approved", "completed"].includes(round?.phase) ||
      round.id !== job.roundId ||
      round.approvedInputHash !== job.inputHash
    )
      throw Error("Community round approval changed.");
    if (
      job.state !== "tested" ||
      !job.report.passed ||
      artifactHash !== job.artifactHash ||
      reportHash !== job.reportHash ||
      rightsAttested !== true
    )
      throw Error(
        "Review passing tests, exact artifact/report hashes and rights before approval.",
      );
    if (job.report.manifestError)
      throw Error(
        "The candidate's manifest is invalid: " + job.report.manifestError,
      );
    const credits =
      contributors === undefined ? null : contributorCredits(contributors);
    if (contributors !== undefined && !credits)
      throw Error("Record the reviewed contributor metadata.");
    return this.change(() => {
      job.approval = {
        artifactHash,
        reportHash,
        rightsAttested: true,
        at: Date.now(),
        by: {
          name: String(actor.name || "").trim() || "Unrecorded approver",
          source: String(actor.source || "").trim() || "unknown",
        },
        ...(credits
          ? {
              contributors: credits,
              contributorCreditsSha256: digest(JSON.stringify(credits)),
            }
          : {}),
      };
      job.state = "approved";
      job.revision++;
      return job;
    });
  }
  close(actor, id, state) {
    owner(actor);
    const job = this.job(id);
    if (!["cancelled", "rejected"].includes(state) || terminal.has(job.state))
      throw Error("Choose a live ticket and terminal decision.");
    return this.change(() => {
      if (job.state === "testing") job.attempts.at(-1).state = state;
      job.state = state;
      delete job.approval;
      job.revision++;
      return job;
    });
  }
}
