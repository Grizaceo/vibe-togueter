import type { MigrationEntry } from "@agent-native/core/db";

import { ISO_TIMESTAMP_DEFAULT_SQL } from "./timestamps.js";

const D = ISO_TIMESTAMP_DEFAULT_SQL;

// Additive only: append new named entries, never edit an applied one.
export const MIGRATIONS: MigrationEntry[] = [
  {
    version: 1,
    name: "streamer-console-tables",
    sql: `
      CREATE TABLE IF NOT EXISTS streamer_unlocks (
        owner_email TEXT PRIMARY KEY,
        unlocked_at TEXT NOT NULL DEFAULT ${D},
        expires_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS viewer_links (
        owner_email TEXT PRIMARY KEY,
        sub TEXT NOT NULL UNIQUE,
        platform TEXT NOT NULL,
        display_name TEXT NOT NULL,
        roles TEXT NOT NULL DEFAULT '[]',
        linked_at TEXT NOT NULL DEFAULT ${D}
      );
      CREATE TABLE IF NOT EXISTS viewer_reports (
        id TEXT PRIMARY KEY,
        owner_email TEXT NOT NULL,
        sub TEXT,
        display_name TEXT,
        game TEXT NOT NULL,
        version TEXT NOT NULL,
        description TEXT NOT NULL,
        activity TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
        resolution TEXT,
        resolved_by TEXT,
        resolved_at TEXT,
        created_at TEXT NOT NULL DEFAULT ${D}
      );
      CREATE INDEX IF NOT EXISTS viewer_reports_status_created
        ON viewer_reports (status, created_at);
      CREATE TABLE IF NOT EXISTS console_decisions (
        id TEXT PRIMARY KEY,
        owner_email TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('approve-input','approve-artifact','manage-round','cancel-job','vm-lease','build-job','fallback-order','delegation','resolve-report')),
        detail TEXT NOT NULL,
        decided_via TEXT NOT NULL DEFAULT 'streamer-ui',
        created_at TEXT NOT NULL DEFAULT ${D}
      );
      CREATE TABLE IF NOT EXISTS console_proposals (
        id TEXT PRIMARY KEY,
        owner_email TEXT NOT NULL,
        round_id TEXT,
        kind TEXT NOT NULL CHECK (kind IN ('select-ideas','resources','approve-input','approve-artifact','cancel-job','resolve-report','other')),
        summary TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT ${D}
      );
    `,
  },
];
