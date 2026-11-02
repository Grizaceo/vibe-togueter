import {
  $,
  state,
  ownerHeaders,
  reviewed,
  picked,
  message,
  setOwnerHeaders,
  setReviewed,
  setReviewedArtifact,
} from "./shared.js";
import { refresh } from "../studio.js";
import { renderRound } from "./rounds.js";
import { loadFallbackOrder } from "./controls.js";

async function ownerAction(body) {
  if (!ownerHeaders) throw new Error("Unlock local streamer controls.");
  const response = await fetch("/admin/round", {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify(body),
  });
  const data = await response.text();
  if (!response.ok) throw new Error(data);
  setReviewed(null);
  $("reviewed").textContent = "";
  $("owner-message").textContent =
    "Decision saved. Build dispatch remains a separate explicit owner action.";
  await refresh(true);
}

export function initOwnerTools() {
  if (["localhost", "127.0.0.1", "[::1]"].includes(location.hostname))
    $("owner-area").hidden = false;
  $("owner-unlock").onsubmit = async (event) => {
    event.preventDefault();
    const headers = {
      "Content-Type": "application/json",
      Authorization: "Bearer " + $("admin-key").value,
      "x-streamer-key": $("streamer-key").value,
    };
    try {
      const response = await fetch("/admin/owner-status", { headers });
      if (!response.ok) throw new Error("Local admin key rejected.");
      setOwnerHeaders(headers);
      $("admin-key").value = "";
      $("streamer-key").value = "";
      await loadFallbackOrder();
      $("owner-tools").hidden = false;
      $("owner-unlock").hidden = true;
      await refresh(true);
    } catch (error) {
      message("unlock-message", error);
    }
  };
  for (const button of document.querySelectorAll("[data-round]"))
    button.onclick = () => {
      const body = { action: button.dataset.round };
      if (body.action === "open")
        body.settings = Object.fromEntries(
          ["maxWords", "maxIdeas", "winnerCount", "voteSeconds"].map((key) => [
            key,
            Number($(key).value),
          ]),
        );
      ownerAction(body).catch((error) => message("owner-message", error));
    };
  $("select-ideas").onclick = () =>
    ownerAction({
      action: "select",
      ids: $("selected-ideas")
        .value.split(",")
        .map((x) => Number(x.trim())),
    }).catch((error) => message("owner-message", error));
  $("select-resources").onclick = () =>
    ownerAction({ action: "resources", assetIds: [...picked] }).catch((error) =>
      message("owner-message", error),
    );
  $("review-selection").onclick = () => {
    if (!state.round?.reviewToken) {
      message("owner-message", "Close the vote and select an idea first.");
      return;
    }
    setReviewed({
      roundId: state.round.id,
      reviewToken: state.round.reviewToken,
    });
    $("reviewed").textContent =
      "Review locked to ideas " +
      state.round.selected.join(", ") +
      " · " +
      reviewed.reviewToken;
    renderRound();
  };
  $("approve-selection").onclick = () =>
    ownerAction({ action: "approve", ...reviewed }).catch((error) =>
      message("owner-message", error),
    );
}

export function initOwnerLock() {
  $("lock-owner").onclick = () => {
    setOwnerHeaders(null);
    setReviewed(null);
    setReviewedArtifact(null);
    $("artifact-review").hidden = true;
    $("artifact-source").value = "";
    $("artifact-creator").value = "";
    $("artifact-report").textContent = "";
    $("artifact-rights").checked = false;
    $("owner-tools").hidden = true;
    $("owner-unlock").hidden = false;
    renderRound();
  };
}
