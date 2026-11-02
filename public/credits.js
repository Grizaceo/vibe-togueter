// Creator panel rendered from the reviewed manifest, outside generated game code.
export function renderCreatorCredits(container, manifest) {
  container.replaceChildren();
  for (const asset of manifest?.assets || []) {
    const card = document.createElement("article");
    card.className = "credit";
    const name = document.createElement("strong");
    name.textContent = asset.creator.name;
    const title = document.createElement("p");
    title.textContent = asset.title + " · " + asset.license.id;
    const notice = document.createElement("p");
    notice.textContent = asset.license.attribution;
    const license = document.createElement("a");
    license.textContent = "License: " + asset.license.id;
    license.href = asset.license.url;
    license.target = "_blank";
    license.rel = "noopener noreferrer";
    card.append(name, title, notice, license, document.createTextNode(" "));
    for (const profile of [
      { label: "Creator website", url: asset.creator.website },
      ...asset.creator.socials,
    ]) {
      const url = new URL(profile.url);
      if (url.protocol !== "https:") continue;
      const link = document.createElement("a");
      link.textContent = profile.label;
      link.href = url.toString();
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      card.append(link, document.createTextNode(" "));
    }
    container.append(card);
  }
}
