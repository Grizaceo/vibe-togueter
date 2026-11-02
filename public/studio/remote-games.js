import {
  $,
  state,
  ownerHeaders,
  remoteCreates,
  el,
  link,
  message,
} from "./shared.js";
import { refresh } from "../studio.js";

async function remoteAction(body) {
  if (!ownerHeaders) throw Error("Unlock local streamer controls.");
  const response = await fetch("/admin/remote-games", {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify(body),
  });
  if (!response.ok) throw Error(await response.text());
  $("remote-message").textContent =
    "Remote action confirmed. Share the lobby link before starting.";
  await refresh(true);
}
export function renderRemoteGames(data) {
  $("remote-games").replaceChildren();
  $("remote-sessions").replaceChildren();
  for (const game of data.games) {
    const card = el("article", undefined, "card");
    card.append(
      el("h3", game.title),
      el(
        "p",
        game.health
          ? "Last check: " +
              (game.health.ok ? "online" : "unavailable") +
              " · " +
              new Date(game.health.checkedAt).toLocaleTimeString()
          : "Not checked by this controller",
        "tiny muted",
      ),
      link("Open browser game", game.baseURL),
      el("p", game.rightsStatus, "tiny muted"),
      el(
        "p",
        game.adapter === "tee" && data.teeBridge?.gameId === game.id
          ? "Crowd bridge: " +
              data.teeBridge.reason +
              " · " +
              data.teeBridge.commands +
              " commands · !tee left/right/jump/hook/fire/stop"
          : "Passive chat controls: not connected",
        "tiny muted",
      ),
    );
    if (ownerHeaders) {
      const controls = el("div", undefined, "actions");
      const inspect = el("button", "Check runtime", "secondary");
      inspect.onclick = () =>
        remoteAction({ action: "inspect", gameId: game.id }).catch((error) =>
          message("remote-message", error),
        );
      controls.append(inspect);
      if (game.adapter === "tee") {
        const toggle = el(
          "button",
          data.teeBridge?.enabled
            ? "Disable crowd control"
            : "Enable Twitch crowd control",
        );
        toggle.onclick = async () => {
          try {
            const response = await fetch("/admin/tee-bridge", {
              method: "POST",
              headers: ownerHeaders,
              body: JSON.stringify({
                action: data.teeBridge?.enabled ? "disable" : "enable",
                gameId: game.id,
              }),
            });
            if (!response.ok) throw Error(await response.text());
            await refresh(true);
          } catch (error) {
            message("remote-message", error);
          }
        };
        controls.append(toggle);
      }
      if (game.adapter === "t99") {
        const pending = remoteCreates.get(game.id);
        const create = el(
          "button",
          pending ? "Retry pending lobby request" : "Create community lobby",
        );
        create.disabled = !!pending?.busy;
        create.onclick = async () => {
          const request = remoteCreates.get(game.id) || {
            id: crypto.randomUUID(),
            busy: false,
          };
          request.busy = true;
          remoteCreates.set(game.id, request);
          create.disabled = true;
          try {
            await remoteAction({
              action: "create",
              gameId: game.id,
              requestId: request.id,
            });
            remoteCreates.delete(game.id);
          } catch (error) {
            message("remote-message", error);
          } finally {
            request.busy = false;
            await refresh(true);
          }
        };
        controls.append(create);
      }
      card.append(controls);
    }
    $("remote-games").append(card);
  }
  for (const session of data.sessions.slice().reverse()) {
    const card = el("article", undefined, "card");
    card.append(
      el("h3", session.code + " · " + session.state),
      link("Join this public lobby", session.joinURL),
      el(
        "p",
        "No automatic start. Join first; the streamer starts when the community is ready.",
        "tiny muted",
      ),
    );
    if (ownerHeaders) {
      const reconcile = el("button", "Refresh lobby state", "secondary");
      reconcile.onclick = () =>
        remoteAction({ action: "reconcile", sessionId: session.id }).catch(
          (error) => message("remote-message", error),
        );
      card.append(reconcile);
    }
    if (ownerHeaders && session.state === "lobby") {
      const start = el("button", "Start this lobby");
      start.onclick = () =>
        remoteAction({ action: "start", sessionId: session.id }).catch(
          (error) => message("remote-message", error),
        );
      card.append(start);
    }
    $("remote-sessions").append(card);
  }
}
