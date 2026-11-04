import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { requireUser, resolveAccess } from "../server/lib/access.js";
import { arena } from "../server/lib/arena.js";
import { consoleRole } from "../server/lib/rules.js";

export default defineAction({
  description:
    "Who this console account is right now: streamer unlock, delegated-moderator status and linked platform identity.",
  schema: z.object({}),
  outputSchema: z.object({
    email: z.string(),
    role: z.enum(["streamer", "moderator", "viewer"]),
    streamer: z.object({
      unlocked: z.boolean(),
      expiresAt: z.string().nullable(),
    }),
    moderator: z.boolean(),
    link: z
      .object({
        platform: z.string(),
        displayName: z.string(),
        linkedAt: z.string(),
      })
      .nullable(),
    liveGame: z.string().nullable(),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async (_args, ctx) => {
    const email = requireUser(ctx);
    const access = await resolveAccess(email);
    // Public state only; tolerate a down controller so the page still renders.
    let liveGame: string | null = null;
    try {
      const state = (await arena("/community/state")) as {
        liveGame?: unknown;
      };
      liveGame = typeof state.liveGame === "string" ? state.liveGame : null;
    } catch {}
    return {
      email,
      role: consoleRole({
        streamer: access.streamer.unlocked,
        moderator: access.moderator,
      }),
      streamer: access.streamer,
      moderator: access.moderator,
      link: access.link,
      liveGame,
    };
  },
});
