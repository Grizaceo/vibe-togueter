// Participant-authored attribution metadata, pinned to source bytes independently of game code.
import { communityCredit } from "./community-credit.js";
import { publicCreatorURL } from "./creator-assets.js";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
function people(items, label) {
  if (!Array.isArray(items) || !items.length || items.length > 10)
    throw Error(
      "Record " + label + " (or explicitly record that authorship is unknown).",
    );
  return items.map((item) => {
    if (
      typeof item?.name !== "string" ||
      !item.name.trim() ||
      item.name.length > 150
    )
      throw Error("Invalid " + label + " name.");
    const result = { name: item.name.trim() };
    if (item.url) result.url = publicCreatorURL(item.url);
    return result;
  });
}
export function contributorCredits(input) {
  if (!input) return null;
  const result = {
    gameAuthors: people(input.gameAuthors, "game authors"),
    ideaAuthors: people(input.ideaAuthors, "idea authors"),
  };
  if (input.artAuthors)
    result.artAuthors = people(input.artAuthors, "art authors");
  if (input.artNote !== undefined) {
    if (typeof input.artNote !== "string" || input.artNote.length > 200)
      throw Error("Invalid art credit note.");
    result.artNote = input.artNote;
  }
  if (input.communityCredit)
    result.communityCredit = communityCredit(input.communityCredit);
  return result;
}
export function bundledContributorCredits(root, dir, codeHash) {
  try {
    const file = path.join(dir, "credits.json");
    if (fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size > 16384)
      return null;
    const record = JSON.parse(fs.readFileSync(file, "utf8"));
    if (record.codeSha256 !== codeHash) return null;
    for (const resource of record.resources || []) {
      if (!/^\/curated\/[a-z0-9-]+\/[a-zA-Z0-9_-]+\.png$/.test(resource.path))
        return null;
      const target = path.join(root, "public", resource.path);
      if (
        fs.realpathSync(target) !== path.resolve(target) ||
        sha(fs.readFileSync(target)) !== resource.sha256
      )
        return null;
    }
    return contributorCredits(record.contributors);
  } catch {
    return null;
  }
}
