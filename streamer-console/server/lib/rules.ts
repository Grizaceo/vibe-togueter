import crypto from "node:crypto";

// Pure, dependency-free domain rules. Everything here is unit-testable
// without a database, env or network; actions wrap them with fail().

export const SUB_PATTERN = /^(twitch|kick):[\w-]{1,40}$/;

export const STREAMER_UNLOCK_TTL_MS = 4 * 60 * 60 * 1000;
export const MODERATOR_LINK_MAX_AGE_MS = 12 * 60 * 60 * 1000;

// Same patterns the controller applies to round idea text.
const CREDENTIAL_PATTERN =
  /(?:sk-[A-Za-z0-9_-]{24,}|ghp_[A-Za-z0-9]{24,}|AKIA[A-Z0-9]{16})/;

export function parseSub(value: unknown) {
  const sub = String(value ?? "");
  if (!SUB_PATTERN.test(sub)) return null;
  return { sub, platform: sub.split(":", 1)[0] as "twitch" | "kick" };
}

export function credentialLike(text: string) {
  return CREDENTIAL_PATTERN.test(text);
}

export function streamerUnlocked(
  row: { expiresAt: string } | null | undefined,
  nowIso: string,
) {
  return !!row && row.expiresAt > nowIso;
}

export function linkFresh(linkedAtIso: string, nowMs: number) {
  const at = Date.parse(linkedAtIso);
  return (
    Number.isFinite(at) && nowMs - at >= 0 && nowMs - at <= MODERATOR_LINK_MAX_AGE_MS
  );
}

export function linkRoles(rolesJson: string | null | undefined): string[] {
  try {
    const roles = JSON.parse(String(rolesJson ?? "[]"));
    return Array.isArray(roles)
      ? roles.filter((r) => typeof r === "string")
      : [];
  } catch {
    return [];
  }
}

// A delegated moderator: linked account carried the moderator role recently
// AND the controller's current grant names that login on that platform.
export function delegationMatches(
  link: { platform: string; displayName: string; roles: string; linkedAt: string } | null | undefined,
  delegation: { name?: unknown; platform?: unknown } | null | undefined,
  nowMs: number,
) {
  if (!link || !delegation) return false;
  if (!linkRoles(link.roles).includes("moderator")) return false;
  if (!linkFresh(link.linkedAt, nowMs)) return false;
  return (
    delegation.platform === link.platform &&
    String(delegation.name ?? "") === link.displayName.toLowerCase()
  );
}

export function consoleRole(access: {
  streamer: boolean;
  moderator: boolean;
}): "streamer" | "moderator" | "viewer" {
  return access.streamer ? "streamer" : access.moderator ? "moderator" : "viewer";
}

// RFC 7638 thumbprint of an ECDSA P-256 public JWK — same canonicalization as
// the controller's src/seats.js jwkThumbprint so cnf.jkt compares exactly.
export function jwkThumbprint(jwk: {
  kty?: string;
  crv?: string;
  x?: string;
  y?: string;
}) {
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
  const canonical = JSON.stringify({
    crv: jwk.crv,
    kty: jwk.kty,
    x: jwk.x,
    y: jwk.y,
  });
  return crypto
    .createHash("sha256")
    .update(canonical)
    .digest("base64url");
}

// Claims decoded from a seat-offer token. We validate structure, binding and
// expiry; the signature stays unchecked because the token itself is never
// redeemed — it only vouches for who typed the pairing code in chat.
export function validSeatOffer(
  claims: unknown,
  jkt: string,
  nowMs: number,
): { sub: string; platform: string; name: string; roles: string[] } | null {
  const c = claims as Record<string, unknown> | null;
  if (!c || c.v !== 1 || c.seat !== "player") return null;
  if (c.plat !== "twitch" && c.plat !== "kick") return null;
  const sub = typeof c.sub === "string" ? c.sub : "";
  const parsed = parseSub(sub);
  if (!parsed || parsed.platform !== c.plat) return null;
  if (!Number.isFinite(c.exp as number) || (c.exp as number) <= nowMs)
    return null;
  if ((c.cnf as { jkt?: unknown } | undefined)?.jkt !== jkt) return null;
  const roles = Array.isArray(c.roles)
    ? c.roles.filter((r): r is string => typeof r === "string")
    : [];
  return {
    sub,
    platform: c.plat as string,
    name: String(c.name || "").slice(0, 25) || parsed.sub,
    roles,
  };
}

export function decodeSeatToken(token: string) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  try {
    return JSON.parse(
      Buffer.from(parts[1]!, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function validateReport(input: {
  game?: unknown;
  version?: unknown;
  description?: unknown;
  activity?: unknown;
}):
  | {
      ok: true;
      value: { game: string; version: string; description: string; activity: string };
    }
  | { ok: false; error: string } {
  const value = {
    game: String(input.game ?? "").trim(),
    version: String(input.version ?? "").trim(),
    description: String(input.description ?? "").trim(),
    activity: String(input.activity ?? "").trim(),
  };
  if (!value.game || value.game.length > 80)
    return { ok: false, error: "Name the game (up to 80 characters)." };
  if (!value.version || value.version.length > 80)
    return { ok: false, error: "Name the version (up to 80 characters)." };
  if (!value.description || value.description.length > 500)
    return {
      ok: false,
      error: "Describe what happened (up to 500 characters).",
    };
  if (!value.activity || value.activity.length > 300)
    return {
      ok: false,
      error: "Say what you were doing (up to 300 characters).",
    };
  for (const field of Object.values(value))
    if (credentialLike(field))
      return {
        ok: false,
        error: "Possible credential in the report; remove it before sending.",
      };
  return { ok: true, value };
}
