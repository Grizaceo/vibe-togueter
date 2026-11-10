import { index, pgTable, text } from "drizzle-orm/pg-core";

import { isoTimestampDefault } from "./timestamps.js";

// The signed-in console account that typed the streamer key. The row is the
// unlock grant itself: it expires 4 h after issue and is deleted on lock.
export const streamerUnlocks = pgTable("streamer_unlocks", {
  ownerEmail: text("owner_email").primaryKey(),
  unlockedAt: text("unlocked_at").notNull().default(isoTimestampDefault),
  expiresAt: text("expires_at").notNull(),
});

// One console account links at most one platform identity (Twitch/Kick sub).
// The sub comes from the controller seat-pairing offer, never from user input.
export const viewerLinks = pgTable("viewer_links", {
  ownerEmail: text("owner_email").primaryKey(),
  sub: text("sub").notNull().unique(),
  platform: text("platform").notNull(),
  displayName: text("display_name").notNull(),
  roles: text("roles").notNull().default("[]"),
  linkedAt: text("linked_at").notNull().default(isoTimestampDefault),
});

export const REPORT_STATUSES = ["open", "resolved"] as const;

// Viewer problem reports. Any signed-in user creates one; the streamer reads
// and resolves all of them (streamer-wide moderation ledger by design).
export const viewerReports = pgTable(
  "viewer_reports",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    sub: text("sub"),
    displayName: text("display_name"),
    game: text("game").notNull(),
    version: text("version").notNull(),
    description: text("description").notNull(),
    activity: text("activity").notNull(),
    status: text("status", { enum: REPORT_STATUSES })
      .notNull()
      .default("open"),
    resolution: text("resolution"),
    resolvedBy: text("resolved_by"),
    resolvedAt: text("resolved_at"),
    createdAt: text("created_at").notNull().default(isoTimestampDefault),
  },
  (t) => [index("viewer_reports_status_created").on(t.status, t.createdAt)],
);

export const DECISION_KINDS = [
  "approve-input",
  "approve-artifact",
  "manage-round",
  "cancel-job",
  "vm-lease",
  "build-job",
  "fallback-order",
  "delegation",
  "resolve-report",
] as const;

// Audit ledger: every controller-facing decision the streamer makes through
// the console UI. detail holds ids/hashes only — never tokens or source.
export const consoleDecisions = pgTable("console_decisions", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  kind: text("kind", { enum: DECISION_KINDS }).notNull(),
  detail: text("detail").notNull(),
  decidedVia: text("decided_via").notNull().default("streamer-ui"),
  createdAt: text("created_at").notNull().default(isoTimestampDefault),
});

export const PROPOSAL_KINDS = [
  "select-ideas",
  "resources",
  "approve-input",
  "approve-artifact",
  "cancel-job",
  "resolve-report",
  "other",
] as const;

// Agent or moderator proposals. Proposals are advisory notes, never executed:
// only the streamer decides, in the console UI.
export const consoleProposals = pgTable("console_proposals", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  roundId: text("round_id"),
  kind: text("kind", { enum: PROPOSAL_KINDS }).notNull(),
  summary: text("summary").notNull(),
  createdAt: text("created_at").notNull().default(isoTimestampDefault),
});
