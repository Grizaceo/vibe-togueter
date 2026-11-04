import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SeatAuthority,
  generateSeatKey,
  jwkThumbprint,
  proofMessage,
} from "../src/seats.js";

const subtle = globalThis.crypto.subtle;
const viewer = { sub: "twitch:42", name: "Alice", plat: "twitch", roles: ["viewer"], seat: "player" };

function authority(options = {}) {
  let now = 1_000_000;
  const seats = new SeatAuthority({ key: generateSeatKey(), room: "room-a", now: () => now, ...options });
  return { seats, tick: (ms) => (now += ms) };
}

// A browser-style key: ECDSA P-256, private part not extractable.
async function browserKey() {
  const pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
  const jwk = await subtle.exportKey("jwk", pair.publicKey);
  const sign = async (message) =>
    Buffer.from(
      await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, new TextEncoder().encode(message)),
    ).toString("base64url");
  return { jwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, sign };
}

test("a seat token binds identity, room, seat type and expiry", () => {
  const { seats } = authority();
  const { token, claims } = seats.issue(viewer);
  assert.match(token, /^v1\.[\w-]+\.[\w-]+$/);
  assert.ok(token.length < 1024);
  const redeemed = seats.redeem(token, { seat: "player" });
  assert.equal(redeemed.ok, true);
  assert.equal(redeemed.claims.sub, "twitch:42");
  assert.equal(redeemed.claims.room, "room-a");
  assert.equal(redeemed.claims.exp - redeemed.claims.iat, 10 * 60 * 1000);
  assert.equal(claims.jti.length, 22);
});

test("tokens are single use and reuse revokes the identity", () => {
  const { seats, tick } = authority();
  const first = seats.issue(viewer).token;
  const second = seats.issue(viewer).token;
  assert.equal(seats.redeem(first).ok, true);
  assert.equal(seats.redeem(first).reason, "reused");
  // Every token issued to that identity before the reuse is void now.
  assert.equal(seats.redeem(second).reason, "revoked");
  tick(1);
  assert.equal(seats.redeem(seats.issue(viewer).token).ok, true);
  // Other identities are unaffected.
  const other = seats.issue({ ...viewer, sub: "kick:7", plat: "kick" }).token;
  assert.equal(seats.redeem(other).ok, true);
});

test("expired, wrong-room, wrong-seat, tampered and oversized tokens are rejected", () => {
  const key = generateSeatKey();
  let now = 0;
  const seats = new SeatAuthority({ key, room: "room-a", now: () => now });
  const sameKeyOtherRoom = new SeatAuthority({ key, room: "room-b", now: () => now });
  const { token } = seats.issue(viewer);
  assert.equal(sameKeyOtherRoom.redeem(token).reason, "wrong room");
  assert.equal(seats.redeem(token, { seat: "streamer" }).reason, "wrong seat");
  const [v, body, sig] = token.split(".");
  const forged = JSON.parse(Buffer.from(body, "base64url"));
  forged.seat = "streamer";
  assert.equal(
    seats.redeem(`${v}.${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${sig}`).reason,
    "bad signature",
  );
  assert.equal(seats.redeem("v1.x").reason, "malformed");
  assert.equal(seats.redeem("v1." + "a".repeat(2000) + ".b").reason, "malformed");
  now += 10 * 60 * 1000;
  assert.equal(seats.redeem(token).reason, "expired");
});

test("the key in .env survives restarts only within the same room; rotation voids tokens", () => {
  const key = generateSeatKey();
  const a = new SeatAuthority({ key, room: "r" });
  const sameKey = new SeatAuthority({ key, room: "r" });
  const rotated = new SeatAuthority({ key: generateSeatKey(), room: "r" });
  const { token } = a.issue(viewer);
  assert.equal(sameKey.verify(token).ok, true);
  assert.equal(rotated.verify(token).reason, "bad signature");
  // Without VA_SEAT_KEY the authority still works for this process only.
  const ephemeral = new SeatAuthority({ key: "" });
  assert.equal(ephemeral.ephemeral, true);
  assert.equal(ephemeral.redeem(ephemeral.issue(viewer).token).ok, true);
});

test("a bound token needs a proof from the browser key that asked for it", async () => {
  const { seats } = authority();
  const tab = await browserKey();
  const thief = await browserKey();
  const { token, claims } = seats.issue({ ...viewer, jkt: jwkThumbprint(tab.jwk) });
  const challenge = "c-123";
  const message = proofMessage(challenge, "room-a", claims.jti);
  assert.equal(seats.redeem(token).reason, "proof required");
  const stolen = { jwk: thief.jwk, signature: await thief.sign(message) };
  assert.equal(seats.redeem(token, { challenge, proof: stolen }).reason, "proof required");
  const wrongChallenge = { jwk: tab.jwk, signature: await tab.sign(proofMessage("other", "room-a", claims.jti)) };
  assert.equal(seats.redeem(token, { challenge, proof: wrongChallenge }).reason, "proof required");
  // Failed proofs do not consume the token; the real tab still gets in.
  const good = { jwk: tab.jwk, signature: await tab.sign(message) };
  assert.equal(seats.redeem(token, { challenge, proof: good }).ok, true);
  // A bystander replaying the used token cannot revoke the holder's seat.
  assert.equal(seats.redeem(token).reason, "proof required");
  assert.equal(seats.redeem(token, { challenge, proof: good }).reason, "reused");
  const next = seats.issue({ ...viewer, jkt: jwkThumbprint(tab.jwk) });
  const nextProof = { jwk: tab.jwk, signature: await tab.sign(proofMessage("c-2", "room-a", next.claims.jti)) };
  assert.equal(seats.redeem(next.token, { challenge: "c-2", proof: nextProof }).ok, true);
});

test("thumbprints follow RFC 7638 and reject other key types", () => {
  // RFC 7638 section 3.1 example uses RSA; for EC, check determinism and member order.
  const jwk = { kty: "EC", crv: "P-256", x: "a", y: "b", ext: true, key_ops: ["verify"] };
  assert.equal(jwkThumbprint(jwk), jwkThumbprint({ y: "b", x: "a", crv: "P-256", kty: "EC" }));
  assert.equal(jwkThumbprint({ kty: "RSA", n: "x", e: "AQAB" }), null);
  assert.equal(jwkThumbprint({ kty: "EC", crv: "P-384", x: "a", y: "b" }), null);
});

test("issuing validates identity and seat type; tracking is bounded", () => {
  const { seats, tick } = authority({ maxTracked: 2 });
  assert.throws(() => seats.issue({ ...viewer, sub: "alice" }), /identity/);
  assert.throws(() => seats.issue({ ...viewer, sub: "admin:1" }), /identity/);
  assert.throws(() => seats.issue({ ...viewer, seat: "owner" }), /seat type/);
  assert.equal(seats.redeem(seats.issue(viewer).token).ok, true);
  assert.equal(seats.redeem(seats.issue({ ...viewer, sub: "kick:1" }).token).ok, true);
  assert.equal(seats.redeem(seats.issue({ ...viewer, sub: "kick:2" }).token).reason, "busy");
  tick(10 * 60 * 1000);
  assert.equal(seats.redeem(seats.issue({ ...viewer, sub: "kick:3" }).token).ok, true);
});

test("setup:local adds VA_SEAT_KEY once and rotates it only on request", async () => {
  const { execFileSync } = await import("node:child_process");
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "va-setup-"));
  const script = new URL("../scripts/setup-local.mjs", import.meta.url).pathname;
  const env = () => Object.fromEntries(
    fs.readFileSync(path.join(dir, ".env"), "utf8").trim().split("\n").map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), JSON.parse(l.slice(i + 1))];
    }),
  );
  try {
    fs.writeFileSync(path.join(dir, ".env"), 'VA_ADMIN_TOKEN="keep-me"\n', { mode: 0o600 });
    const out = execFileSync(process.execPath, [script], { cwd: dir }).toString();
    assert.doesNotMatch(out, /[A-Za-z0-9_-]{40,}/); // no secret printed
    const first = env();
    assert.equal(first.VA_ADMIN_TOKEN, "keep-me");
    assert.equal(new SeatAuthority({ key: first.VA_SEAT_KEY }).ephemeral, false);
    execFileSync(process.execPath, [script], { cwd: dir });
    assert.equal(env().VA_SEAT_KEY, first.VA_SEAT_KEY);
    execFileSync(process.execPath, [script, "--rotate-seat-key"], { cwd: dir });
    const rotated = env();
    assert.notEqual(rotated.VA_SEAT_KEY, first.VA_SEAT_KEY);
    assert.equal(rotated.VA_STREAMER_KEY, first.VA_STREAMER_KEY);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
