// Pairing codes: a browser tab asks for a short code, the viewer types
// "!join <code>" in Twitch or Kick chat, and the authenticated chat message
// binds that tab to the chat account. The code travels browser -> chat, so a
// code seen in chat has already been consumed. docs/platform/IDENTITY_SEATS.md §5.
import crypto from "node:crypto";

// Crockford base32: no I, L, O, U; typed O/I/L are read as 0/1.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_LENGTH = 6;

export function normalizeCode(text) {
  const code = String(text || "")
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  return code.length === CODE_LENGTH && [...code].every((c) => ALPHABET.includes(c))
    ? code
    : null;
}

export class Pairings {
  constructor({
    ttlMs = 5 * 60 * 1000,
    maxTotal = 500,
    maxPerAddress = 5,
    now = Date.now,
    randomInt = crypto.randomInt,
  } = {}) {
    Object.assign(this, { ttlMs, maxTotal, maxPerAddress, now, randomInt });
    this.byCode = new Map(); // code -> {owner, jkt, address, expiresAt}
  }

  prune() {
    const now = this.now();
    for (const [code, entry] of this.byCode)
      if (entry.expiresAt <= now) this.byCode.delete(code);
  }

  // owner: whatever identifies the waiting tab (its socket record). One code per owner.
  create({ owner, jkt = null, address = "" }) {
    this.cancel(owner);
    this.prune();
    if (this.byCode.size >= this.maxTotal)
      throw Error("Too many people are pairing right now; try again in a minute.");
    let fromAddress = 0;
    for (const entry of this.byCode.values()) if (entry.address === address) fromAddress++;
    if (address && fromAddress >= this.maxPerAddress)
      throw Error("Too many pending codes from this network; try again in a few minutes.");
    let code;
    do {
      code = Array.from({ length: CODE_LENGTH }, () => ALPHABET[this.randomInt(ALPHABET.length)]).join("");
    } while (this.byCode.has(code));
    const expiresAt = this.now() + this.ttlMs;
    this.byCode.set(code, { owner, jkt, address, expiresAt });
    return { code, expiresAt };
  }

  // First chat message carrying the code wins; the code is gone afterwards.
  claim(text) {
    const code = normalizeCode(text);
    if (!code) return null;
    const entry = this.byCode.get(code);
    if (!entry) return null;
    this.byCode.delete(code);
    return entry.expiresAt > this.now() ? entry : null;
  }

  cancel(owner) {
    for (const [code, entry] of this.byCode) if (entry.owner === owner) this.byCode.delete(code);
  }

  get size() {
    return this.byCode.size;
  }
}
