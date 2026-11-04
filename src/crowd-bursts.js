// One platform identity (Twitch or Kick) counts once per burst. Browser aliases cannot manufacture viewers.
const kindFor = (text) => {
  const token = String(text).trim().replaceAll("\ufe0f", "");
  return token === "☀" ? "sun" : token === "🌧" ? "rain" : null;
};
export class CrowdBursts {
  constructor({
    enabled = false,
    now = Date.now,
    windowMs = 5000,
    needed = 3,
  } = {}) {
    this.enabled = enabled === true;
    this.now = now;
    this.windowMs = windowMs;
    this.needed = needed;
    this.reset();
  }
  reset() {
    this.groups = { sun: new Map(), rain: new Map() };
    this.cooldown = { sun: 0, rain: 0 };
  }
  prune(kind) {
    const cutoff = this.now() - this.windowMs;
    for (const [id, at] of this.groups[kind])
      if (at <= cutoff) this.groups[kind].delete(id);
  }
  // id: the platform principal ("twitch:123"); the login is the fallback key.
  accept({ source, user, id: principalId }, text) {
    if (
      !this.enabled ||
      !["twitch", "kick"].includes(source) ||
      typeof user !== "string" ||
      !user.trim()
    )
      return null;
    const kind = kindFor(text);
    if (!kind) return null;
    this.prune(kind);
    const now = this.now();
    if (now < this.cooldown[kind]) return null;
    const group = this.groups[kind],
      id = principalId || source + ":" + user.toLowerCase();
    if (group.has(id)) return null;
    group.set(id, now);
    if (group.size < this.needed) return null;
    group.clear();
    this.cooldown[kind] = now + this.windowMs;
    return { kind, participants: this.needed };
  }
  public() {
    for (const kind of ["sun", "rain"]) this.prune(kind);
    return {
      enabled: this.enabled,
      sun: this.groups.sun.size,
      rain: this.groups.rain.size,
      needed: this.needed,
    };
  }
}
