import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { isoNow } from "../server/db/timestamps.js";
import {
  logDecision,
  requireUser,
  streamerOnly,
} from "../server/lib/access.js";

export default defineAction({
  description:
    "Resolve an open viewer report with a resolution note. Streamer UI only.",
  schema: z.object({
    id: z.string().describe("Report id"),
    resolution: z
      .string()
      .min(1)
      .max(500)
      .describe("Resolution note (up to 500 characters)"),
  }),
  outputSchema: z.object({ id: z.string(), status: z.string() }),
  uiOnly: true,
  authorize: streamerOnly,
  run: async ({ id, resolution }, ctx) => {
    const email = requireUser(ctx);
    const note = resolution.trim();
    if (!note)
      fail("Write a resolution note.", {
        errorCode: "invalid_report",
        statusCode: 400,
      });
    const [existing] = await getDb()
      .select({ id: schema.viewerReports.id, status: schema.viewerReports.status })
      .from(schema.viewerReports)
      .where(eq(schema.viewerReports.id, id))
      .limit(1);
    if (!existing)
      fail("Report not found.", { errorCode: "not_found", statusCode: 404 });
    // Conditional update on status='open': a second resolver loses the race
    // instead of overwriting the first resolution.
    const updated = await getDb()
      .update(schema.viewerReports)
      .set({
        status: "resolved",
        resolution: note,
        resolvedBy: email,
        resolvedAt: isoNow(),
      })
      .where(
        and(
          eq(schema.viewerReports.id, id),
          eq(schema.viewerReports.status, "open"),
        ),
      )
      .returning({ id: schema.viewerReports.id });
    if (!updated.length)
      fail("This report is already resolved.", {
        errorCode: "already_resolved",
        statusCode: 409,
      });
    await logDecision(email, "resolve-report", { id });
    return { id, status: "resolved" };
  },
});
