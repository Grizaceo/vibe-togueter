// Grants expire on restart and require a fresh trusted Twitch mod tag at approval time.
export class ApprovalDelegation {
  constructor({ enabled = false, now = Date.now } = {}) {
    this.enabled = enabled === true;
    this.now = now;
    this.grant = null;
  }
  owner(actor) {
    if (
      actor?.owner !== true ||
      !["twitch", "streamer-ui"].includes(actor.source)
    )
      throw Error("Only the streamer can delegate round approval.");
  }
  set(actor, name, seconds) {
    this.owner(actor);
    if (!this.enabled) throw Error("Approval delegation is disabled.");
    if (
      typeof name !== "string" ||
      !/^[a-zA-Z0-9_]{1,25}$/.test(name) ||
      !Number.isInteger(seconds) ||
      seconds < 1 ||
      seconds > 1800
    )
      throw Error("Choose a moderator login and duration of 1–1800 seconds.");
    this.grant = {
      name: name.toLowerCase(),
      expiresAt: this.now() + seconds * 1000,
    };
    return this.public();
  }
  revoke(actor) {
    this.owner(actor);
    this.grant = null;
    return null;
  }
  public() {
    if (!this.enabled || !this.grant || this.now() >= this.grant.expiresAt)
      return null;
    return { ...this.grant, scope: "selected-round-inputs" };
  }
  canApprove(actor, isModerator) {
    const grant = this.public();
    return !!(
      grant &&
      actor?.source === "twitch" &&
      isModerator === true &&
      String(actor.name).toLowerCase() === grant.name
    );
  }
}
export function roundApprovalActor(actor, isModerator, delegation) {
  return delegation.canApprove(actor, isModerator)
    ? { ...actor, owner: true, approvalAuthority: "delegated-moderator" }
    : actor;
}
