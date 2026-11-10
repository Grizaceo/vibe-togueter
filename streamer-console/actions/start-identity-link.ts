import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireUser } from "../server/lib/access.js";
import { startIdentityLink } from "../server/lib/seat-link.js";

export default defineAction({
  description:
    "Start linking this account to a Twitch or Kick chat identity. Returns the pairing code to type as !join CODE in chat. UI only.",
  schema: z.object({}),
  outputSchema: z.object({
    code: z.string(),
    command: z.string(),
    expiresAt: z.number(),
  }),
  uiOnly: true,
  run: async (_args, ctx) => {
    const email = requireUser(ctx);
    const { code, expiresAt } = await startIdentityLink(email);
    return { code, command: `!join ${code}`, expiresAt };
  },
});
