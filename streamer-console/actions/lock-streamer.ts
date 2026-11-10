import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireUser } from "../server/lib/access.js";

export default defineAction({
  description: "Lock streamer controls for this console account. UI only.",
  schema: z.object({}),
  outputSchema: z.object({ unlocked: z.boolean() }),
  uiOnly: true,
  run: async (_args, ctx) => {
    const email = requireUser(ctx);
    await getDb()
      .delete(schema.streamerUnlocks)
      .where(eq(schema.streamerUnlocks.ownerEmail, email));
    return { unlocked: false };
  },
});
