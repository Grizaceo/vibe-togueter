import { $, ownerHeaders, message } from "./shared.js";
import { refresh } from "../studio.js";

export async function loadFallbackOrder() {
  const response = await fetch("/admin/fallback-order", {
    headers: ownerHeaders,
  });
  if (!response.ok) throw Error(await response.text());
  const policy = await response.json();
  $("fallback-order").value = policy.order
    .filter((id) => id !== "marble-race")
    .join(", ");
  $("save-fallback-order").disabled = !policy.enabled;
}
async function setDelegate(body) {
  if (!ownerHeaders) throw Error("Unlock local streamer controls.");
  const response = await fetch("/admin/approval-delegate", {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify(body),
  });
  if (!response.ok) throw Error(await response.text());
  await refresh();
}

export function initControls() {
  $("save-fallback-order").onclick = async () => {
    try {
      if (!ownerHeaders) throw Error("Unlock local streamer controls.");
      const order = $("fallback-order")
        .value.split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const response = await fetch("/admin/fallback-order", {
        method: "POST",
        headers: ownerHeaders,
        body: JSON.stringify({ order }),
      });
      if (!response.ok) throw Error(await response.text());
      await loadFallbackOrder();
      $("fallback-message").textContent =
        "Fallback order saved. Marble Race stays last.";
    } catch (error) {
      message("fallback-message", error);
    }
  };

  $("grant-delegate").onclick = () =>
    setDelegate({
      action: "grant",
      name: $("delegate-name").value,
      seconds: Number($("delegate-minutes").value) * 60,
    }).catch((error) => message("delegate-message", error));
  $("revoke-delegate").onclick = () =>
    setDelegate({ action: "revoke" }).catch((error) =>
      message("delegate-message", error),
    );
}
