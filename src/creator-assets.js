// Free-first creator catalog. Metadata only: drafts never execute or fetch uploaded code.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import net from "node:net";
const canonical = (value) =>
  value === null || typeof value !== "object"
    ? JSON.stringify(value)
    : Array.isArray(value)
      ? "[" + value.map(canonical).join(",") + "]"
      : "{" +
        Object.keys(value)
          .sort()
          .map((key) => JSON.stringify(key) + ":" + canonical(value[key]))
          .join(",") +
        "}";
const hash = (value) =>
  crypto
    .createHash("sha256")
    .update(typeof value === "string" ? value : canonical(value))
    .digest("hex");
const text = (value, label, max = 200) => {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error(`Invalid ${label}.`);
  return value.trim();
};
export function publicCreatorURL(value) {
  if (typeof value !== "string" || value.length > 2000)
    throw new Error("Invalid public resource URL.");
  const url = new URL(value);
  const host = url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !host.includes(".") ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".lan") ||
    net.isIP(host)
  )
    throw new Error(
      "Use a public HTTPS creator/resource URL without credentials.",
    );
  for (const key of url.searchParams.keys())
    if (
      /^(?:access_token|api[_-]?key|secret|token|signature|password|x-amz-.*|x-goog-.*)$/i.test(
        key,
      )
    )
      throw new Error(
        "Use a stable public URL without authentication parameters.",
      );
  return url.toString();
}
export function creditManifestFingerprint(manifest) {
  if (
    !manifest ||
    typeof manifest !== "object" ||
    !Array.isArray(manifest.assets) ||
    typeof manifest.sha256 !== "string"
  )
    throw new Error("Invalid credit manifest.");
  const { sha256, ...body } = manifest;
  if (hash(body) !== sha256) throw new Error("Credit manifest was altered.");
  return sha256;
}
const licenses = new Set(["CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0", "CUSTOM"]);
function curatedResourcePath(value) {
  if (
    typeof value !== "string" ||
    !/^\/curated\/[a-z0-9-]+\/[a-zA-Z0-9_-]+\.png$/.test(value)
  )
    throw new Error("Invalid bundled resource path.");
  return value;
}
export class CreatorAssets {
  constructor(file) {
    this.file = file;
    this.data = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, "utf8"))
      : { version: 1, assets: [], usages: [] };
    if (
      this.data.version !== 1 ||
      !Array.isArray(this.data.assets) ||
      !Array.isArray(this.data.usages)
    )
      throw new Error("Invalid creator catalog; recover the file explicitly.");
  }
  commit(next) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp =
      this.file + "." + crypto.randomBytes(6).toString("hex") + ".tmp";
    let fd;
    try {
      fd = fs.openSync(tmp, "wx", 0o600);
      fs.writeFileSync(fd, JSON.stringify(next) + "\n");
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;
      fs.renameSync(tmp, this.file);
      this.data = next;
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  }
  draft(input, { curated = false } = {}) {
    if (
      this.data.assets.length >= 10000 ||
      this.data.assets.filter((a) => a.status === "pending-review").length >=
        100
    )
      throw new Error("Contribution intake is full; wait for curator review.");
    const kind = input.kind;
    if (
      ![
        "illustration",
        "texture",
        "asset",
        "sound",
        "music",
        "game",
        "tool",
      ].includes(kind)
    )
      throw new Error("Choose a supported contribution kind.");
    const creator = {
      name: text(input.creator?.name, "creator name", 100),
      website: publicCreatorURL(input.creator?.website),
      socials: (input.creator?.socials || []).map((s) => ({
        label: text(s.label, "social label", 40),
        url: publicCreatorURL(s.url),
      })),
    };
    if (creator.socials.length > 8)
      throw new Error("At most eight creator links.");
    const license = input.license;
    if (!licenses.has(license?.id))
      throw new Error("Choose an explicit supported license.");
    if (
      license.id === "CUSTOM" &&
      (license.permissions?.gameUse !== true ||
        license.permissions?.adaptation !== true ||
        license.permissions?.redistribution !== true)
    )
      throw new Error(
        "Custom terms need explicit game-use, adaptation and redistribution permissions.",
      );
    const tier = input.tier === undefined ? "free" : input.tier;
    if (!["free", "paid"].includes(tier))
      throw new Error("Invalid contribution tier.");
    if (
      tier === "paid" &&
      (!Number.isSafeInteger(input.priceMinor) || input.priceMinor <= 0)
    )
      throw new Error("Paid drafts need a positive integer price.");
    const asset = {
      id: crypto.randomUUID(),
      status: "pending-review",
      title: text(input.title, "title", 120),
      description: text(input.description, "description", 1200),
      kind,
      tier,
      priceMinor: tier === "free" ? 0 : input.priceMinor,
      currency: "USD",
      creator,
      license: {
        id: license.id,
        url: publicCreatorURL(license.url),
        attribution: text(license.attribution, "attribution", 500),
        permissions:
          license.id === "CUSTOM"
            ? { gameUse: true, adaptation: true, redistribution: true }
            : { gameUse: true, adaptation: true, redistribution: true },
        obligations:
          license.id === "CC0-1.0"
            ? []
            : license.id === "CC-BY-SA-4.0"
              ? [
                  "attribution",
                  "indicate-modifications",
                  "share-adapted-material-alike",
                ]
              : ["follow-license-terms", "attribution"],
      },
      sourceURL: publicCreatorURL(input.sourceURL),
      expectedContentSha256: input.expectedContentSha256 || null,
      createdAt: Date.now(),
      featured: false,
    };
    if (
      asset.expectedContentSha256 !== null &&
      (typeof asset.expectedContentSha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(asset.expectedContentSha256))
    )
      throw new Error("Invalid content fingerprint.");
    asset.origin = curated ? "curated-public-source" : "artist-submitted";
    if (curated) {
      asset.sourceURL = curatedResourcePath(input.localResourcePath);
      asset.sourcePage = publicCreatorURL(input.sourcePage);
      asset.curatedKey = text(input.curatedKey, "curated resource key", 100);
    }
    const next = structuredClone(this.data);
    next.assets.push(asset);
    this.commit(next);
    return structuredClone(asset);
  }
  review(
    id,
    actor,
    {
      rightsAttested = false,
      approved = false,
      featured = false,
      featureReason = "",
    } = {},
  ) {
    if (actor?.owner !== true)
      throw new Error("Only the streamer/curator can publish a contribution.");
    if (
      typeof approved !== "boolean" ||
      typeof rightsAttested !== "boolean" ||
      typeof featured !== "boolean"
    )
      throw new Error("Review decisions must be booleans.");
    const next = structuredClone(this.data),
      asset = next.assets.find((a) => a.id === id);
    if (!asset || asset.status !== "pending-review")
      throw new Error("No pending contribution with that ID.");
    if (approved) {
      if (
        !rightsAttested ||
        typeof asset.expectedContentSha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(asset.expectedContentSha256)
      )
        throw new Error(
          "Review the permissions and provide the resource fingerprint before publishing.",
        );
      if (asset.tier === "paid")
        throw new Error(
          "Paid checkout and commission are not configured; keep this draft unpublished.",
        );
      if (featured) text(featureReason, "featured contribution reason", 300);
      asset.status = "published";
      asset.featured = featured;
      asset.featureReason = featured ? featureReason : null;
    } else asset.status = "rejected";
    asset.review = {
      by: actor.name,
      at: Date.now(),
      rightsAttested: !!rightsAttested,
      claim: "Owner-reviewed declaration, not independent proof of authorship.",
    };
    this.commit(next);
    return structuredClone(asset);
  }
  catalog() {
    return this.data.assets
      .filter((a) => a.status === "published" && a.tier === "free")
      .map((a) => ({
        ...structuredClone(a),
        uses: new Set(
          this.data.usages
            .filter((u) => u.assetIds.includes(a.id))
            .map((u) => u.gameId + ":" + u.gameVersion),
        ).size,
      }));
  }
  manifest(ids) {
    if (
      !Array.isArray(ids) ||
      ids.length > 30 ||
      new Set(ids).size !== ids.length
    )
      throw new Error("Select at most 30 unique resources.");
    const assets = ids
      .map((id) => {
        const a = this.data.assets.find((a) => a.id === id);
        if (!a || a.status !== "published" || a.tier !== "free")
          throw new Error(
            "Only published licensed free resources are available for this build.",
          );
        return {
          id: a.id,
          title: a.title,
          kind: a.kind,
          origin: a.origin || "artist-submitted",
          sourceURL: a.sourceURL,
          expectedContentSha256: a.expectedContentSha256,
          creator: a.creator,
          license: a.license,
        };
      })
      .sort((a, b) => a.id.localeCompare(b.id));
    const body = {
      version: 1,
      assets: structuredClone(assets),
      creditPolicy: {
        inGame: true,
        clickableCreatorLinks: true,
        retainOnPlatformRemix: true,
      },
      fingerprints:
        "Builder must verify downloaded bytes against expectedContentSha256 before use.",
    };
    return { ...body, sha256: hash(body) };
  }
  recordUsage(gameId, gameVersion, manifest, contributors = null) {
    text(gameId, "game id", 100);
    if (typeof gameVersion !== "string" || !/^[a-f0-9]{64}$/.test(gameVersion))
      throw new Error("Pin the published game version.");
    const { sha256, ...body } = manifest;
    const expected = this.manifest(manifest.assets.map((a) => a.id));
    if (hash(body) !== sha256 || expected.sha256 !== sha256)
      throw new Error(
        "Credit/resource manifest changed; review before publication.",
      );
    const key = hash({
      gameId,
      gameVersion,
      manifest: manifest.sha256,
      contributors,
    });
    if (this.data.usages.some((u) => u.key === key)) return false;
    const next = structuredClone(this.data);
    next.usages.push({
      key,
      gameId,
      gameVersion,
      manifestSha256: manifest.sha256,
      manifest: structuredClone(manifest),
      contributors: structuredClone(contributors),
      assetIds: manifest.assets.map((a) => a.id),
      at: Date.now(),
    });
    this.commit(next);
    return true;
  }
}
