import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  contributorCredits,
  bundledContributorCredits,
} from "./contributor-credits.js";
import { creditManifestFingerprint } from "./creator-assets.js";
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
export function reviewGame(root, gameId) {
  if (typeof gameId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(gameId))
    throw Error("Choose a direct SDK game ID.");
  const dir = path.join(root, "games", gameId),
    file = path.join(dir, "game.js");
  if (
    fs.realpathSync(dir) !== path.resolve(dir) ||
    fs.lstatSync(file).isSymbolicLink()
  )
    throw Error("Linked game paths cannot be published.");
  const bytes = fs.readFileSync(file);
  if (bytes.length > 262144)
    throw Error("Game source exceeds publication limit.");
  return { gameId, codeSha256: sha(bytes), codeBytes: bytes.length };
}
function verifyBundledResources(root, manifest) {
  creditManifestFingerprint(manifest);
  for (const asset of manifest.assets) {
    if (
      asset.origin !== "curated-public-source" ||
      !/^\/curated\/[a-z0-9-]+\/[a-zA-Z0-9_-]+\.png$/.test(asset.sourceURL)
    )
      throw Error(
        "This local publication path supports verified bundled art only; use a quarantined worker for other resources.",
      );
    const file = path.join(root, "public", asset.sourceURL);
    if (fs.realpathSync(file) !== path.resolve(file))
      throw Error("Linked resources cannot be published.");
    if (sha(fs.readFileSync(file)) !== asset.expectedContentSha256)
      throw Error("Resource bytes changed after review.");
  }
}
export function publishGameCredits(
  registry,
  root,
  { gameId, expectedCodeSha256, assetIds, contributors },
) {
  const reviewed = reviewGame(root, gameId);
  if (
    typeof expectedCodeSha256 !== "string" ||
    expectedCodeSha256 !== reviewed.codeSha256
  )
    throw Error("Game code changed; review this version before publishing.");
  if (!Array.isArray(assetIds))
    throw Error(
      "Select the resources actually used by this game, or an empty list for code-drawn art.",
    );
  const credits =
    contributorCredits(contributors) ||
    bundledContributorCredits(
      root,
      path.join(root, "games", gameId),
      reviewed.codeSha256,
    );
  const manifest = registry.manifest(assetIds);
  verifyBundledResources(root, manifest);
  if (!credits)
    throw Error("Record game and idea authors before publishing this version.");
  registry.recordUsage(gameId, reviewed.codeSha256, manifest, credits);
  return { ...reviewed, status: "published", manifest, contributors: credits };
}
export function currentGameCredits(registry, root, dir) {
  try {
    const gameId = path.relative(path.join(root, "games"), dir),
      reviewed = reviewGame(root, gameId);
    const usage = registry.data.usages.findLast(
      (u) =>
        u.gameId === gameId &&
        u.gameVersion === reviewed.codeSha256 &&
        u.manifest,
    );
    const contributors =
      usage?.contributors ||
      bundledContributorCredits(root, dir, reviewed.codeSha256);
    if (!usage)
      return {
        ...reviewed,
        status: "unreviewed",
        manifest: null,
        contributors,
      };
    verifyBundledResources(root, usage.manifest);
    return {
      ...reviewed,
      status: "published",
      manifest: structuredClone(usage.manifest),
      contributors,
    };
  } catch {
    return { status: "unavailable", manifest: null };
  }
}

// Public requests read this snapshot; disk verification occurs only on invalidation.
export class GameCreditsSnapshot {
  constructor({ read = currentGameCredits, registry, root } = {}) {
    Object.assign(this, {
      read,
      registry,
      root,
      value: { status: "unavailable", manifest: null, contributors: null },
    });
  }
  refresh(dir, expectedHash) {
    const value = this.read(this.registry, this.root, dir);
    this.value =
      value.status === "unavailable"
        ? { status: "unavailable", manifest: null, contributors: null }
        : value.codeSha256 === expectedHash
          ? value
          : { status: "unreviewed", manifest: null, contributors: null };
    this.serialized = JSON.stringify(this.value);
    return this.value;
  }
  get() {
    return this.value;
  }
}
