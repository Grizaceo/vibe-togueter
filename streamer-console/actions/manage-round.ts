import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import {
  logDecision,
  requireUser,
  streamerOnly,
} from "../server/lib/access.js";
import { arena } from "../server/lib/arena.js";

const ACTIONS = {
  open: "open",
  "start-vote": "vote",
  "close-vote": "close",
  select: "select",
  resources: "resources",
  cancel: "cancel",
} as const;

// The round object the controller returns, minus the review token.
function stripToken(round: Record<string, any> | null) {
  if (!round) return null;
  const { reviewToken, ...rest } = round;
  return rest;
}

export default defineAction({
  description:
    "Manage the community build round: open, start vote, close vote, select ideas, choose resources or cancel. Streamer UI only.",
  schema: z.object({
    action: z
      .enum(["open", "start-vote", "close-vote", "select", "resources", "cancel"])
      .describe("Round operation to perform"),
    settings: z
      .object({
        maxWords: z.number().int().min(1).max(1000).optional(),
        maxIdeas: z.number().int().min(1).max(100).optional(),
        winnerCount: z.number().int().min(1).max(10).optional(),
        voteSeconds: z.number().int().min(5).max(600).optional(),
        maxIdeasPerPerson: z.number().int().min(1).max(10).optional(),
      })
      .optional()
      .describe("Round settings for open"),
    ideaIds: z
      .array(z.number().int())
      .max(10)
      .optional()
      .describe("Idea ids to select (select action)"),
    reason: z
      .string()
      .max(300)
      .optional()
      .describe("Optional reason for select"),
    assetIds: z
      .array(z.string())
      .max(30)
      .optional()
      .describe("Creator resource ids (resources action)"),
  }),
  outputSchema: z.object({ round: z.unknown().nullable() }),
  uiOnly: true,
  authorize: streamerOnly,
  run: async (args, ctx) => {
    const email = requireUser(ctx);
    const body: Record<string, unknown> = {
      action: ACTIONS[args.action],
    };
    if (args.action === "open" && args.settings)
      body.settings = args.settings;
    if (args.action === "select") {
      body.ids = args.ideaIds;
      if (args.reason) body.reason = args.reason;
    }
    if (args.action === "resources") body.assetIds = args.assetIds ?? [];
    const round = (await arena("/admin/round", {
      method: "POST",
      body,
      streamer: true,
    })) as Record<string, any> | null;
    await logDecision(email, "manage-round", {
      action: args.action,
      roundId: round?.id ?? null,
      ...(args.ideaIds ? { ideaIds: args.ideaIds } : {}),
      ...(args.assetIds ? { assetIds: args.assetIds } : {}),
    });
    return { round: stripToken(round) };
  },
});
