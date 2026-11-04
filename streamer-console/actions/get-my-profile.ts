import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { getLink, requireUser } from "../server/lib/access.js";
import { arena } from "../server/lib/arena.js";

export default defineAction({
  description:
    "The caller's own viewer participation: their ideas and ballots per round and credited rounds. Requires a linked Twitch/Kick identity; the identity always comes from the caller's own link, never from arguments.",
  schema: z.object({}),
  outputSchema: z.object({
    link: z.object({
      platform: z.string(),
      displayName: z.string(),
      linkedAt: z.string(),
    }),
    rounds: z.array(z.unknown()),
    totals: z.object({
      ideas: z.number(),
      ballots: z.number(),
      credits: z.number(),
    }),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async (_args, ctx) => {
    const email = requireUser(ctx);
    const link = await getLink(email);
    if (!link)
      fail("Link a Twitch or Kick identity first.", {
        errorCode: "identity_not_linked",
        statusCode: 409,
      });
    const profile = (await arena(
      `/admin/viewer-profile?sub=${encodeURIComponent(link.sub)}`,
      { streamer: true },
    )) as { rounds?: unknown[]; totals?: Record<string, number> };
    return {
      link: {
        platform: link.platform,
        displayName: link.displayName,
        linkedAt: link.linkedAt,
      },
      rounds: profile.rounds ?? [],
      totals: {
        ideas: profile.totals?.ideas ?? 0,
        ballots: profile.totals?.ballots ?? 0,
        credits: profile.totals?.credits ?? 0,
      },
    };
  },
});
