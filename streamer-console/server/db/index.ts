import { createGetDb } from "@agent-native/core/db";
import { registerIdentityColumns } from "@agent-native/core/org";

import * as schema from "./schema.js";

export const getDb = createGetDb(schema);
export { schema };

registerIdentityColumns([
  // Access grants: a transferred unlock or link would let the removed member
  // act as the successor, so both are deleted on offboarding.
  {
    table: "streamer_unlocks",
    column: "owner_email",
    emailChange: "rekey",
    offboard: "delete",
    reason: "The unlock is a live grant tied to the account that confirmed the streamer key.",
  },
  {
    table: "viewer_links",
    column: "owner_email",
    emailChange: "rekey",
    offboard: "delete",
    reason: "The platform link grants this account a viewer identity; it must not transfer.",
  },
  // Ledgers: attribution and audit history stay readable after offboarding.
  {
    table: "viewer_reports",
    column: "owner_email",
    emailChange: "rekey",
    offboard: "retain",
    reason: "Report attribution belongs to the streamer-wide moderation ledger.",
  },
  {
    table: "console_decisions",
    column: "owner_email",
    emailChange: "rekey",
    offboard: "retain",
    reason: "Decision audit rows record who decided; they are history, not access.",
  },
  {
    table: "console_proposals",
    column: "owner_email",
    emailChange: "rekey",
    offboard: "retain",
    reason: "Proposal attribution is recorded history, not an access grant.",
  },
]);
