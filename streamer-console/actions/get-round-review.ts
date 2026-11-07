import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { streamerOrModerator } from "../server/lib/access.js";
import { arena } from "../server/lib/arena.js";

// The exact review snapshot shown to the human right before approving. Never
// agent-visible and never persisted in the browser cache: the streamer reads
// it, approves through the UI, and the token stays off the agent surface.
export default defineAction({
  description:
    "Exact round review snapshot for the on-screen approval step, including the review token. Streamer or delegated moderator; UI only.",
  schema: z.object({}),
  outputSchema: z
    .object({
      roundId: z.string(),
      revision: z.number(),
      phase: z.string(),
      reviewToken: z.string().nullable(),
      settings: z.record(z.string(), z.unknown()),
      selectedIdeas: z.array(
        z.object({
          id: z.number(),
          text: z.string(),
          author: z.string(),
          sha256: z.string(),
        }),
      ),
      resourceManifest: z.unknown().nullable(),
    })
    .nullable(),
  http: { method: "GET" },
  readOnly: true,
  agentTool: false,
  persistInBrowser: false,
  authorize: streamerOrModerator,
  run: async () => {
    const state = (await arena("/community/state")) as Record<string, any>;
    const round = state.round as Record<string, any> | null;
    if (!round) return null;
    const selected = (round.selected ?? []) as number[];
    return {
      roundId: round.id,
      revision: round.revision,
      phase: round.phase,
      reviewToken: round.reviewToken ?? null,
      settings: round.settings ?? {},
      selectedIdeas: selected.map((id) => {
        const idea = (round.ideas ?? []).find(
          (i: Record<string, any>) => i.id === id,
        );
        if (!idea)
          fail("Round changed while reading the review snapshot.", {
            errorCode: "controller_rejected",
            statusCode: 409,
          });
        return {
          id: idea.id,
          text: idea.text,
          author: idea.author,
          sha256: idea.sha256,
        };
      }),
      resourceManifest: round.resourceManifest ?? null,
    };
  },
});
