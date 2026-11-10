import {
  $,
  state,
  ownerHeaders,
  reviewedArtifact,
  warmBusy,
  message,
  setReviewedArtifact,
  setWarmBusy,
} from "./shared.js";
import { drawFrame } from "../render.js";
import { refresh } from "../studio.js";

function manifestSummary(report) {
  if (!report) return "";
  if (report.manifestError)
    return "Invalid manifest: " + report.manifestError;
  const m = report.manifest;
  if (!m) return "";
  if (m.legacy) return "Legacy game: no manifest (derived)";
  const lines = [
    `Manifest va-game/1 · delivery ${m.delivery?.join("+") || "?"}`,
    `Seats: player ${m.seats?.player ?? "unlimited"} · spectator ${m.seats?.spectator ?? "unlimited"} · streamer ${m.seats?.streamer ?? 0}`,
    `Input: keys [${(m.input?.keys || []).join(", ") || "none"}] · pointer ${m.input?.pointer ? "yes" : "no"}${m.input?.actions?.length ? ` · actions: ${m.input.actions.map((a) => a.name).join(", ")}` : ""}`,
  ];
  for (const c of m.chat?.commands || [])
    lines.push(
      `Command !${c.name} — who ${c.who} · ${c.perActorMs} ms/actor${c.globalPerSec ? ` · ${c.globalPerSec}/s` : ""} · args ${c.args.length}`,
    );
  for (const b of m.chat?.bursts || [])
    lines.push(
      `Burst ${b.name} — token ${b.token} · ${b.distinct} distinct in ${b.windowMs} ms`,
    );
  return lines.join("\n");
}

export function renderWorker() {
  const b = state?.build,
    j = b?.job,
    w = b?.warm,
    unfinished =
      j &&
      [
        "queued",
        "building",
        "quarantined",
        "testing",
        "cancel-requested",
        "reconcile-required",
        "tested",
      ].includes(j.phase);
  $("worker-status").textContent = j
    ? `${j.phase} · ${j.message} · ${j.cleanupConfirmed ? "guest cleanup confirmed" : "cleanup pending/unknown"} · no live runtime`
    : "Worker " +
      (b?.enabled
        ? "enabled; Build checks the approved guest lease and login before dispatch."
        : "off in this public demo — enabled per approved run. Playable games remain available.");
  const seconds = w?.expiresAt
      ? Math.max(0, Math.floor((w.expiresAt - Date.now()) / 1000))
      : 0,
    clock =
      String(Math.floor(seconds / 60)) +
      ":" +
      String(seconds % 60).padStart(2, "0");
  $("warm-status").textContent = !w?.enabled
    ? "VM preparation: off — available with an approved build allocation."
    : w.phase === "prepared"
      ? `VM prepared · ${clock} remaining · approved maximum until ${new Date(w.maxExpiresAt).toLocaleTimeString()}${seconds < 120 ? (w.canExtend ? " · expiry is near; extend now or close." : " · expiry is near; the approved extension window is closed.") : ""}${w.readinessWarning ? " · " + w.readinessWarning : ""}`
      : "VM preparation: " + w.phase + ".";
  $("prepare-warm").disabled =
    !ownerHeaders || warmBusy || !w?.canPrepare || !!unfinished;
  $("extend-warm").disabled =
    !ownerHeaders || warmBusy || !w?.canExtend || w.phase !== "prepared";
  $("close-warm").disabled = !ownerHeaders || warmBusy || !w?.canClose;
  $("check-worker").disabled = !ownerHeaders || !b?.enabled || !!unfinished;
  $("dispatch-worker").disabled =
    !ownerHeaders ||
    !b?.enabled ||
    w?.phase === "preparing" ||
    state.round?.phase !== "approved" ||
    !!unfinished;
  $("cancel-worker").disabled =
    !ownerHeaders ||
    !j ||
    [
      "cancelled",
      "failed",
      "reconcile-required",
      "reviewed-publication",
    ].includes(j.phase);
  $("reconcile-worker").disabled =
    !ownerHeaders || j?.phase !== "reconcile-required";
  $("inspect-worker").disabled = !ownerHeaders || !j;
  $("publish-review").disabled =
    !ownerHeaders ||
    !$("artifact-rights").checked ||
    !$("artifact-creator").value.trim() ||
    !reviewedArtifact ||
    !j?.cleanupConfirmed ||
    j.id !== reviewedArtifact.id ||
    j.artifactHash !== reviewedArtifact.artifactHash ||
    j.reportHash !== reviewedArtifact.reportHash ||
    j.phase !== "tested";
  for (const button of document.querySelectorAll("[data-round]"))
    if (button.dataset.round === "open") button.disabled = !!unfinished;
}
async function workerAction(body) {
  if (!ownerHeaders) throw Error("Unlock local streamer controls.");
  const response = await fetch("/admin/studio-builds", {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Isolated worker action failed.");
  await refresh();
  return data;
}
async function warmAction(action) {
  if (!ownerHeaders) throw Error("Unlock local streamer controls.");
  setWarmBusy(true);
  renderWorker();
  $("warm-message").textContent =
    action === "prepare"
      ? "Preparing the private VM; no model call."
      : "Updating the exact VM session…";
  try {
    const response = await fetch("/admin/builder-session", {
        method: "POST",
        headers: ownerHeaders,
        body: JSON.stringify({ action }),
      }),
      result = await response.json();
    if (!response.ok) throw Error(result.error || "VM session action failed.");
    await refresh();
    $("warm-message").textContent =
      action === "prepare"
        ? "VM prepared. Complete OpenAI login using the private local instructions file: " +
          result.instructionsFile
        : action === "extend"
          ? "VM deadline extended within the approved maximum."
          : "VM closure confirmed.";
  } finally {
    setWarmBusy(false);
    renderWorker();
  }
}

export function initWorker() {
  $("check-worker").onclick = () =>
    workerAction({ action: "check" }).catch((error) =>
      message("worker-message", error),
    );
  $("dispatch-worker").onclick = () =>
    workerAction({
      action: "dispatch",
      roundId: state.round?.id,
      approvedInputHash: state.round?.approvedInputHash,
    }).catch((error) => message("worker-message", error));
  $("cancel-worker").onclick = () =>
    workerAction({ action: "cancel", id: state.build.job.id }).catch((error) =>
      message("worker-message", error),
    );
  $("reconcile-worker").onclick = () =>
    workerAction({ action: "reconcile", id: state.build.job.id }).catch(
      (error) => message("worker-message", error),
    );
  $("inspect-worker").onclick = async () => {
    try {
      const { job, ticket } = await workerAction({
        action: "inspect",
        id: state.build.job.id,
      });
      setReviewedArtifact(
        ["tested", "approved"].includes(ticket.state)
          ? {
              id: job.id,
              artifactHash: ticket.artifactHash,
              reportHash: ticket.reportHash,
              ...(ticket.approval?.contributors
                ? { gameAuthors: ticket.approval.contributors.gameAuthors }
                : {}),
            }
          : null,
      );
      $("artifact-source").value = ticket.source || "No candidate received.";
      $("artifact-manifest").textContent = manifestSummary(ticket.report);
      $("artifact-report").textContent = JSON.stringify(
        {
          quarantineState: ticket.state,
          codeSha256: ticket.codeSha256,
          artifactHash: ticket.artifactHash,
          reportHash: ticket.reportHash,
          communityCredit: ticket.communityCredit,
          resourceManifest: ticket.resources,
          artifactApproval: ticket.approval,
          report: ticket.report,
          construction: job.construction,
          cleanup: job.cleanup,
        },
        null,
        2,
      );
      $("artifact-rights").checked = false;
      $("artifact-creator").readOnly = !!reviewedArtifact?.gameAuthors;
      $("artifact-creator").value =
        reviewedArtifact?.gameAuthors?.map((a) => a.name).join(" · ") ||
        (state.channel ? state.channel + " · Codex-assisted" : "");
      $("artifact-review").hidden = false;
      if (job.preview) {
        const canvas = $("test-preview"),
          context = canvas.getContext("2d");
        let count = 0;
        const paint = () => {
          drawFrame(context, job.preview, canvas, job.preview.world);
          if (++count < 60) requestAnimationFrame(paint);
        };
        paint();
      }
      renderWorker();
    } catch (error) {
      message("worker-message", error);
    }
  };
  $("artifact-rights").onchange = renderWorker;
  $("artifact-creator").oninput = renderWorker;
  $("publish-review").onclick = async () => {
    try {
      await workerAction({
        action: "publish-review",
        ...reviewedArtifact,
        gameAuthors: reviewedArtifact?.gameAuthors || [
          { name: $("artifact-creator").value.trim() },
        ],
        rightsAttested: $("artifact-rights").checked,
      });
      setReviewedArtifact(null);
      $("worker-message").textContent =
        "Reviewed artifact evidence saved locally. No game runtime was deployed.";
      renderWorker();
    } catch (error) {
      message("worker-message", error);
    }
  };

  for (const [id, action] of [
    ["prepare-warm", "prepare"],
    ["extend-warm", "extend"],
    ["close-warm", "close"],
  ])
    $(id).onclick = () =>
      warmAction(action).catch((error) => message("warm-message", error));
  setInterval(() => {
    if (ownerHeaders) renderWorker();
  }, 1000);
}
