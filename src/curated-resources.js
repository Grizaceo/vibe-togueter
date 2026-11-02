import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// Owner import accepts a shipped resource key, never an arbitrary filesystem path.
export function importCuratedResource(registry, root, key) {
  const base = path.join(
    root,
    "public",
    "curated",
    "kenney-background-elements",
  );
  const pack = JSON.parse(
    fs.readFileSync(path.join(base, "provenance.json"), "utf8"),
  );
  const entry = pack.resources.find((resource) => resource.key === key);
  if (!entry || !/^[a-zA-Z0-9_-]+\.png$/.test(entry.file))
    throw new Error("Unknown bundled resource.");
  const bytes = fs.readFileSync(path.join(base, entry.file));
  const digest = crypto.createHash("sha256").update(bytes).digest("hex");
  if (digest !== entry.sha256 || bytes.length !== entry.bytes)
    throw new Error("Bundled resource fingerprint mismatch.");
  const existing = registry.data.assets.find(
    (a) =>
      a.curatedKey === key &&
      a.expectedContentSha256 === digest &&
      a.status !== "rejected",
  );
  if (existing) return structuredClone(existing);
  return registry.draft(
    {
      title: "Kenney · " + entry.file,
      description: pack.notice,
      kind: "illustration",
      creator: pack.creator,
      license: {
        id: "CC0-1.0",
        url: "https://creativecommons.org/publicdomain/zero/1.0/",
        attribution: "Background elements by Kenney (kenney.nl). CC0.",
      },
      sourceURL: pack.sourcePage,
      sourcePage: pack.sourcePage,
      curatedKey: key,
      localResourcePath: "/curated/kenney-background-elements/" + entry.file,
      expectedContentSha256: digest,
    },
    { curated: true },
  );
}
