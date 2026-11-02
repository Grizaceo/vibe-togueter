import { $, ownerHeaders, reviewed, el, link, message } from "./shared.js";
import { refresh } from "../studio.js";

export function initContributionForm() {
  $("fingerprint-file").onchange = async () => {
    try {
      const file = $("fingerprint-file").files[0];
      if (!file) return;
      if (file.size > 25 * 1024 * 1024)
        throw new Error(
          "Fingerprint files up to 25 MiB here; larger resources can use a separately computed SHA-256.",
        );
      const digest = await crypto.subtle.digest(
        "SHA-256",
        await file.arrayBuffer(),
      );
      $("fingerprint").value = Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
    } catch (error) {
      message("asset-message", error);
    }
  };
  $("asset-form").onsubmit = async (event) => {
    event.preventDefault();
    try {
      const f = new FormData(event.target),
        license = f.get("license"),
        urls = {
          "CC0-1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
          "CC-BY-4.0": "https://creativecommons.org/licenses/by/4.0/",
          "CC-BY-SA-4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
        };
      const payload = {
        title: f.get("title"),
        description: f.get("description"),
        kind: f.get("kind"),
        creator: {
          name: f.get("creator"),
          website: f.get("website"),
          socials: f.get("socialURL")
            ? [
                {
                  label: f.get("socialLabel") || "Social profile",
                  url: f.get("socialURL"),
                },
              ]
            : [],
        },
        license: {
          id: license,
          url: urls[license],
          attribution:
            f.get("attribution") || f.get("creator") + " — " + f.get("title"),
        },
        sourceURL: f.get("sourceURL"),
        expectedContentSha256: f.get("fingerprint"),
      };
      const response = await fetch("/community/asset-proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      $("asset-message").textContent = "Submitted for review: " + data.id;
      event.target.reset();
    } catch (error) {
      message("asset-message", error);
    }
  };
}

export function initContributionReview() {
  $("load-drafts").onclick = async () => {
    try {
      const response = await fetch("/admin/assets", { headers: ownerHeaders });
      if (!response.ok) throw new Error("Cannot load contribution review.");
      const drafts = (await response.json()).filter(
        (a) => a.status === "pending-review",
      );
      $("drafts").replaceChildren();
      for (const asset of drafts) {
        const card = el("article", undefined, "card");
        card.append(
          el("h3", asset.title),
          el("p", asset.creator.name + " · " + asset.license.id),
          link("Resource", asset.sourceURL),
          document.createTextNode(" "),
          link("Creator website", asset.creator.website),
        );
        const check = el("input");
        check.type = "checkbox";
        const label = el("label");
        label.append(
          check,
          document.createTextNode(
            " I reviewed authorship, permissions and the resource fingerprint.",
          ),
        );
        card.append(
          label,
          el("p", "Expected SHA-256: " + asset.expectedContentSha256, "tiny"),
          el("p", "Attribution notice: " + asset.license.attribution, "tiny"),
          link("Read the license terms", asset.license.url),
          el(
            "p",
            "Submitted permissions: " +
              JSON.stringify(asset.license.permissions),
            "tiny muted",
          ),
          el(
            "p",
            "License obligations: " + asset.license.obligations.join(", "),
            "tiny muted",
          ),
          el(
            "p",
            "Fingerprint is contributor-supplied. Compare it with the actual resource before attesting.",
            "tiny muted",
          ),
        );
        const featured = el("input");
        featured.type = "checkbox";
        const featuredLabel = el("label");
        featuredLabel.append(
          featured,
          document.createTextNode(" Feature this free contributor"),
        );
        const reason = el("input");
        reason.placeholder = "Contribution-based featuring reason";
        card.append(featuredLabel, reason);
        const publish = el(
          "button",
          asset.tier === "paid"
            ? "Paid draft · checkout not enabled"
            : "Publish free contribution",
        );
        publish.disabled = asset.tier === "paid";
        publish.onclick = async () => {
          try {
            if (!check.checked)
              throw new Error("Review the contribution first.");
            const result = await fetch("/admin/assets/review", {
              method: "POST",
              headers: ownerHeaders,
              body: JSON.stringify({
                id: asset.id,
                approved: true,
                rightsAttested: true,
                featured: featured.checked,
                featureReason: reason.value,
              }),
            });
            if (!result.ok) throw new Error(await result.text());
            card.remove();
            await refresh(true);
          } catch (error) {
            message("owner-message", error);
          }
        };
        const reject = el("button", "Reject contribution", "secondary");
        reject.onclick = async () => {
          try {
            const response = await fetch("/admin/assets/review", {
              method: "POST",
              headers: ownerHeaders,
              body: JSON.stringify({ id: asset.id, approved: false }),
            });
            if (!response.ok) throw new Error(await response.text());
            card.remove();
          } catch (error) {
            message("owner-message", error);
          }
        };
        card.append(publish, reject);
        $("drafts").append(card);
      }
      if (!drafts.length)
        $("drafts").append(el("p", "No pending contributions.", "muted"));
    } catch (error) {
      message("owner-message", error);
    }
  };
}
