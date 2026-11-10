import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getLink, requireUser } from "../server/lib/access.js";
import { identityLinkStatus } from "../server/lib/seat-link.js";

export default defineAction({
  description:
    "Current identity-link state: none, pending (with code), linked, expired or failed. UI only; never agent-visible.",
  schema: z.object({}),
  outputSchema: z.object({
    status: z.enum(["none", "pending", "linked", "expired", "failed"]),
    code: z.string().nullable(),
    expiresAt: z.number().nullable(),
    reason: z.string().nullable(),
    link: z
      .object({
        platform: z.string(),
        displayName: z.string(),
        linkedAt: z.string(),
      })
      .nullable(),
  }),
  http: { method: "GET" },
  readOnly: true,
  agentTool: false,
  persistInBrowser: false,
  run: async (_args, ctx) => {
    const email = requireUser(ctx);
    const pending = identityLinkStatus(email);
    const linkRow = pending?.link
      ? null
      : await getLink(email);
    const link =
      pending?.link ??
      (linkRow
        ? {
            platform: linkRow.platform,
            displayName: linkRow.displayName,
            linkedAt: linkRow.linkedAt,
          }
        : null);
    if (!pending)
      return {
        status: link ? ("linked" as const) : ("none" as const),
        code: null,
        expiresAt: null,
        reason: null,
        link,
      };
    return {
      status: pending.status,
      code: pending.status === "pending" ? pending.code : null,
      expiresAt: pending.status === "pending" ? pending.expiresAt : null,
      reason: pending.reason ?? null,
      link,
    };
  },
});
