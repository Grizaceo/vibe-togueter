import { connect } from "./client.js";
import { attachLiveCredits } from "./live-credits.js";
import { attachActivity } from "./overlay-activity.js";
const activity = attachActivity(document.getElementById("activity"));
const credits = attachLiveCredits(document.getElementById("live-credits"));
const feed = document.getElementById("feed");
new ResizeObserver(fitFeed).observe(feed);
function fitFeed() {
  const rows = Math.floor(
    feed.getBoundingClientRect().height /
      parseFloat(getComputedStyle(feed).lineHeight),
  );
  feed.style.visibility = rows ? "" : "hidden";
  [...feed.children].forEach((line, index) => {
    line.hidden = index < feed.children.length - rows;
  });
}
connect({
  spectator: true,
  canvas: document.getElementById("cv"),
  onCredits: (publication) => credits.update(publication),
  onActivity: (state) => activity.update(state),
  onWelcome: (m) => {
    (m.recent || []).forEach(addFeed);
  },
  onFeed: addFeed,
  onPlayers: (p, game, err) => {
    credits.matchGame(game);
    if (game) document.getElementById("game").textContent = game.name;
    document.getElementById("err").textContent = err || "";
    document.getElementById("players").replaceChildren(
      ...p.map((x) => {
        const line = document.createElement("div");
        line.textContent = "▸ " + x.name;
        return line;
      }),
    );
  },
});
function addFeed(ev) {
  const d = document.createElement("div");
  d.className = ev.kind;
  d.textContent = ev.text;
  feed.appendChild(d);
  while (feed.children.length > 80) feed.firstChild.remove();
  fitFeed();
}
