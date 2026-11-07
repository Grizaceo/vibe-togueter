import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { streamerOnly } from "../server/lib/access.js";
import { arena } from "../server/lib/arena.js";

export default defineAction({
  description:
    "Published licensed creator resources that can be attached to the current build round. Streamer only.",
  schema: z.object({}),
  outputSchema: z.object({
    assets: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        kind: z.string().nullable(),
        origin: z.string().nullable(),
        sourceURL: z.string().nullable(),
        licenseId: z.string().nullable(),
        creator: z.string().nullable(),
      }),
    ),
  }),
  http: { method: "GET" },
  readOnly: true,
  authorize: streamerOnly,
  run: async () => {
    const data = (await arena("/community/assets")) as {
      assets?: Record<string, any>[];
    };
    return {
      assets: (data.assets ?? []).map((a) => ({
        id: a.id,
        title: a.title,
        kind: a.kind ?? null,
        origin: a.origin ?? null,
        sourceURL: a.sourceURL ?? null,
        licenseId: a.license?.id ?? null,
        creator: a.creator?.name ?? null,
      })),
    };
  },
});
