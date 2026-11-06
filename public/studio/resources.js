import { $, picked, el, link } from "./shared.js";

export function renderAssets(data) {
  $("assets").replaceChildren();
  for (const asset of data.assets) {
    const card = el("article", undefined, "card");
    if (asset.featured)
      card.append(
        el(
          "div",
          asset.origin === "curated-public-source"
            ? "✦ Curated free resource"
            : "✦ Featured contributor",
          "artist-label",
        ),
      );
    if (asset.origin === "curated-public-source")
      card.append(
        el(
          "p",
          "Curated from a public pack; creator has not joined or endorsed the platform.",
          "tiny muted",
        ),
      );
    if (asset.sourceURL.startsWith("/curated/")) {
      const image = el("img");
      image.src = asset.sourceURL;
      image.alt = asset.title;
      image.className = "asset-thumb";
      card.append(image);
    }
    card.append(
      el("span", asset.kind + " · free", "pill free"),
      el("h3", asset.title),
      el("p", asset.description, "tiny muted"),
      link(asset.creator.name, asset.creator.website),
      el(
        "p",
        `${asset.license.id} · Used in ${asset.uses} published version${asset.uses === 1 ? "" : "s"}`,
        "tiny muted",
      ),
    );
    for (const social of asset.creator.socials)
      card.append(document.createTextNode(" "), link(social.label, social.url));
    const check = el("input");
    check.type = "checkbox";
    check.checked = picked.has(asset.id);
    check.onchange = () =>
      check.checked ? picked.add(asset.id) : picked.delete(asset.id);
    const label = el("label");
    label.append(check, document.createTextNode(" Include in resource pack"));
    card.append(label, el("p", "Resource ID: " + asset.id, "tiny muted"));
    $("assets").append(card);
  }
  if (!data.assets.length)
    $("assets").append(
      el(
        "div",
        "Reviewed contributions appear here with each creator's portfolio, social links and license.",
        "empty",
      ),
    );
}
