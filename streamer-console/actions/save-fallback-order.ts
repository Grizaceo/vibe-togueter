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
    "Save the fallback game order (up to 10 ids; the controller keeps Marble Race last). Streamer UI only.",
  schema: z.object({
    order: z
      .array(z.string().max(100))
      .max(10)
      .describe("Ordered game ids for the fallback list"),
  }),
  outputSchema: z.object({
    enabled: z.boolean(),
    order: z.array(z.string()),
  }),
  uiOnly: true,
  authorize: streamerOnly,
  run: async ({ order }, ctx) => {
    const email = requireUser(ctx);
    const result = (await arena("/admin/fallback-order", {
      method: "POST",
      body: { order },
      streamer: true,
    })) as { enabled?: boolean; order?: string[] };
    await logDecision(email, "fallback-order", { order: result.order ?? order });
    return {
      enabled: result.enabled === true,
      order: result.order ?? [],
    };
  },
});
