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
    "Grant or revoke round-input approval delegation to a chat moderator login (1-30 minutes). Streamer UI only.",
  schema: z.object({
    action: z.enum(["grant", "revoke"]).describe("Delegation operation"),
    login: z
      .string()
      .regex(/^[a-zA-Z0-9_]{1,25}$/)
      .optional()
      .describe("Moderator login (required for grant)"),
    minutes: z
      .number()
      .int()
      .min(1)
      .max(30)
      .optional()
      .describe("Grant duration in minutes, 1-30 (grant)"),
  }),
  outputSchema: z.object({
    enabled: z.boolean(),
    grant: z.unknown().nullable(),
  }),
  uiOnly: true,
  authorize: streamerOnly,
  run: async ({ action, login, minutes }, ctx) => {
    const email = requireUser(ctx);
    const body: Record<string, unknown> =
      action === "grant"
        ? { action: "grant", name: login, seconds: (minutes ?? 0) * 60 }
        : { action: "revoke" };
    const result = (await arena("/admin/approval-delegate", {
      method: "POST",
      body,
      streamer: true,
    })) as { enabled?: boolean; grant?: unknown };
    await logDecision(email, "delegation", {
      action,
      login: action === "grant" ? login : null,
      minutes: action === "grant" ? minutes : null,
    });
    return {
      enabled: result.enabled === true,
      grant: result.grant ?? null,
    };
  },
});
