import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import {
  logDecision,
  requireUser,
  streamerOnly,
} from "../server/lib/access.js";
import { arena } from "../server/lib/arena.js";

export default defineAction({
  description:
    "Approve the exact reviewed round input (roundId + reviewToken captured by the review step). Streamer UI only; the agent never approves.",
  schema: z.object({
    roundId: z.string().describe("Round id shown in the review snapshot"),
    reviewToken: z
      .string()
      .describe("Review token locked in by the review step"),
  }),
  outputSchema: z.object({
    roundId: z.string(),
    approvedInputHash: z.string().nullable(),
    decidedVia: z.string(),
  }),
  uiOnly: true,
  authorize: streamerOnly,
  run: async ({ roundId, reviewToken }, ctx) => {
    const email = requireUser(ctx);
    const round = (await arena("/admin/round", {
      method: "POST",
      body: { action: "approve", roundId, reviewToken },
      streamer: true,
    })) as Record<string, any>;
    const approvedInputHash = (round?.approvedInputHash as string) ?? null;
    await logDecision(email, "approve-input", {
      roundId,
      approvedInputHash,
    });
    return { roundId, approvedInputHash, decidedVia: "streamer-ui" };
  },
});
