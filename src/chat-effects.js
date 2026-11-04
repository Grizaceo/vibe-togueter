// Authority comes from the trusted IRC adapter, never a browser nickname.
export class ChatEffects {
  constructor({ enabled = false, channel = "" } = {}) {
    this.enabled = enabled === true;
    this.channel = String(channel || "").toLowerCase();
    this.paused = false;
  }
  // isBroadcaster comes from the platform (Twitch room id, Kick signed payload).
  // Without it, the Twitch login from the authenticated IRC socket is compared.
  command({ source, user, isModerator = false, isBroadcaster }, text) {
    const command = String(text).trim().toLowerCase();
    if (!["!pause", "!resume"].includes(command)) return { handled: false };
    const broadcaster =
      isBroadcaster === true ||
      (isBroadcaster === undefined &&
        source === "twitch" &&
        Boolean(this.channel) &&
        String(user).toLowerCase() === this.channel);
    if (
      !this.enabled ||
      !["twitch", "kick"].includes(source) ||
      !(isModerator === true || broadcaster)
    )
      return { handled: true, changed: false };
    return { handled: true, ...this.setPaused(command === "!pause") };
  }
  setPaused(value) {
    if (!this.enabled) return { changed: false };
    const next = value === true,
      changed = next !== this.paused;
    this.paused = next;
    return { changed, paused: this.paused };
  }
  get blocked() {
    return this.enabled && this.paused;
  }
}
