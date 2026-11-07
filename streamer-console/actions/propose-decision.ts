import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { isoNow } from "../server/db/timestamps.js";
import {
  requireUser,
  streamerOrModerator,
} from "../server/lib/access.js";

// The only write the agent (or a moderator) can make: record a proposal. It
// never executes anything — the streamer reads it and decides in the UI.
export default defineAction({
  description:
    "Record a proposal for the streamer (idea selection, resources, approval, cancellation, report resolution or other). Advisory only; only the streamer decides, in the console UI.",
  schema: z.object({
    kind: z
      .enum([
        "select-ideas",
        "resources",
        "approve-input",
        "approve-artifact",
        "cancel-job",
        "resolve-report",
        "other",
      ])
      .describe("What kind of decision is being proposed"),
    summary: z
      .string()
      .min(1)
      .max(1000)
      .describe("Short proposal text (up to 1000 characters)"),
    roundId: z
      .string()
      .optional()
      .describe("Related round id, when the proposal is about a round"),
  }),
  outputSchema: z.object({ id: z.string(), message: z.string() }),
  authorize: streamerOrModerator,
  run: async ({ kind, summary, roundId }, ctx) => {
    const email = requireUser(ctx);
    const id = crypto.randomUUID();
    await getDb()
      .insert(schema.consoleProposals)
      .values({
        id,
        ownerEmail: email,
        roundId: roundId ?? null,
        kind,
        summary: summary.trim().slice(0, 1000),
        createdAt: isoNow(),
      });
    return {
      id,
      message:
        "Proposal recorded. Only the streamer decides, in the console UI.",
    };
  },
});
