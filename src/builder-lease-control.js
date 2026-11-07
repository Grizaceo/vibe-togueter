// Durable bounded warm deadlines. Atomic hard-link decisions arbitrate renew, claim and close.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const MINUTE = 60000,
  id = (value) =>
    typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
function write(file, value) {
  const tmp = file + "." + crypto.randomUUID() + ".tmp";
  let fd;
  try {
    fd = fs.openSync(tmp, "wx", 0o600);
    fs.writeFileSync(fd, JSON.stringify(value) + "\n");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tmp, file);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}
export class BuilderLeaseControl {
  constructor(
    root,
    name,
    { now = Date.now, beforeDecisionCommit = () => {} } = {},
  ) {
    if (!/^va-build-[a-f0-9]{12}$/.test(name || ""))
      throw Error("Exact builder lease required.");
    Object.assign(this, { root, name, now, beforeDecisionCommit });
    this.dir = path.join(root, "runtime", "builder-leases");
    this.file = path.join(this.dir, name + ".json");
  }
  lease() {
    const v = JSON.parse(fs.readFileSync(this.file, "utf8"));
    if (
      v.name !== this.name ||
      !Number.isSafeInteger(v.requestedAt) ||
      !Number.isFinite(v.expiresAt) ||
      v.expiresAt <= v.requestedAt ||
      v.expiresAt > v.requestedAt + 31 * MINUTE ||
      v.cleanupLeaseVersion !== 2
    )
      throw Error("Invalid builder lease.");
    return v;
  }
  decisionFile(revision) {
    return path.join(
      this.dir,
      this.name + ".decision-" + String(revision).padStart(3, "0") + ".json",
    );
  }
  deadline() {
    const lease = this.lease(),
      maxExpiresAt = lease.maxExpiresAt || lease.expiresAt;
    if (
      !Number.isFinite(maxExpiresAt) ||
      maxExpiresAt < lease.expiresAt ||
      maxExpiresAt > lease.requestedAt + 180 * MINUTE
    )
      throw Error("Invalid warm expiry cap.");
    const s = {
      lease,
      expiresAt: lease.expiresAt,
      maxExpiresAt,
      revision: 0,
      claimedBy: null,
      closed: false,
      stopRequested: false,
    };
    while (fs.existsSync(this.decisionFile(s.revision))) {
      if (s.revision >= 64) throw Error("Lease decision limit exceeded.");
      const file = this.decisionFile(s.revision),
        stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096)
        throw Error("Invalid lease decision file.");
      const d = JSON.parse(fs.readFileSync(file, "utf8"));
      if (
        d.name !== this.name ||
        d.requestedAt !== lease.requestedAt ||
        d.revision !== s.revision ||
        d.previousExpiresAt !== s.expiresAt ||
        d.previousClaimedBy !== s.claimedBy ||
        s.closed
      )
        throw Error("Invalid lease decision chain.");
      if (d.kind === "renew") {
        if (
          s.claimedBy ||
          !lease.warmApprovalId ||
          d.approvalId !== lease.warmApprovalId ||
          !Number.isFinite(d.expiresAt) ||
          d.expiresAt <= s.expiresAt ||
          d.expiresAt > maxExpiresAt
        )
          throw Error("Invalid warm renewal.");
        s.expiresAt = d.expiresAt;
      } else if (d.kind === "claim") {
        if (s.claimedBy || !id(d.jobId)) throw Error("Invalid build claim.");
        s.claimedBy = d.jobId;
      } else if (d.kind === "close") {
        if (!["explicit", "expiry", "provider-pause"].includes(d.reason))
          throw Error("Invalid close decision.");
        s.closed = true;
        s.stopRequested = d.reason !== "expiry";
      } else throw Error("Unknown lease decision.");
      s.revision++;
    }
    return s;
  }
  bind({ approvalId, maxMinutes }) {
    const s = this.deadline(),
      lease = s.lease;
    if (
      !id(approvalId) ||
      !Number.isInteger(maxMinutes) ||
      maxMinutes < 30 ||
      maxMinutes > 180
    )
      throw Error("Invalid approved warm limit.");
    if (lease.warmApprovalId && lease.warmApprovalId !== approvalId)
      throw Error("Warm session belongs to another decision.");
    if (s.closed || s.claimedBy)
      throw Error("Guest cleanup or build has begun.");
    const maxExpiresAt = Math.max(
      lease.expiresAt,
      lease.requestedAt + maxMinutes * MINUTE,
    );
    if (lease.maxExpiresAt && lease.maxExpiresAt !== maxExpiresAt)
      throw Error("Approved warm maximum is immutable.");
    write(this.file, { ...lease, warmApprovalId: approvalId, maxExpiresAt });
    return this.summary();
  }
  summary() {
    const s = this.deadline();
    return {
      expiresAt: s.expiresAt,
      maxExpiresAt: s.maxExpiresAt,
      remainingSeconds: Math.max(
        0,
        Math.floor((s.expiresAt - this.now()) / 1000),
      ),
      closing: s.closed,
      stopRequested: s.stopRequested,
      claimedBy: s.claimedBy,
      canExtend:
        !!s.lease.warmApprovalId &&
        !s.closed &&
        !s.claimedBy &&
        s.expiresAt > this.now() + MINUTE &&
        s.expiresAt < s.maxExpiresAt,
    };
  }
  closing() {
    return this.deadline().closed;
  }
  commit(s, action) {
    if (s.revision >= 64) throw Error("Lease decision limit reached.");
    const file = path.join(
        this.dir,
        this.name + ".proposal-" + crypto.randomUUID() + ".json",
      ),
      d = {
        name: this.name,
        requestedAt: s.lease.requestedAt,
        revision: s.revision,
        previousExpiresAt: s.expiresAt,
        previousClaimedBy: s.claimedBy,
        ...action,
      };
    let fd;
    try {
      fd = fs.openSync(file, "wx", 0o600);
      fs.writeFileSync(fd, JSON.stringify(d) + "\n");
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;
      this.beforeDecisionCommit(action, s);
      if (
        action.kind === "renew" &&
        (s.expiresAt <= this.now() + MINUTE || action.expiresAt <= this.now())
      )
        throw Error("Expiry raced renewal; extension is not confirmed.");
      // link is an atomic create-if-absent. A suspended producer cannot overwrite a winning close/claim.
      try {
        fs.linkSync(file, this.decisionFile(s.revision));
        return true;
      } catch (error) {
        if (error.code === "EEXIST") return false;
        throw error;
      }
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }
  extend() {
    const s = this.deadline();
    if (
      !s.lease.warmApprovalId ||
      s.closed ||
      s.claimedBy ||
      s.expiresAt <= this.now() + MINUTE
    )
      throw Error(
        "Extend before the final minute and before cleanup or a build starts.",
      );
    if (s.expiresAt >= s.maxExpiresAt)
      throw Error("Approved warm maximum reached.");
    const next = Math.min(s.maxExpiresAt, s.expiresAt + 15 * MINUTE);
    this.commit(s, {
      kind: "renew",
      approvalId: s.lease.warmApprovalId,
      expiresAt: next,
    });
    const latest = this.deadline();
    if (
      latest.closed ||
      latest.claimedBy ||
      latest.expiresAt < next ||
      this.now() >= latest.expiresAt
    )
      throw Error(
        "Cleanup, build or expiry raced renewal; extension is not confirmed.",
      );
    return this.summary();
  }
  claim(jobId) {
    if (!id(jobId)) throw Error("Invalid build claim.");
    for (let n = 0; n < 64; n++) {
      const s = this.deadline();
      if (s.closed || s.expiresAt <= this.now())
        throw Error("Builder lease is closing or expired.");
      if (s.claimedBy) {
        if (s.claimedBy !== jobId) throw Error("Builder already claimed.");
        return this.summary();
      }
      if (this.commit(s, { kind: "claim", jobId })) return this.summary();
    }
    throw Error("Lease claim contention.");
  }
  beginClose({ explicit = false, allowClaimed = false, pausedByProvider = false } = {}) {
    const reason = pausedByProvider
      ? "provider-pause"
      : explicit
        ? "explicit"
        : "expiry";
    for (let n = 0; n < 64; n++) {
      const s = this.deadline();
      if (s.closed) return true;
      if (explicit && !pausedByProvider && s.claimedBy && !allowClaimed)
        throw Error("Guest belongs to a build; use job cancellation.");
      if (!explicit && !pausedByProvider && this.now() < s.expiresAt)
        return false;
      if (this.commit(s, { kind: "close", reason })) return true;
    }
    throw Error("Lease close contention.");
  }
}
export function builderDeadline(root, state) {
  return new BuilderLeaseControl(root, state.name).deadline().expiresAt;
}
