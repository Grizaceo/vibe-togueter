import { useState } from "react";
import { useT } from "@agent-native/core/client/i18n";
import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

type Report = {
  id: string;
  displayName: string | null;
  sub: string | null;
  ownerEmail: string;
  game: string;
  version: string;
  description: string;
  activity: string;
  status: string;
  resolution: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

export default function ReportsPage() {
  const t = useT();
  const access = useActionQuery("get-my-access", {}, { refetchInterval: 15000 });
  const [status, setStatus] = useState<"open" | "resolved" | "all">("open");
  const reports = useActionQuery(
    "list-reports",
    { status },
    { enabled: (access.data as any)?.role === "streamer", refetchInterval: 10000 },
  );
  const [resolving, setResolving] = useState<Report | null>(null);
  const [note, setNote] = useState("");
  const resolve = useActionMutation("resolve-report", {
    onError: (e) =>
      toast.error(actionErrorMessage(e) ?? t("reports.resolveFailed")),
    onSuccess: () => {
      setResolving(null);
      setNote("");
    },
  });
  if (access.isPending)
    return (
      <div className="mx-auto w-full max-w-4xl p-6">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-6">
      <div className="w-48">
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as typeof status)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">{t("reports.open")}</SelectItem>
            <SelectItem value="resolved">{t("reports.resolved")}</SelectItem>
            <SelectItem value="all">{t("reports.all")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {!reports.data?.reports.length ? (
        <p className="text-sm text-muted-foreground">{t("reports.none")}</p>
      ) : (
        reports.data.reports.map((r: Report) => (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {r.game} <span className="text-xs">{r.version}</span>
                <Badge
                  variant={r.status === "open" ? "default" : "secondary"}
                >
                  {r.status}
                </Badge>
              </CardTitle>
              <CardDescription>
                {r.displayName ?? r.ownerEmail}
                {r.sub ? ` · ${r.sub}` : ""} ·{" "}
                {new Date(r.createdAt).toLocaleString()}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p className="break-words">{r.description}</p>
              <p className="text-xs text-muted-foreground">
                {t("reports.doing", { activity: r.activity })}
              </p>
              {r.resolution && (
                <p className="rounded-md border p-2 text-xs">
                  {t("reports.resolution", {
                    note: r.resolution,
                    by: r.resolvedBy ?? "",
                    at: r.resolvedAt
                      ? new Date(r.resolvedAt).toLocaleString()
                      : "",
                  })}
                </p>
              )}
              {r.status === "open" && (
                <div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setResolving(r)}
                  >
                    {t("reports.resolve")}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
      <Dialog
        open={!!resolving}
        onOpenChange={(open) => !open && setResolving(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("reports.resolveTitle")}</DialogTitle>
            <DialogDescription>{resolving?.description}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("reports.resolutionNote")}
          />
          <DialogFooter>
            <Button
              disabled={!note.trim() || resolve.isPending}
              onClick={() =>
                resolving &&
                resolve.mutate({ id: resolving.id, resolution: note.trim() })
              }
            >
              {t("reports.resolve")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
