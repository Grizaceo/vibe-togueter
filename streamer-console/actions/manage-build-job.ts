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
    "Check, dispatch, cancel or reconcile the isolated studio build job. Streamer UI only.",
  schema: z.object({
    action: z
      .enum(["check", "dispatch", "cancel", "reconcile"])
      .describe("Build job operation"),
    jobId: z
      .string()
      .optional()
      .describe("Job id (required for cancel and reconcile)"),
    roundId: z
      .string()
      .optional()
      .describe("Approved round id (dispatch)"),
    approvedInputHash: z
      .string()
      .optional()
      .describe("Approved input hash from the round (dispatch)"),
  }),
  outputSchema: z.object({ result: z.unknown().nullable() }),
  uiOnly: true,
  authorize: streamerOnly,
  run: async (args, ctx) => {
    const email = requireUser(ctx);
    const body: Record<string, unknown> = { action: args.action };
    if (args.action === "dispatch") {
      body.roundId = args.roundId;
      body.approvedInputHash = args.approvedInputHash;
    }
    if (args.action === "cancel" || args.action === "reconcile")
      body.id = args.jobId;
    const result = (await arena("/admin/studio-builds", {
      method: "POST",
      body,
      streamer: true,
    })) as Record<string, any> | null;
    await logDecision(
      email,
      args.action === "cancel" ? "cancel-job" : "build-job",
      {
        action: args.action,
        jobId: args.jobId ?? null,
        roundId: args.roundId ?? null,
        approvedInputHash: args.approvedInputHash ?? null,
      },
    );
    return { result: result ?? null };
  },
});
