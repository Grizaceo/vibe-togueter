import { defineAction } from "@agent-native/core/action";
import { desc } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { streamerOrModerator } from "../server/lib/access.js";

export default defineAction({
  description:
    "Latest 20 recorded proposals. Proposals are advisory; they are not decisions. Streamer or delegated moderator.",
  schema: z.object({}),
  outputSchema: z.object({
    proposals: z.array(
      z.object({
        id: z.string(),
        ownerEmail: z.string(),
        roundId: z.string().nullable(),
        kind: z.string(),
        summary: z.string(),
        createdAt: z.string(),
      }),
    ),
  }),
  http: { method: "GET" },
  readOnly: true,
  authorize: streamerOrModerator,
  run: async () => {
    const rows = await getDb()
      .select()
      .from(schema.consoleProposals)
      .orderBy(desc(schema.consoleProposals.createdAt))
      .limit(20);
    return {
      proposals: rows.map((r) => ({
        id: r.id,
        ownerEmail: r.ownerEmail,
        roundId: r.roundId,
        kind: r.kind,
        summary: r.summary,
        createdAt: r.createdAt,
      })),
    };
  },
});
