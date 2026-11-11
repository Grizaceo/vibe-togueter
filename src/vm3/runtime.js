// Shared helpers for the VM3 game runtime: journal persistence, filtered
// event log fields and image-spec validation. Design: docs/platform/VM3_RUNTIME.md.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const JOURNAL_VERSION = 1;
export const PHASES = [
  "closed",
  "provisioning",
  "attaching",
  "running",
  "resetting",
  "destroying",
  "cleanup-required",
];

// Atomic JSON write (fd + fsync + rename), same discipline as the existing
// journals in this repo. Mode 0600: journals can carry session metadata.
export function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + "." + crypto.randomUUID() + ".tmp";
  let fd;
  try {
    fd = fs.openSync(tmp, "wx", 0o600);
    fs.writeFileSync(fd, JSON.stringify(value) + "\n");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tmp, file);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

export function readJsonFile(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

// Filtered-log rule (owner decision D11): events, hashes, decisions and costs
// only — never secrets, raw provider output, tokens or viewer IPs. Free-text
// reasons are kept only when they look like plain codes; anything else is
// replaced by its sha256 so the journal stays provable without leaking content.
const SAFE_TEXT = /^[a-zA-Z0-9 ._:/-]{1,160}$/;
const IP_LIKE = /\d{1,3}(?:\.\d{1,3}){3}/;
// Token shapes that must never reach the journal, even inside a longer
// reason string: va-seat tokens (v1.<b64>.<b64>) and long opaque tokens.
// sha256 hex digests and provider VM ids stay readable for audit.
const TOKEN_PATTERNS = [
  [/v1\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "redacted-seat-token"],
  [
    /[A-Za-z0-9_-]{32,}/g,
    (m) =>
      /^[0-9a-f]{64}$/.test(m) || /^sb-[a-z0-9]{20,40}$/.test(m)
        ? m
        : "redacted-token",
  ],
];
export function safeText(value) {
  const raw = String(value ?? "")
    .replace(/[^\x20-\x7e]/g, " ")
    .trim()
    .slice(0, 160);
  if (!raw) return "";
  let text = raw;
  for (const [pattern, replacement] of TOKEN_PATTERNS)
    text = text.replace(pattern, replacement);
  if (SAFE_TEXT.test(text) && !IP_LIKE.test(text)) return text;
  return "sha256:" + crypto.createHash("sha256").update(raw).digest("hex");
}

const EVENT_FIELDS = {
  open: ["image"],
  reset: ["from", "to", "incarnation"],
  "game-loaded": ["game", "hash", "incarnation"],
  fallback: ["reason", "game"],
  "pause-observed": ["vm"],
  "attach-timeout": ["image", "timeoutMs"],
  attach: ["incarnation"],
  destroyed: ["terminalStatus", "incarnation"],
  error: ["reason", "phase"],
  close: [],
};

// Builds one journal event with an allowlisted field set. Unknown kinds are
// rejected so the log cannot grow arbitrary provider-controlled content.
export function journalEvent(kind, fields = {}, now = Date.now) {
  if (!EVENT_FIELDS[kind]) throw Error("Unknown journal event kind: " + kind);
  const event = { at: now(), kind };
  for (const key of EVENT_FIELDS[kind]) {
    const value = fields[key];
    if (value === undefined || value === null) continue;
    if (key === "reason") event.reason = safeText(value);
    else if (typeof value === "string" || typeof value === "number")
      event[key] = safeText(value);
    else if (typeof value === "object") event[key] = JSON.stringify(value).slice(0, 400);
  }
  return event;
}

// An image spec is the unit a clean reset restores: a backend template ref
// plus the per-incarnation agent credentials. `payload` describes how the
// game reaches the VM; phase 6 replaces it with signed artifact bundles.
export function validateImageSpec(spec, { allowPayload = true } = {}) {
  if (!spec || typeof spec !== "object" || Array.isArray(spec))
    throw Error("Invalid image spec.");
  if (typeof spec.key !== "string" || !/^[a-z0-9-]{1,60}$/.test(spec.key))
    throw Error("Image spec needs a key.");
  if (typeof spec.ref !== "string" || !spec.ref || spec.ref.length > 200)
    throw Error("Image spec needs a backend ref.");
  if (spec.agent !== undefined) {
    const a = spec.agent;
    if (!a || typeof a !== "object" || Array.isArray(a))
      throw Error("Invalid image agent template.");
    if (a.funnelUrl !== undefined && typeof a.funnelUrl !== "string")
      throw Error("Image agent funnelUrl must be a string.");
  }
  if (spec.payload !== undefined && allowPayload) {
    const p = spec.payload;
    if (!p || typeof p !== "object" || Array.isArray(p))
      throw Error("Invalid image payload.");
    if (p.kind === "sdk-source") {
      if (typeof p.source !== "string" || p.source.length > 300000)
        throw Error("SDK source payload too large.");
    } else if (p.kind === "none") {
      // Phase 6 artifact bundles land here.
    } else throw Error("Unknown image payload kind: " + String(p.kind));
  }
  return spec;
}

// Backend handle validation: ids stay provider-shaped strings, never paths.
export function vmId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_.:-]{1,120}$/.test(value)
    ? value
    : null;
}
