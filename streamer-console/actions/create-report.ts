import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { isoNow } from "../server/db/timestamps.js";
import { getLink, requireUser } from "../server/lib/access.js";
import { validateReport } from "../server/lib/rules.js";

export default defineAction({
  description:
    "File a problem report for the streamer (game issue, misbehaving player or similar). Any signed-in user; the report goes to the streamer's review list.",
  schema: z.object({
    game: z
      .string()
      .min(1)
      .max(80)
      .describe("Game name or id (up to 80 characters)"),
    version: z
      .string()
      .min(1)
      .max(80)
      .describe("Game version or 'live' (up to 80 characters)"),
    description: z
      .string()
      .min(1)
      .max(500)
      .describe("What happened (up to 500 characters)"),
    activity: z
      .string()
      .min(1)
      .max(300)
      .describe("What you were doing (up to 300 characters)"),
  }),
  outputSchema: z.object({ id: z.string(), status: z.string() }),
  run: async (args, ctx) => {
    const email = requireUser(ctx);
    const check = validateReport(args);
    if (!check.ok)
      fail(check.error, { errorCode: "invalid_report", statusCode: 400 });
    const link = await getLink(email);
    const id = crypto.randomUUID();
    await getDb()
      .insert(schema.viewerReports)
      .values({
        id,
        ownerEmail: email,
        sub: link?.sub ?? null,
        displayName: link?.displayName ?? null,
        game: check.value.game,
        version: check.value.version,
        description: check.value.description,
        activity: check.value.activity,
        status: "open",
        createdAt: isoNow(),
      });
    return { id, status: "open" };
  },
});
