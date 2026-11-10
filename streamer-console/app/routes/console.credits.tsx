import { useT } from "@agent-native/core/client/i18n";
import { useActionQuery } from "@agent-native/core/client/hooks";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type Person = { name: string; url?: string };

function CreditList({
  label,
  people,
}: {
  label: string;
  people?: Person[] | null;
}) {
  if (!people?.length) return null;
  return (
    <div className="text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <ul className="ml-4 list-disc">
        {people.map((p, i) => (
          <li key={`${p.name}-${i}`}>
            {p.url ? (
              <a
                className="underline"
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {p.name}
              </a>
            ) : (
              p.name
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CreditsPage() {
  const t = useT();
  const access = useActionQuery("get-my-access", {}, { refetchInterval: 15000 });
  const credits = useActionQuery(
    "get-community-credits",
    {},
    {
      refetchInterval: 10000,
      enabled: (access.data as any)?.role === "streamer" || (access.data as any)?.role === "moderator",
    },
  );
  if (access.isPending || credits.isPending)
    return (
      <div className="mx-auto w-full max-w-4xl p-6">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  const live = credits.data?.liveGame as Record<string, any> | null;
  const rounds = (credits.data?.rounds ?? []) as Record<string, any>[];
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("credits.rounds")}</CardTitle>
        </CardHeader>
        <CardContent>
          {!rounds.length ? (
            <p className="text-sm text-muted-foreground">{t("credits.none")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="p-2">{t("credits.round")}</th>
                  <th className="p-2">{t("credits.phase")}</th>
                  <th className="p-2">{t("credits.approvedAt")}</th>
                  <th className="p-2">{t("credits.ideasVoters")}</th>
                  <th className="p-2">{t("credits.credit")}</th>
                </tr>
              </thead>
              <tbody>
                {rounds.map((r) => (
                  <tr key={r.roundId} className="border-t">
                    <td className="p-2 font-mono text-xs">
                      {String(r.roundId).slice(0, 8)}
                    </td>
                    <td className="p-2">{r.phase}</td>
                    <td className="p-2 text-xs">
                      {r.approvedAt
                        ? new Date(r.approvedAt).toLocaleString()
                        : "—"}
                    </td>
                    <td className="p-2 text-xs">
                      {r.selectedCount}/{r.ideaCount} · {r.voters}
                    </td>
                    <td className="p-2 text-xs">
                      {r.credit ? (
                        <span>
                          {(r.credit.ideaAuthors ?? [])
                            .map((a: { name: string }) => a.name)
                            .join(", ")}{" "}
                          <Badge variant="outline">
                            {t("credits.voters", {
                              count: r.credit.voterCount,
                            })}
                          </Badge>{" "}
                          {t("credits.approvedBy", {
                            name: r.credit.approvedBy?.name ?? "",
                          })}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("credits.liveGame")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {!live?.gameId ? (
            <p className="text-muted-foreground">{t("credits.noLiveGame")}</p>
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <span className="font-medium">{live.name ?? live.gameId}</span>{" "}
                <Badge>{live.status}</Badge>
                <span className="block font-mono text-xs text-muted-foreground">
                  {live.gameId} · {String(live.codeSha256 ?? "").slice(0, 16)}
                </span>
              </div>
              <CreditList
                label={t("credits.gameAuthors")}
                people={live.contributors?.gameAuthors}
              />
              <CreditList
                label={t("credits.ideaAuthors")}
                people={live.contributors?.ideaAuthors}
              />
              <CreditList
                label={t("credits.artAuthors")}
                people={live.contributors?.artAuthors}
              />
              {live.contributors?.artNote && (
                <p className="text-xs text-muted-foreground">
                  {live.contributors.artNote}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
