import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { streamerOnly } from "../server/lib/access.js";
import { arena } from "../server/lib/arena.js";

export default defineAction({
  description:
    "Current fallback order and approval-delegation grant. Streamer only.",
  schema: z.object({}),
  outputSchema: z.object({
    fallback: z.object({
      enabled: z.boolean(),
      order: z.array(z.string()),
    }),
    delegation: z
      .object({
        enabled: z.boolean(),
        grant: z.unknown().nullable(),
      })
      .nullable(),
  }),
  http: { method: "GET" },
  readOnly: true,
  authorize: streamerOnly,
  run: async () => {
    const [fallback, delegation] = (await Promise.all([
      arena("/admin/fallback-order", { streamer: true }),
      arena("/admin/approval-delegate", { streamer: true }),
    ])) as [
      { enabled?: boolean; order?: string[] },
      { enabled?: boolean; grant?: unknown } | null,
    ];
    return {
      fallback: {
        enabled: fallback?.enabled === true,
        order: fallback?.order ?? [],
      },
      delegation: delegation
        ? {
            enabled: delegation.enabled === true,
            grant: delegation.grant ?? null,
          }
        : null,
    };
  },
});
