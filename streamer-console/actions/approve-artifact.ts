import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import {
  logDecision,
  requireUser,
  streamerOnly,
} from "../server/lib/access.js";
import { arena } from "../server/lib/arena.js";

export default defineAction({
  description:
    "Approve the exact tested artifact after reviewing it on screen. Re-inspects server-side and requires the reviewed hashes to still match. Streamer UI only.",
  schema: z.object({
    jobId: z.string().describe("Studio build job id"),
    artifactHash: z
      .string()
      .describe("Artifact hash from the on-screen inspection"),
    reportHash: z
      .string()
      .describe("Report hash from the on-screen inspection"),
    creatorName: z
      .string()
      .max(100)
      .optional()
      .describe("Game author name when the ticket carries no prior approval"),
    rightsAttested: z
      .literal(true)
      .describe("Must be true: the streamer attests the resource rights"),
  }),
  outputSchema: z.object({ result: z.unknown().nullable() }),
  uiOnly: true,
  authorize: streamerOnly,
  run: async ({ jobId, artifactHash, reportHash, creatorName }, ctx) => {
    const email = requireUser(ctx);
    // Re-inspect at decision time: the artifact that reaches publication must
    // be the exact one the streamer reviewed, not a stale snapshot.
    const inspected = (await arena("/admin/studio-builds", {
      method: "POST",
      body: { action: "inspect", id: jobId },
      streamer: true,
    })) as { job?: Record<string, any>; ticket?: Record<string, any> };
    const job = inspected.job;
    const ticket = inspected.ticket;
    if (
      job?.phase !== "tested" ||
      job.cleanup?.confirmed !== true ||
      ticket?.artifactHash !== artifactHash ||
      ticket?.reportHash !== reportHash
    )
      fail("The artifact changed since your review; inspect it again.", {
        errorCode: "artifact_changed",
        statusCode: 409,
      });
    const prior = (
      ticket.approval as Record<string, any> | null | undefined
    )?.contributors as Record<string, any> | undefined;
    const gameAuthors =
      (prior?.gameAuthors as { name: string }[] | undefined) ??
      (creatorName?.trim() ? [{ name: creatorName.trim() }] : null);
    if (!gameAuthors)
      fail("Name the game author before approving.", {
        errorCode: "creator_required",
        statusCode: 409,
      });
    const result = (await arena("/admin/studio-builds", {
      method: "POST",
      body: {
        action: "publish-review",
        id: jobId,
        artifactHash,
        reportHash,
        gameAuthors,
        rightsAttested: true,
      },
      streamer: true,
    })) as Record<string, any> | null;
    await logDecision(email, "approve-artifact", {
      jobId,
      artifactHash,
      reportHash,
    });
    return { result: result ?? null };
  },
});
