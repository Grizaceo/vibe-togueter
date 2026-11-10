import { defineAction, fail } from "@agent-native/core/action";
import crypto from "node:crypto";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { isoNow } from "../server/db/timestamps.js";
import { requireUser } from "../server/lib/access.js";
import { arena, streamerKeyConfigured } from "../server/lib/arena.js";
import { STREAMER_UNLOCK_TTL_MS } from "../server/lib/rules.js";

// In-memory wrong-key limiter: 5 failures per minute per account.
const failures = new Map<string, { count: number; resetAt: number }>();

function recordFailure(email: string) {
  const now = Date.now();
  const entry = failures.get(email);
  const current = entry && entry.resetAt > now ? entry : { count: 0, resetAt: now + 60000 };
  current.count++;
  failures.set(email, current);
  if (current.count >= 5)
    fail("Too many attempts; try again in a minute.", {
      errorCode: "rate_limited",
      statusCode: 429,
    });
}

const sha = (text: string) => crypto.createHash("sha256").update(text).digest();

export default defineAction({
  description:
    "Unlock streamer controls for this console account with the controller streamer key. UI only.",
  schema: z.object({
    key: z
      .string()
      .max(512)
      .describe("The controller's VA_STREAMER_KEY value, typed by the streamer"),
  }),
  outputSchema: z.object({
    unlocked: z.boolean(),
    expiresAt: z.string(),
  }),
  uiOnly: true,
  run: async ({ key }, ctx) => {
    const email = requireUser(ctx);
    const now = Date.now();
    const entry = failures.get(email);
    if (entry && entry.resetAt > now && entry.count >= 5)
      fail("Too many attempts; try again in a minute.", {
        errorCode: "rate_limited",
        statusCode: 429,
      });
    if (!streamerKeyConfigured())
      fail("Streamer unlock is not configured on this deployment.", {
        errorCode: "unlock_unavailable",
        statusCode: 503,
      });
    // Timing-safe compare of digests against the shared controller secret,
    // then the controller itself must agree the env key is live.
    // guard:allow-env-credential — controller local-admin secret shared with the vibe-arena controller .env on this host
    const expected = crypto.createHash("sha256").update(process.env.VA_STREAMER_KEY || "").digest();
    const ok =
      key.length > 0 &&
      key.length <= 512 &&
      crypto.timingSafeEqual(sha(key), expected);
    if (!ok) {
      recordFailure(email);
      fail("That is not the streamer key.", {
        errorCode: "invalid_key",
        statusCode: 403,
      });
    }
    const status = (await arena("/admin/owner-status", {
      streamer: true,
    })) as { ok?: boolean };
    if (status?.ok !== true) {
      recordFailure(email);
      fail("The controller did not confirm streamer access.", {
        errorCode: "controller_rejected",
        statusCode: 403,
      });
    }
    failures.delete(email);
    const expiresAt = new Date(now + STREAMER_UNLOCK_TTL_MS).toISOString();
    await getDb()
      .insert(schema.streamerUnlocks)
      .values({
        ownerEmail: email,
        unlockedAt: isoNow(),
        expiresAt,
      })
      .onConflictDoUpdate({
        target: schema.streamerUnlocks.ownerEmail,
        set: { unlockedAt: isoNow(), expiresAt },
      });
    return { unlocked: true, expiresAt };
  },
});
