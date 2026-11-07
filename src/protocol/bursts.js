// Declared crowd bursts: `distinct` platform identities posting `token` inside
// `windowMs` fire one burst. Only Twitch/Kick identities count — a browser tab
// cannot manufacture viewers.
const CHAT_PLATFORMS = new Set(["twitch", "kick"]);
export class BurstCounter {
  constructor(manifest, { now = Date.now } = {}) {
    this.now = now;
    this.bursts = new Map();
    for (const b of manifest.chat?.bursts || [])
      this.bursts.set(b.name, {
        distinct: b.distinct,
        windowMs: b.windowMs,
        token: b.token.replaceAll("\ufe0f", ""),
        seen: new Map(),
        cooldownUntil: 0,
      });
  }
  prune(b) {
    const cutoff = this.now() - b.windowMs;
    for (const [id, at] of b.seen) if (at <= cutoff) b.seen.delete(id);
  }
  accept({ platform, identity }, text) {
    if (
      !CHAT_PLATFORMS.has(platform) ||
      typeof identity !== "string" ||
      !identity
    )
      return null;
    const token = String(text).trim().replaceAll("\ufe0f", "");
    for (const [name, b] of this.bursts) {
      if (b.token !== token) continue;
      this.prune(b);
      const now = this.now();
      if (now < b.cooldownUntil) return null;
      if (b.seen.has(identity)) return null;
      b.seen.set(identity, now);
      if (b.seen.size < b.distinct) return null;
      b.seen.clear();
      b.cooldownUntil = now + b.windowMs;
      return name;
    }
    return null;
  }
  size() {
    return this.bursts.size;
  }
}
