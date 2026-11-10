import { fail } from "@agent-native/core/action";

// The only module that reads the controller deploy env. The console server
// runs on the same host as the Vibe Arena controller and shares its local
// admin surface (localhost-only, optional bearer, x-streamer-key) exactly like
// the Studio page does. The secrets never reach the browser, the agent, logs
// or action results: they only decorate outbound requests to the controller.
const config = {
  // guard:allow-env-credential — controller local-admin secret shared with the vibe-arena controller .env on this host
  url: process.env.VA_ARENA_URL?.trim() || "http://127.0.0.1:8420",
  // guard:allow-env-credential — controller local-admin secret shared with the vibe-arena controller .env on this host
  adminToken: process.env.VA_ADMIN_TOKEN?.trim() || "",
  // guard:allow-env-credential — controller local-admin secret shared with the vibe-arena controller .env on this host
  streamerKey: process.env.VA_STREAMER_KEY?.trim() || "",
};

export function arenaUrl() {
  return config.url;
}

export function streamerKeyConfigured() {
  return config.streamerKey.length > 0;
}

export function wsUrl() {
  return config.url.replace(/^http/, "ws");
}

export async function arena(
  path: string,
  {
    method = "GET",
    body,
    streamer = false,
  }: { method?: string; body?: unknown; streamer?: boolean } = {},
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.adminToken)
    headers.Authorization = `Bearer ${config.adminToken}`;
  if (streamer) headers["x-streamer-key"] = config.streamerKey;
  let response: Response;
  try {
    response = await fetch(config.url + path, {
      method,
      headers,
      body: body === undefined ? null : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    fail("Vibe Arena controller unreachable.", {
      errorCode: "controller_unavailable",
      statusCode: 503,
    });
  }
  const text = await response.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {}
  if (!response.ok) {
    const message =
      (typeof data === "object" && data !== null && "error" in data
        ? String((data as { error: unknown }).error)
        : text) || "Controller request failed.";
    fail(message.slice(0, 300), {
      errorCode: "controller_rejected",
      statusCode: response.status === 403 ? 403 : 409,
    });
  }
  return data;
}
