// Seat tokens: "this identity may hold this seat type in this room until then".
// Ed25519-signed so a future game VM can verify them with the public key alone;
// the controller additionally enforces single use and revocation in memory.
// Design: docs/platform/IDENTITY_SEATS.md, section 4.
import crypto from "node:crypto";

export const SEAT_TYPES = ["player", "spectator", "streamer"];
export const SEAT_TTL_MS = 10 * 60 * 1000;
const MAX_TOKEN_CHARS = 1024;

const b64 = (buffer) => Buffer.from(buffer).toString("base64url");
const fromB64 = (text) => Buffer.from(String(text), "base64url");

export function generateSeatKey() {
  const { privateKey } = crypto.generateKeyPairSync("ed25519");
  return b64(privateKey.export({ type: "pkcs8", format: "der" }));
}

function privateKeyFrom(value) {
  return crypto.createPrivateKey({
    key: fromB64(value),
    format: "der",
    type: "pkcs8",
  });
}

// RFC 7638 thumbprint of the browser's ECDSA P-256 public key.
export function jwkThumbprint(jwk) {
  if (
    !jwk ||
    jwk.kty !== "EC" ||
    jwk.crv !== "P-256" ||
    typeof jwk.x !== "string" ||
    typeof jwk.y !== "string" ||
    jwk.x.length > 64 ||
    jwk.y.length > 64
  )
    return null;
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
  return b64(crypto.createHash("sha256").update(canonical).digest());
}

// The message a seat's browser key signs when it connects.
export const proofMessage = (challenge, room, jti) => `${challenge}|${room}|${jti}`;

export function verifyProof({ jwk, signature }, jkt, message) {
  if (jwkThumbprint(jwk) !== jkt || typeof signature !== "string" || signature.length > 200)
    return false;
  try {
    const key = crypto.createPublicKey({ key: { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y }, format: "jwk" });
    // WebCrypto ECDSA signatures are raw r||s (IEEE P1363), not DER.
    return crypto.verify("sha256", Buffer.from(message), { key, dsaEncoding: "ieee-p1363" }, fromB64(signature));
  } catch {
    return false;
  }
}

export class SeatAuthority {
  constructor({
    key = process.env.VA_SEAT_KEY,
    room = b64(crypto.randomBytes(12)),
    now = Date.now,
    ttlMs = SEAT_TTL_MS,
    maxTracked = 20000,
  } = {}) {
    // Without a configured key the tokens still work for this process only.
    this.ephemeral = !key;
    this.privateKey = key ? privateKeyFrom(key) : crypto.generateKeyPairSync("ed25519").privateKey;
    this.publicKey = crypto.createPublicKey(this.privateKey);
    Object.assign(this, { room, now, ttlMs, maxTracked });
    this.used = new Map(); // jti -> exp, until expiry
    this.revokedBefore = new Map(); // sub -> ms; tokens issued at or before are void
  }

  issue({ sub, name, plat, roles = ["viewer"], seat = "player", jkt = null }) {
    if (typeof sub !== "string" || !/^(twitch|kick|web):[\w-]{1,40}$/.test(sub))
      throw Error("Invalid seat identity.");
    if (!SEAT_TYPES.includes(seat)) throw Error("Invalid seat type.");
    const iat = this.now();
    const payload = {
      v: 1,
      jti: b64(crypto.randomBytes(16)),
      sub,
      name: String(name || "").slice(0, 25),
      plat,
      roles,
      room: this.room,
      seat,
      iat,
      exp: iat + this.ttlMs,
      ...(jkt ? { cnf: { jkt } } : {}),
    };
    const body = b64(JSON.stringify(payload));
    const signature = crypto.sign(null, Buffer.from("v1." + body), this.privateKey);
    return { token: `v1.${body}.${b64(signature)}`, claims: payload };
  }

  // Stateless check: signature, version, room and expiry.
  verify(token) {
    if (typeof token !== "string" || token.length > MAX_TOKEN_CHARS) return { ok: false, reason: "malformed" };
    const parts = token.split(".");
    if (parts.length !== 3 || parts[0] !== "v1") return { ok: false, reason: "malformed" };
    let valid = false;
    try {
      valid = crypto.verify(null, Buffer.from("v1." + parts[1]), this.publicKey, fromB64(parts[2]));
    } catch {}
    if (!valid) return { ok: false, reason: "bad signature" };
    let claims;
    try {
      claims = JSON.parse(fromB64(parts[1]).toString("utf8"));
    } catch {
      return { ok: false, reason: "malformed" };
    }
    if (claims?.v !== 1 || claims.room !== this.room) return { ok: false, reason: "wrong room" };
    if (!SEAT_TYPES.includes(claims.seat)) return { ok: false, reason: "malformed" };
    if (!(this.now() < claims.exp)) return { ok: false, reason: "expired" };
    return { ok: true, claims };
  }

  // Single use. A second use means the token leaked: the identity's seat is revoked.
  // proof: {jwk, signature} over proofMessage(challenge, room, jti) when bound.
  redeem(token, { challenge = null, proof = null, seat = null } = {}) {
    const checked = this.verify(token);
    if (!checked.ok) return checked;
    const { claims } = checked;
    if (seat && claims.seat !== seat) return { ok: false, reason: "wrong seat" };
    if ((this.revokedBefore.get(claims.sub) ?? -Infinity) >= claims.iat)
      return { ok: false, reason: "revoked" };
    if (claims.cnf?.jkt) {
      // Proof first: replaying a used bound token without the key must not let
      // a bystander revoke the real holder's seat.
      if (!challenge || !proof || !verifyProof(proof, claims.cnf.jkt, proofMessage(challenge, this.room, claims.jti)))
        return { ok: false, reason: "proof required" };
      if (this.used.has(claims.jti)) return { ok: false, reason: "reused" };
    } else if (this.used.has(claims.jti)) {
      // An unbound token used twice has leaked: void the identity's seat.
      this.revoke(claims.sub);
      return { ok: false, reason: "reused" };
    }
    this.prune();
    if (this.used.size >= this.maxTracked) return { ok: false, reason: "busy" };
    this.used.set(claims.jti, claims.exp);
    return { ok: true, claims };
  }

  revoke(sub) {
    this.revokedBefore.set(sub, this.now());
    this.prune();
  }

  prune() {
    const now = this.now();
    for (const [jti, exp] of this.used) if (exp <= now) this.used.delete(jti);
    // Anything issued before (now - ttl) has expired anyway.
    for (const [sub, at] of this.revokedBefore) if (at + this.ttlMs <= now) this.revokedBefore.delete(sub);
  }
}
