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
    "Prepare, extend or close the approved builder VM lease. Streamer UI only; the agent never touches the VM.",
  schema: z.object({
    action: z
      .enum(["prepare", "extend", "close"])
      .describe("VM lease operation"),
  }),
  outputSchema: z.object({
    summary: z.unknown(),
    instructionsFile: z.string().nullable(),
  }),
  uiOnly: true,
  authorize: streamerOnly,
  run: async ({ action }, ctx) => {
    const email = requireUser(ctx);
    const result = (await arena("/admin/builder-session", {
      method: "POST",
      body: { action },
      streamer: true,
    })) as Record<string, any>;
    const { instructionsFile, ...summary } = result;
    await logDecision(email, "vm-lease", { action });
    return {
      summary,
      // A local filesystem path only; the UI shows it so the streamer can
      // open the builder login instructions on the same host. Never content.
      instructionsFile:
        typeof instructionsFile === "string" ? instructionsFile : null,
    };
  },
});
