import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { streamerOrModerator } from "../server/lib/access.js";
import { arena } from "../server/lib/arena.js";

export default defineAction({
  description:
    "Per-round community credit history plus the separate live game's published credits. Streamer or delegated moderator.",
  schema: z.object({}),
  outputSchema: z.object({
    communityCreditEnabled: z.boolean(),
    rounds: z.array(z.unknown()),
    liveGame: z.unknown().nullable(),
  }),
  http: { method: "GET" },
  readOnly: true,
  authorize: streamerOrModerator,
  run: async () => {
    const [credits, publication, state] = (await Promise.all([
      arena("/admin/round-credits", { streamer: true }),
      arena("/community/game-credits"),
      arena("/community/state"),
    ])) as [
      { communityCreditEnabled?: boolean; rounds?: unknown[] },
      Record<string, any>,
      { liveGame?: string },
    ];
    // The live game panel is deliberately separate from round credits: it is
    // the game's own published attribution, not community build credit.
    const liveGame =
      publication && typeof publication === "object"
        ? {
            name: state.liveGame ?? null,
            gameId: publication.gameId ?? null,
            status: publication.status ?? null,
            codeSha256: publication.codeSha256 ?? null,
            contributors: publication.contributors ?? null,
            manifest: publication.manifest ?? null,
            showCommunityCredit: publication.showCommunityCredit === true,
          }
        : null;
    return {
      communityCreditEnabled: credits.communityCreditEnabled === true,
      rounds: credits.rounds ?? [],
      liveGame,
    };
  },
});
