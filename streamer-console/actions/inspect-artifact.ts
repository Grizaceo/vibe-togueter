import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { streamerOnly } from "../server/lib/access.js";
import { arena } from "../server/lib/arena.js";

// The quarantined candidate exactly as the Studio page shows it: source in a
// read-only view plus hashes and report. Hidden from the agent and never
// persisted in the browser: candidate source must not enter agent context.
export default defineAction({
  description:
    "Inspect a build job's quarantined artifact: candidate source, report and hashes. Streamer UI only.",
  schema: z.object({
    jobId: z.string().describe("Studio build job id"),
  }),
  outputSchema: z.object({
    job: z.object({
      id: z.string(),
      phase: z.string(),
      cleanupConfirmed: z.boolean(),
      construction: z.unknown().nullable(),
      cleanup: z.unknown().nullable(),
    }),
    ticket: z.object({
      state: z.string(),
      codeSha256: z.string().nullable(),
      artifactHash: z.string().nullable(),
      reportHash: z.string().nullable(),
      source: z.string().nullable(),
      report: z.unknown().nullable(),
      communityCredit: z.unknown().nullable(),
      resources: z.unknown().nullable(),
      approval: z.unknown().nullable(),
    }),
  }),
  http: { method: "GET" },
  readOnly: true,
  agentTool: false,
  persistInBrowser: false,
  authorize: streamerOnly,
  run: async ({ jobId }) => {
    const data = (await arena("/admin/studio-builds", {
      method: "POST",
      body: { action: "inspect", id: jobId },
      streamer: true,
    })) as { job?: Record<string, any>; ticket?: Record<string, any> };
    if (!data.job || !data.ticket)
      fail("The controller returned no artifact for that job.", {
        errorCode: "controller_rejected",
        statusCode: 409,
      });
    return {
      job: {
        id: data.job.id,
        phase: data.job.phase,
        cleanupConfirmed: data.job.cleanup?.confirmed === true,
        construction: data.job.construction ?? null,
        cleanup: data.job.cleanup ?? null,
      },
      ticket: {
        state: data.ticket.state,
        codeSha256: data.ticket.codeSha256 ?? null,
        artifactHash: data.ticket.artifactHash ?? null,
        reportHash: data.ticket.reportHash ?? null,
        source: data.ticket.source ?? null,
        report: data.ticket.report ?? null,
        communityCredit: data.ticket.communityCredit ?? null,
        resources: data.ticket.resources ?? null,
        approval: data.ticket.approval ?? null,
      },
    };
  },
});
