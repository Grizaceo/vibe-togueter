import { useEffect, useMemo, useState } from "react";
import { useT } from "@agent-native/core/client/i18n";
import {
  actionErrorMessage,
  callAction,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import {
  IconCircleCheck,
  IconClock,
  IconCopy,
  IconLock,
  IconLockOpen,
  IconPlayerPlay,
  IconPlayerStop,
  IconRefresh,
} from "@tabler/icons-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

const UNFINISHED = [
  "queued",
  "building",
  "quarantined",
  "testing",
  "cancel-requested",
  "reconcile-required",
  "tested",
];
const JOB_TERMINAL_FOR_CANCEL = [
  "cancelled",
  "failed",
  "reconcile-required",
  "reviewed-publication",
];

type Review = {
  roundId: string;
  revision: number;
  phase: string;
  reviewToken: string | null;
  selectedIdeas: { id: number; text: string; author: string; sha256: string }[];
  resourceManifest: { assets?: { id: string; title: string }[] } | null;
};

type ArtifactReview = {
  jobId: string;
  artifactHash: string;
  reportHash: string;
  source: string;
  report: unknown;
  ticket: Record<string, any>;
  gameAuthors?: { name: string }[] | undefined;
};

const failToast = (fallback: string) => (error: unknown) =>
  toast.error(actionErrorMessage(error) ?? fallback);

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function mmss(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function ConsolePage() {
  const t = useT();
  const access = useActionQuery("get-my-access", {}, { refetchInterval: 15000 });
  const role = (access.data as any)?.role;
  const canSee = role === "streamer" || role === "moderator";
  const streamer = role === "streamer";

  if (access.isPending)
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-6">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );

  if (!canSee) return <UnlockGate unlocked={false} expiresAt={null} />;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <UnlockGate
        unlocked={streamer}
        expiresAt={(access.data as any)?.streamer.expiresAt ?? null}
      />
      <RoundSection streamer={streamer} />
      <ReviewSection streamer={streamer} />
      <BuildSection streamer={streamer} />
      <ProposalsSection />
    </div>
  );
}

function UnlockGate({
  unlocked,
  expiresAt,
}: {
  unlocked: boolean;
  expiresAt: string | null;
}) {
  const t = useT();
  const [key, setKey] = useState("");
  const unlock = useActionMutation("unlock-streamer", {
    onError: failToast(t("console.unlockFailed")),
    onSuccess: () => setKey(""),
  });
  const lock = useActionMutation("lock-streamer", {
    onError: failToast(t("console.lockFailed")),
  });
  if (unlocked)
    return (
      <Card>
        <CardContent className="flex items-center justify-between gap-3 py-3">
          <span className="flex items-center gap-2 text-sm">
            <IconLockOpen className="size-4" />
            {t("console.unlockedUntil", {
              time: expiresAt ? new Date(expiresAt).toLocaleTimeString() : "",
            })}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => lock.mutate({})}
            disabled={lock.isPending}
          >
            <IconLock className="size-4" /> {t("console.lock")}
          </Button>
        </CardContent>
      </Card>
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("console.unlockTitle")}</CardTitle>
        <CardDescription>{t("console.unlockDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (key.trim()) unlock.mutate({ key: key.trim() });
          }}
        >
          <Input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={t("console.streamerKey")}
            autoComplete="off"
            className="max-w-xs"
          />
          <Button type="submit" disabled={!key.trim() || unlock.isPending}>
            {t("console.unlock")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function RoundSection({ streamer }: { streamer: boolean }) {
  const t = useT();
  const state = useActionQuery(
    "get-console-state",
    {},
    { refetchInterval: 5000 },
  );
  const resources = useActionQuery(
    "list-resources",
    {},
    { enabled: streamer },
  );
  const round = (state.data as any)?.round;
  const job = (state.data as any)?.build.job as Record<string, any> | null;
  const unfinished = !!job && UNFINISHED.includes(job.phase);
  const now = useNow();
  const [selected, setSelected] = useState<number[]>([]);
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [settings, setSettings] = useState({
    maxWords: 100,
    maxIdeas: 10,
    winnerCount: 1,
    voteSeconds: 45,
  });
  const manage = useActionMutation("manage-round", {
    onError: failToast(t("console.roundActionFailed")),
    onSuccess: () => {
      setSelected([]);
      setAssetIds([]);
    },
  });
  const act = (action: string, extra: Record<string, unknown> = {}) =>
    manage.mutate({ action, ...extra } as any);

  if (state.isPending) return <Skeleton className="h-64 w-full" />;
  const phase = round?.phase ?? "none";
  const votingLeft = round?.voteEndsAt ? round.voteEndsAt - now : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t("console.round")}{" "}
          <Badge variant="secondary">{phase}</Badge>
          {phase === "voting" && votingLeft != null && votingLeft > 0 && (
            <Badge variant="outline">
              <IconClock className="size-3" /> {mmss(votingLeft)}
            </Badge>
          )}
        </CardTitle>
        {round && (
          <CardDescription>
            {t("console.roundCounts", {
              ideas: round.ideas.length,
              voters: round.voters,
            })}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {round ? (
          <ul className="flex flex-col gap-2">
            {round.ideas.map((idea: any) => (
              <li
                key={idea.id}
                className="flex items-start gap-2 rounded-md border p-2 text-sm"
              >
                {streamer &&
                  ["awaiting-selection", "awaiting-approval"].includes(
                    phase,
                  ) && (
                    <Checkbox
                      aria-label={t("console.selectIdea", { id: idea.id })}
                      checked={selected.includes(idea.id)}
                      onCheckedChange={(checked) =>
                        setSelected((s) =>
                          checked === true
                            ? [...s, idea.id]
                            : s.filter((x) => x !== idea.id),
                        )
                      }
                    />
                  )}
                <span className="min-w-0 flex-1">
                  <span className="font-medium">#{idea.id}</span>{" "}
                  <span className="break-words">{idea.text}</span>
                  <span className="block text-xs text-muted-foreground">
                    {idea.author} · {idea.source ?? "chat"} ·{" "}
                    {t("console.votes", { count: idea.votes })}
                    {idea.selected ? " · " + t("console.selected") : ""}
                  </span>
                </span>
              </li>
            ))}
            {!round.ideas.length && (
              <li className="text-sm text-muted-foreground">
                {t("console.noIdeas")}
              </li>
            )}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("console.noRound")}</p>
        )}
        {streamer && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-2">
              {(["maxIdeas", "winnerCount", "voteSeconds", "maxWords"] as const).map(
                (k) => (
                  <Label key={k} className="flex flex-col gap-1 text-xs">
                    {k}
                    <Input
                      type="number"
                      className="w-24"
                      value={settings[k]}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          [k]: Number(e.target.value),
                        }))
                      }
                    />
                  </Label>
                ),
              )}
              <Button
                size="sm"
                disabled={unfinished || manage.isPending}
                onClick={() => act("open", { settings })}
              >
                {t("console.openRound")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={phase !== "collecting" || manage.isPending}
                onClick={() => act("start-vote")}
              >
                <IconPlayerPlay className="size-4" /> {t("console.startVote")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={phase !== "voting" || manage.isPending}
                onClick={() => act("close-vote")}
              >
                {t("console.closeVote")}
              </Button>
              {["awaiting-selection", "awaiting-approval"].includes(phase) && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!selected.length || manage.isPending}
                  onClick={() => act("select", { ideaIds: selected })}
                >
                  <IconCircleCheck className="size-4" />{" "}
                  {t("console.selectCount", { count: selected.length })}
                </Button>
              )}
              <Button
                size="sm"
                variant="destructive"
                disabled={!round || manage.isPending}
                onClick={() => act("cancel")}
              >
                <IconPlayerStop className="size-4" /> {t("console.cancelRound")}
              </Button>
            </div>
            {!!(resources.data as any)?.assets.length && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {t("console.resources")}
                </span>
                {(resources.data as any).assets.map((a: any) => (
                  <Label
                    key={a.id}
                    className="flex items-center gap-1 rounded border px-2 py-1 text-xs"
                  >
                    <Checkbox
                      checked={assetIds.includes(a.id)}
                      onCheckedChange={(checked) =>
                        setAssetIds((s) =>
                          checked === true
                            ? [...s, a.id]
                            : s.filter((x) => x !== a.id),
                        )
                      }
                    />
                    {a.title}
                  </Label>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!round || manage.isPending}
                  onClick={() => act("resources", { assetIds })}
                >
                  {t("console.chooseResources")}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewSection({ streamer }: { streamer: boolean }) {
  const t = useT();
  const state = useActionQuery(
    "get-console-state",
    {},
    { refetchInterval: 5000 },
  );
  const round = (state.data as any)?.round;
  const [locked, setLocked] = useState<Review | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const approve = useActionMutation("approve-round-input", {
    onError: failToast(t("console.approveFailed")),
    onSuccess: () => {
      setLocked(null);
      setConfirming(false);
    },
  });

  async function review() {
    setBusy(true);
    try {
      const r = (await callAction(
        "get-round-review",
        {},
        { method: "GET" },
      )) as Review | null;
      setLocked(r && r.reviewToken ? r : null);
      if (!r?.reviewToken) toast.error(t("console.nothingToApprove"));
    } catch (error) {
      toast.error(actionErrorMessage(error) ?? t("console.reviewFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmIntent() {
    // Re-read the snapshot right before approving: the exact locked token must
    // still be the controller's current review.
    setBusy(true);
    try {
      const r = (await callAction(
        "get-round-review",
        {},
        { method: "GET" },
      )) as Review | null;
      if (
        locked &&
        r &&
        r.roundId === locked.roundId &&
        r.reviewToken === locked.reviewToken &&
        r.phase === "awaiting-approval"
      )
        setConfirming(true);
      else {
        setLocked(r && r.reviewToken ? r : null);
        toast.error(t("console.reviewChanged"));
      }
    } catch (error) {
      toast.error(actionErrorMessage(error) ?? t("console.reviewFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (!streamer)
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("console.review")}</CardTitle>
          <CardDescription>{t("console.modReviewHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button size="sm" variant="outline" onClick={review} disabled={busy}>
            {t("console.reviewInput")}
          </Button>
          {locked && <ReviewSnapshot review={locked} />}
          {locked?.reviewToken && (
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded-md border bg-muted px-2 py-1 font-mono text-xs">
                !build approve {locked.reviewToken}
              </code>
              <Button
                size="icon"
                variant="outline"
                aria-label={t("console.copy")}
                onClick={() => {
                  void navigator.clipboard?.writeText(
                    `!build approve ${locked.reviewToken}`,
                  );
                  toast.success(t("console.copied"));
                }}
              >
                <IconCopy className="size-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("console.review")}</CardTitle>
        <CardDescription>{t("console.reviewDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={review}
            disabled={busy || round?.phase !== "awaiting-approval"}
          >
            <IconRefresh className="size-4" /> {t("console.reviewInput")}
          </Button>
          <Button
            size="sm"
            disabled={
              !locked ||
              !locked.reviewToken ||
              locked.roundId !== round?.id ||
              round?.phase !== "awaiting-approval" ||
              busy ||
              approve.isPending
            }
            onClick={confirmIntent}
          >
            {t("console.approveInput")}
          </Button>
        </div>
        {locked && <ReviewSnapshot review={locked} />}
      </CardContent>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("console.approveInputTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("console.approveInputBody", {
                token: `${locked?.reviewToken?.slice(0, 12)}…`,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("console.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                locked?.reviewToken &&
                approve.mutate({
                  roundId: locked.roundId,
                  reviewToken: locked.reviewToken,
                })
              }
            >
              {t("console.approveInput")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function ReviewSnapshot({ review }: { review: Review }) {
  const t = useT();
  return (
    <div className="rounded-md border p-3 text-sm">
      <div className="text-xs text-muted-foreground">
        {review.roundId} · rev {review.revision} · {review.phase} ·{" "}
        {t("console.token", { token: `${review.reviewToken?.slice(0, 12)}…` })}
      </div>
      <ul className="mt-2 flex flex-col gap-1">
        {review.selectedIdeas.map((idea) => (
          <li key={idea.id} className="break-words">
            <span className="font-medium">#{idea.id}</span> {idea.text}{" "}
            <span className="text-xs text-muted-foreground">
              {idea.author} · {idea.sha256.slice(0, 8)}
            </span>
          </li>
        ))}
      </ul>
      {!!review.resourceManifest?.assets?.length && (
        <div className="mt-2 text-xs text-muted-foreground">
          {t("console.resources")}:{" "}
          {review.resourceManifest.assets.map((a) => a.title).join(", ")}
        </div>
      )}
    </div>
  );
}

function BuildSection({ streamer }: { streamer: boolean }) {
  const t = useT();
  const state = useActionQuery(
    "get-console-state",
    {},
    { refetchInterval: 5000 },
  );
  const round = (state.data as any)?.round;
  const build = (state.data as any)?.build;
  const job = build?.job as Record<string, any> | null;
  const warm = build?.warm as Record<string, any> | null;
  const unfinished = !!job && UNFINISHED.includes(job.phase);
  const now = useNow();
  const [artifact, setArtifact] = useState<ArtifactReview | null>(null);
  const [rights, setRights] = useState(false);
  const [creator, setCreator] = useState("");
  const [confirming, setConfirming] = useState(false);
  const vm = useActionMutation("manage-vm-lease", {
    onError: failToast(t("console.vmFailed")),
    onSuccess: (r: any) => {
      if (r?.instructionsFile)
        toast.success(t("console.vmPrepared", { file: r.instructionsFile }));
    },
  });
  const jobAct = useActionMutation("manage-build-job", {
    onError: failToast(t("console.jobFailed")),
  });
  const publish = useActionMutation("approve-artifact", {
    onError: failToast(t("console.publishFailed")),
    onSuccess: () => {
      setArtifact(null);
      setRights(false);
      setConfirming(false);
    },
  });
  async function inspect() {
    try {
      const r = (await callAction(
        "inspect-artifact",
        { jobId: job!.id },
        { method: "GET" },
      )) as any;
      const ticket = r.ticket;
      const prior = ticket.approval?.contributors?.gameAuthors as
        | { name: string }[]
        | undefined;
      setArtifact({
        jobId: r.job.id,
        artifactHash: ticket.artifactHash ?? "",
        reportHash: ticket.reportHash ?? "",
        source: ticket.source ?? "",
        report: {
          quarantineState: ticket.state,
          codeSha256: ticket.codeSha256,
          artifactHash: ticket.artifactHash,
          reportHash: ticket.reportHash,
          communityCredit: ticket.communityCredit,
          resourceManifest: ticket.resources,
          artifactApproval: ticket.approval,
          report: ticket.report,
          construction: r.job.construction,
          cleanup: r.job.cleanup,
        },
        ticket,
        gameAuthors: prior,
      });
      setRights(false);
      setCreator(prior?.map((a) => a.name).join(" · ") ?? "");
    } catch (error) {
      toast.error(actionErrorMessage(error) ?? t("console.inspectFailed"));
    }
  }
  const seconds = warm?.expiresAt
    ? Math.max(0, Math.floor((warm.expiresAt - now) / 1000))
    : 0;
  const publishEnabled =
    streamer &&
    rights &&
    creator.trim() &&
    artifact &&
    job?.cleanupConfirmed === true &&
    job.id === artifact.jobId &&
    job.artifactHash === artifact.artifactHash &&
    job.reportHash === artifact.reportHash &&
    job.phase === "tested";

  if (!streamer) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("console.build")}</CardTitle>
        <CardDescription>
          {job
            ? `${job.phase} · ${job.message ?? ""} · ${
                job.cleanupConfirmed
                  ? t("console.cleanupConfirmed")
                  : t("console.cleanupPending")
              }`
            : build?.enabled
              ? t("console.workerEnabled")
              : t("console.workerDisabled")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="text-sm">
          {!warm?.enabled
            ? t("console.warmDisabled")
            : warm.phase === "prepared"
              ? t("console.warmPrepared", {
                  clock: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`,
                  max: warm.maxExpiresAt
                    ? new Date(warm.maxExpiresAt).toLocaleTimeString()
                    : "",
                  warning: warm.readinessWarning
                    ? ` · ${warm.readinessWarning}`
                    : seconds < 120
                      ? warm.canExtend
                        ? ` · ${t("console.expiryNearExtend")}`
                        : ` · ${t("console.expiryNearClosed")}`
                      : "",
                })
              : t("console.warmPhase", { phase: warm.phase })}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!warm?.canPrepare || unfinished || vm.isPending}
            onClick={() => vm.mutate({ action: "prepare" })}
          >
            {t("console.prepare")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={
              !warm?.canExtend || warm.phase !== "prepared" || vm.isPending
            }
            onClick={() => vm.mutate({ action: "extend" })}
          >
            {t("console.extend")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!warm?.canClose || vm.isPending}
            onClick={() => vm.mutate({ action: "close" })}
          >
            {t("console.close")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!build?.enabled || unfinished || jobAct.isPending}
            onClick={() => jobAct.mutate({ action: "check" })}
          >
            {t("console.checkJob")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={
              !build?.enabled ||
              warm?.phase === "preparing" ||
              round?.phase !== "approved" ||
              unfinished ||
              jobAct.isPending
            }
            onClick={() =>
              jobAct.mutate({
                action: "dispatch",
                roundId: round?.id,
                approvedInputHash: round?.approvedInputHash ?? undefined,
              })
            }
          >
            {t("console.dispatch")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={
              !job ||
              JOB_TERMINAL_FOR_CANCEL.includes(job.phase) ||
              jobAct.isPending
            }
            onClick={() => jobAct.mutate({ action: "cancel", jobId: job?.id })}
          >
            {t("console.cancelJob")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={job?.phase !== "reconcile-required" || jobAct.isPending}
            onClick={() => jobAct.mutate({ action: "reconcile", jobId: job?.id })}
          >
            {t("console.reconcile")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!job}
            onClick={inspect}
          >
            {t("console.inspect")}
          </Button>
        </div>
        {artifact && (
          <div className="flex flex-col gap-3 rounded-md border p-3">
            <textarea
              readOnly
              value={artifact.source || t("console.noCandidate")}
              className="h-56 w-full resize-y overflow-auto rounded-md border bg-muted p-2 font-mono text-xs"
            />
            <pre className="max-h-56 overflow-auto rounded-md border bg-muted p-2 text-xs">
              {JSON.stringify(artifact.report, null, 2)}
            </pre>
            <div className="flex flex-wrap items-center gap-3">
              <Label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={rights}
                  onCheckedChange={(c) => setRights(c === true)}
                />
                {t("console.rights")}
              </Label>
              <Input
                className="max-w-xs"
                placeholder={t("console.creatorName")}
                value={creator}
                readOnly={!!artifact.gameAuthors}
                onChange={(e) => setCreator(e.target.value)}
              />
              <AlertDialog open={confirming} onOpenChange={setConfirming}>
                <Button
                  size="sm"
                  disabled={!publishEnabled || publish.isPending}
                  onClick={() => setConfirming(true)}
                >
                  {t("console.approveArtifact")}
                </Button>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t("console.approveArtifactTitle")}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("console.approveArtifactBody", {
                        hash: artifact.artifactHash.slice(0, 12),
                      })}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("console.cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        publish.mutate({
                          jobId: artifact.jobId,
                          artifactHash: artifact.artifactHash,
                          reportHash: artifact.reportHash,
                          ...(artifact.gameAuthors
                            ? {}
                            : { creatorName: creator.trim() }),
                          rightsAttested: true as const,
                        })
                      }
                    >
                      {t("console.approveArtifact")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProposalsSection() {
  const t = useT();
  const proposals = useActionQuery(
    "list-proposals",
    {},
    { refetchInterval: 15000 },
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("console.proposals")}</CardTitle>
        <CardDescription>{t("console.proposalsHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        {!(proposals.data as any)?.proposals.length ? (
          <p className="text-sm text-muted-foreground">
            {t("console.noProposals")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {(proposals.data as any).proposals.map((p: any) => (
              <li key={p.id} className="rounded-md border p-2">
                <Badge variant="outline">{p.kind}</Badge>{" "}
                <span className="break-words">{p.summary}</span>
                <span className="block text-xs text-muted-foreground">
                  {p.ownerEmail} · {new Date(p.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
