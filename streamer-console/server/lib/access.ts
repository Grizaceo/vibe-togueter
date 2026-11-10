import { fail, type ActionRunContext } from "@agent-native/core/action";
import { eq } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";
import { isoNow } from "../db/timestamps.js";
import { arena } from "./arena.js";
import {
  delegationMatches,
  linkFresh,
  streamerUnlocked,
} from "./rules.js";

export function requireUser(ctx?: Pick<ActionRunContext, "userEmail">) {
  return (
    ctx?.userEmail ??
    fail("Sign in first.", { errorCode: "unauthorized", statusCode: 401 })
  );
}

export async function getUnlock(ownerEmail: string) {
  const [row] = await getDb()
    .select()
    .from(schema.streamerUnlocks)
    .where(eq(schema.streamerUnlocks.ownerEmail, ownerEmail))
    .limit(1);
  return row ?? null;
}

export async function getLink(ownerEmail: string) {
  const [row] = await getDb()
    .select()
    .from(schema.viewerLinks)
    .where(eq(schema.viewerLinks.ownerEmail, ownerEmail))
    .limit(1);
  return row ?? null;
}

export type ConsoleAccess = {
  email: string;
  streamer: { unlocked: boolean; expiresAt: string | null };
  moderator: boolean;
  link: { platform: string; displayName: string; linkedAt: string } | null;
  linkRow: typeof schema.viewerLinks.$inferSelect | null;
};

// Resolves who the caller is: streamer (fresh unlock row), delegated
// moderator (fresh moderator link + current controller grant), or viewer.
export async function resolveAccess(email: string): Promise<ConsoleAccess> {
  const [unlock, linkRow] = await Promise.all([getUnlock(email), getLink(email)]);
  const unlocked = streamerUnlocked(unlock, isoNow());
  let moderator = false;
  if (
    !unlocked &&
    linkRow &&
    linkFresh(linkRow.linkedAt, Date.now())
  ) {
    const state = (await arena("/community/state")) as {
      delegation?: { name?: string; platform?: string } | null;
    };
    moderator = delegationMatches(linkRow, state.delegation, Date.now());
  }
  return {
    email,
    streamer: {
      unlocked,
      expiresAt: unlocked ? unlock!.expiresAt : null,
    },
    moderator,
    link: linkRow
      ? {
          platform: linkRow.platform,
          displayName: linkRow.displayName,
          linkedAt: linkRow.linkedAt,
        }
      : null,
    linkRow,
  };
}

export async function streamerOnly(args: unknown, ctx?: ActionRunContext) {
  const email = requireUser(ctx);
  const access = await resolveAccess(email);
  if (!access.streamer.unlocked)
    fail("Unlock the console with the streamer key first.", {
      errorCode: "streamer_required",
      statusCode: 403,
    });
}

export async function streamerOrModerator(
  args: unknown,
  ctx?: ActionRunContext,
) {
  const email = requireUser(ctx);
  const access = await resolveAccess(email);
  if (!access.streamer.unlocked && !access.moderator)
    fail("This console view requires the streamer or a delegated moderator.", {
      errorCode: "console_access_required",
      statusCode: 403,
    });
}

export async function logDecision(
  ownerEmail: string,
  kind: (typeof schema.DECISION_KINDS)[number],
  detail: Record<string, unknown>,
) {
  await getDb()
    .insert(schema.consoleDecisions)
    .values({
      id: crypto.randomUUID(),
      ownerEmail,
      kind,
      detail: JSON.stringify(detail).slice(0, 2000),
      decidedVia: "streamer-ui",
      createdAt: isoNow(),
    });
}
