import { useEffect, useState } from "react";
import { useT } from "@agent-native/core/client/i18n";
import {
  actionErrorMessage,
  callAction,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { IconCopy, IconLink } from "@tabler/icons-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

const failToast = (fallback: string) => (error: unknown) =>
  toast.error(actionErrorMessage(error) ?? fallback);

type LinkStatus = {
  status: "none" | "pending" | "linked" | "expired" | "failed";
  code: string | null;
  expiresAt: number | null;
  reason: string | null;
  link: { platform: string; displayName: string; linkedAt: string } | null;
};

export default function MePage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <IdentityCard />
      <ProfileCard />
      <ReportCard />
    </div>
  );
}

function IdentityCard() {
  const t = useT();
  const [tick, setTick] = useState(0);
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const start = useActionMutation("start-identity-link", {
    onError: failToast(t("me.linkFailed")),
    onSuccess: () => setTick((n) => n + 1),
  });

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const s = (await callAction(
          "get-identity-link",
          {},
          { method: "GET" },
        )) as LinkStatus;
        if (stop) return;
        setStatus(s);
        if (s.status === "pending") timer = setTimeout(poll, 2000);
      } catch {
        if (!stop) timer = setTimeout(poll, 5000);
      }
    };
    void poll();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [tick]);

  if (!status) return <Skeleton className="h-40 w-full" />;
  const pending = status.status === "pending" && status.code;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconLink className="size-4" /> {t("me.identity")}
        </CardTitle>
        <CardDescription>{t("me.identityHint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {status.link && (
          <div className="text-sm">
            {t("me.linkedAs", {
              name: status.link.displayName,
              platform: status.link.platform,
            })}{" "}
            <Badge variant="outline">{status.link.platform}</Badge>
          </div>
        )}
        {pending ? (
          <div className="flex flex-col items-start gap-2">
            <div className="flex items-center gap-2">
              <code className="rounded-md border bg-muted px-4 py-2 text-2xl font-semibold tracking-widest">
                !join {status.code}
              </code>
              <Button
                size="icon"
                variant="outline"
                aria-label={t("me.copy")}
                onClick={() => {
                  void navigator.clipboard?.writeText(`!join ${status.code}`);
                  toast.success(t("me.copied"));
                }}
              >
                <IconCopy className="size-4" />
              </Button>
            </div>
            <span className="text-xs text-muted-foreground">
              {t("me.codeExpires", {
                time: status.expiresAt
                  ? new Date(status.expiresAt).toLocaleTimeString()
                  : "",
              })}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              onClick={() => start.mutate({})}
              disabled={start.isPending}
            >
              {status.link ? t("me.relink") : t("me.link")}
            </Button>
            {status.status === "failed" && status.reason && (
              <span className="text-xs text-destructive">{status.reason}</span>
            )}
            {status.status === "expired" && (
              <span className="text-xs text-muted-foreground">
                {t("me.expired")}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProfileCard() {
  const t = useT();
  const access = useActionQuery("get-my-access", {}, { refetchInterval: 15000 });
  const profile = useActionQuery(
    "get-my-profile",
    {},
    {
      enabled: !!(access.data as any)?.link,
      refetchInterval: 8000,
      retry: false,
    },
  );
  if (!(access.data as any)?.link) return null;
  const data = profile.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("me.profile")}</CardTitle>
        {data && (
          <CardDescription>
            {t("me.totals", {
              ideas: data.totals.ideas,
              ballots: data.totals.ballots,
              credits: data.totals.credits,
            })}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {!data ? (
          <Skeleton className="h-32 w-full" />
        ) : !data.rounds.length ? (
          <p className="text-sm text-muted-foreground">{t("me.noRounds")}</p>
        ) : (
          <ul className="flex flex-col gap-3 text-sm">
            {(data.rounds as any[]).map((r) => (
              <li key={r.roundId} className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">
                  {r.phase} · {new Date(r.openedAt).toLocaleString()}
                  {r.credited ? ` · ${t("me.credited")}` : ""}
                </div>
                <ul className="mt-1 flex flex-col gap-1">
                  {r.ideas.map((i: any) => (
                    <li key={i.id} className="break-words">
                      #{i.id} {i.text}{" "}
                      <span className="text-xs text-muted-foreground">
                        {t("me.votes", { count: i.votes })}
                        {i.selected ? ` · ${t("me.selected")}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
                {r.ballot && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t("me.ballot", { id: r.ballot.ideaId })}
                    {r.ballot.selected ? ` · ${t("me.selected")}` : ""}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ReportCard() {
  const t = useT();
  const state = useActionQuery("get-my-access", {}, { refetchInterval: 15000 });
  const [game, setGame] = useState("");
  const [version, setVersion] = useState("live");
  const [description, setDescription] = useState("");
  const [activity, setActivity] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const create = useActionMutation("create-report", {
    onError: failToast(t("me.reportFailed")),
    onSuccess: (r: any) => {
      setDone(r.id);
      setDescription("");
      setActivity("");
    },
  });
  // Prefill the game name from the caller's access snapshot (public state —
  // never the streamer-only console-state action).
  useEffect(() => {
    const live = (state.data as any)?.liveGame;
    if (live) setGame((g) => g || live);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.data]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("me.report")}</CardTitle>
        <CardDescription>{t("me.reportHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        {done ? (
          <div className="flex flex-col gap-2 text-sm">
            <p>{t("me.reportSent", { id: done })}</p>
            <Button
              size="sm"
              variant="outline"
              className="w-fit"
              onClick={() => setDone(null)}
            >
              {t("me.reportAnother")}
            </Button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate({
                game: game.trim(),
                version: version.trim(),
                description: description.trim(),
                activity: activity.trim(),
              });
            }}
          >
            <div className="flex gap-2">
              <Label className="flex flex-1 flex-col gap-1 text-xs">
                {t("me.game")}
                <Input
                  value={game}
                  maxLength={80}
                  onChange={(e) => setGame(e.target.value)}
                />
              </Label>
              <Label className="flex w-36 flex-col gap-1 text-xs">
                {t("me.version")}
                <Input
                  value={version}
                  maxLength={80}
                  onChange={(e) => setVersion(e.target.value)}
                />
              </Label>
            </div>
            <Label className="flex flex-col gap-1 text-xs">
              {t("me.what")}
              <Textarea
                value={description}
                maxLength={500}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Label>
            <Label className="flex flex-col gap-1 text-xs">
              {t("me.doing")}
              <Textarea
                value={activity}
                maxLength={300}
                onChange={(e) => setActivity(e.target.value)}
              />
            </Label>
            <Button
              type="submit"
              size="sm"
              className="w-fit"
              disabled={
                !game.trim() ||
                !version.trim() ||
                !description.trim() ||
                !activity.trim() ||
                create.isPending
              }
            >
              {t("me.sendReport")}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
