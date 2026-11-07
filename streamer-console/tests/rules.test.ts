import { describe, expect, it } from "vitest";

import {
  credentialLike,
  decodeSeatToken,
  delegationMatches,
  jwkThumbprint,
  linkFresh,
  linkRoles,
  parseSub,
  streamerUnlocked,
  validateReport,
  validSeatOffer,
} from "../server/lib/rules.js";

const link = {
  platform: "kick",
  displayName: "Kick_Mod",
  roles: JSON.stringify(["viewer", "moderator"]),
  linkedAt: new Date().toISOString(),
};

describe("identity rules", () => {
  it("parses only platform subs", () => {
    expect(parseSub("kick:777")?.platform).toBe("kick");
    expect(parseSub("twitch:A-B_c")).toBeTruthy();
    expect(parseSub("web:abc")).toBeNull();
    expect(parseSub("twitch:")).toBeNull();
    expect(parseSub("x")).toBeNull();
    expect(parseSub("kick:" + "a".repeat(41))).toBeNull();
  });

  it("unlock is fresh only until expiry", () => {
    const row = { expiresAt: "2026-01-01T01:00:00.000Z" };
    expect(streamerUnlocked(row, "2026-01-01T00:00:00.000Z")).toBe(true);
    expect(streamerUnlocked(row, "2026-01-01T02:00:00.000Z")).toBe(false);
    expect(streamerUnlocked(null, "2026-01-01T00:00:00.000Z")).toBe(false);
  });

  it("link freshness is bounded to 12h", () => {
    const now = Date.now();
    expect(linkFresh(new Date(now - 60_000).toISOString(), now)).toBe(true);
    expect(linkFresh(new Date(now - 13 * 3600_000).toISOString(), now)).toBe(false);
    expect(linkFresh(new Date(now + 60_000).toISOString(), now)).toBe(false);
    expect(linkFresh("garbage", now)).toBe(false);
  });

  it("delegation requires moderator role, fresh link and exact login/platform", () => {
    const now = Date.now();
    const grant = { name: "kick_mod", platform: "kick" };
    expect(delegationMatches(link, grant, now)).toBe(true);
    expect(delegationMatches(link, { ...grant, name: "other" }, now)).toBe(false);
    expect(delegationMatches(link, { ...grant, platform: "twitch" }, now)).toBe(false);
    expect(
      delegationMatches({ ...link, roles: '["viewer"]' }, grant, now),
    ).toBe(false);
    expect(
      delegationMatches(
        { ...link, linkedAt: new Date(now - 13 * 3600_000).toISOString() },
        grant,
        now,
      ),
    ).toBe(false);
    expect(delegationMatches(link, null, now)).toBe(false);
    expect(linkRoles("not json")).toEqual([]);
  });
});

describe("seat offer validation", () => {
  const jwk = { kty: "EC", crv: "P-256", x: "x".repeat(43), y: "y".repeat(43) };
  const jkt = jwkThumbprint(jwk)!;
  const claims = {
    v: 1,
    seat: "player",
    plat: "kick",
    sub: "kick:777",
    name: "Kick_Fan",
    roles: ["viewer"],
    exp: Date.now() + 60000,
    cnf: { jkt },
  };
  const token = (c: unknown) =>
    "v1." + Buffer.from(JSON.stringify(c)).toString("base64url") + ".sig";

  it("thumbprint matches RFC 7638 shape and rejects bad keys", () => {
    expect(jkt).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(jwkThumbprint({ kty: "RSA" })).toBeNull();
  });

  it("accepts only a bound, unexpired player claim", () => {
    const now = Date.now();
    const offer = validSeatOffer(claims, jkt, now);
    expect(offer?.sub).toBe("kick:777");
    expect(validSeatOffer({ ...claims, seat: "spectator" }, jkt, now)).toBeNull();
    expect(validSeatOffer({ ...claims, plat: "web" }, jkt, now)).toBeNull();
    expect(validSeatOffer({ ...claims, sub: "twitch:777" }, jkt, now)).toBeNull();
    expect(validSeatOffer({ ...claims, exp: now - 1 }, jkt, now)).toBeNull();
    expect(validSeatOffer({ ...claims, cnf: { jkt: "other" } }, jkt, now)).toBeNull();
    expect(validSeatOffer({ ...claims, cnf: undefined }, jkt, now)).toBeNull();
    expect(decodeSeatToken(token(claims))?.sub).toBe("kick:777");
    expect(decodeSeatToken("v2.x.y")).toBeNull();
    expect(decodeSeatToken("v1.!!!.sig")).toBeNull();
  });
});

describe("report validation", () => {
  const good = {
    game: "Community Grove",
    version: "live",
    description: "The tree stopped growing.",
    activity: "Watching the stream",
  };
  it("trims and accepts a well-formed report", () => {
    const r = validateReport({ ...good, game: "  Grove  " });
    expect(r.ok && r.value.game).toBe("Grove");
  });
  it("rejects empty and oversized fields", () => {
    expect(validateReport({ ...good, game: "" }).ok).toBe(false);
    expect(validateReport({ ...good, description: "x".repeat(501) }).ok).toBe(false);
    expect(validateReport({ ...good, activity: "x".repeat(301) }).ok).toBe(false);
  });
  it("rejects credential-looking text", () => {
    expect(credentialLike("sk-" + "a".repeat(30))).toBe(true);
    expect(validateReport({ ...good, description: "use sk-" + "b".repeat(30) }).ok).toBe(false);
    expect(validateReport(good).ok).toBe(true);
  });
});
