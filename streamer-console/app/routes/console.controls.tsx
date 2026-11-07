import { useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

export default function ControlsPage() {
  const t = useT();
  const access = useActionQuery("get-my-access", {}, { refetchInterval: 15000 });
  const streamer = (access.data as any)?.role === "streamer";
  const controls = useActionQuery(
    "get-controls",
    {},
    { enabled: streamer, refetchInterval: 10000 },
  );
  const [order, setOrder] = useState("");
  const [login, setLogin] = useState("");
  const [minutes, setMinutes] = useState(10);
  useEffect(() => {
    if (controls.data && !order)
      setOrder(
        controls.data.fallback.order
          .filter((id) => id !== "marble-race")
          .join(", "),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls.data]);
  const saveOrder = useActionMutation("save-fallback-order", {
    onError: (e) =>
      toast.error(actionErrorMessage(e) ?? t("controls.saveFailed")),
    onSuccess: () => toast.success(t("controls.orderSaved")),
  });
  const delegate = useActionMutation("set-approval-delegation", {
    onError: (e) =>
      toast.error(actionErrorMessage(e) ?? t("controls.delegateFailed")),
  });
  if (access.isPending)
    return (
      <div className="mx-auto w-full max-w-4xl p-6">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  const grant = controls.data?.delegation?.grant as Record<string, any> | null;
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("controls.fallback")}</CardTitle>
          <CardDescription>{t("controls.fallbackHint")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Input
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            placeholder="community-grove, chat-vs-streamer, demo"
          />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {t("controls.alwaysLast")} <Badge variant="outline">marble-race</Badge>
          </div>
          <div>
            <Button
              size="sm"
              disabled={
                !controls.data?.fallback.enabled || saveOrder.isPending
              }
              onClick={() =>
                saveOrder.mutate({
                  order: order
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .slice(0, 10),
                })
              }
            >
              {t("controls.saveOrder")}
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("controls.delegation")}</CardTitle>
          <CardDescription>
            {grant
              ? t("controls.currentGrant", {
                  name: grant.name,
                  platform: grant.platform,
                  expires: new Date(grant.expiresAt).toLocaleTimeString(),
                })
              : t("controls.noGrant")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <Label className="flex flex-col gap-1 text-xs">
            {t("controls.login")}
            <Input
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              className="w-40"
            />
          </Label>
          <Label className="flex flex-col gap-1 text-xs">
            {t("controls.minutes")}
            <Input
              type="number"
              min={1}
              max={30}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              className="w-24"
            />
          </Label>
          <Button
            size="sm"
            disabled={
              !/^[a-zA-Z0-9_]{1,25}$/.test(login) ||
              minutes < 1 ||
              minutes > 30 ||
              delegate.isPending
            }
            onClick={() =>
              delegate.mutate({ action: "grant", login, minutes })
            }
          >
            {t("controls.grant")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!grant || delegate.isPending}
            onClick={() => delegate.mutate({ action: "revoke" })}
          >
            {t("controls.revoke")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
