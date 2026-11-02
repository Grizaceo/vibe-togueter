import { socket, latest } from "./lobby.mjs";

export async function rehearseOverlay({
  sleep,
  post,
  command,
  navigate,
  wait,
  evaluate,
  check,
  capture,
  base,
}) {
  await post("/admin/chat", {
    user: "Local viewer",
    text: "!idea A cooperative lantern garden",
  });
  await post("/admin/round", { action: "vote" });
  await post("/admin/chat", { user: "Local voter", text: "!vote 1" });
  await command("Emulation.setDeviceMetricsOverride", {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await navigate("/overlay.html");
  await wait(() =>
    evaluate(
      "document.querySelector('.creator-strip')?.textContent.includes('Kenney')",
    ),
  );
  check(
    "overlay keeps all three credit roles in the viewport",
    await evaluate(
      "(()=>{const c=document.querySelector('.creator-strip'),r=c.getBoundingClientRect();return c.textContent.includes('Idea by:')&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()",
    ),
  );
  check(
    "1080p credit strip is at least 24px and no ledger is shown",
    await evaluate(
      "parseFloat(getComputedStyle(document.querySelector('.creator-strip')).fontSize)>=24&&!document.querySelector('#fund')",
    ),
  );
  await capture("local-ui-overlay-1080p");
  await command("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await sleep(300);
  check(
    "720p stream credits and activity fit",
    await evaluate(
      "(()=>{const c=document.querySelector('.creator-strip'),r=c.getBoundingClientRect(),a=document.querySelector('#activity');return parseFloat(getComputedStyle(c).fontSize)>=18&&r.right<=innerWidth&&r.bottom<=innerHeight&&a.textContent.includes('Studio builder: off')})()",
    ),
  );
  await wait(() =>
    evaluate(
      "document.querySelector('#activity').textContent.includes('1 idea · 1 voter')",
    ),
  );
  check(
    "overlay shows a real local proposal and ballot from WS state",
    await evaluate(
      "document.querySelector('#activity').textContent.includes('1 idea · 1 voter')&&document.querySelector('#activity').textContent.includes('cooperative lantern garden')",
    ),
  );
  await capture("local-ui-overlay");
  await post("/admin/prediction", { action: "open", choices: ["Sun", "Rain"] });
  socket.send(JSON.stringify({ t: "chat", text: "!predict Sun" }));
  await wait(() => latest.activity?.prediction?.participants === 1);
  await post("/admin/prediction", { action: "lock" });
  await post("/admin/prediction", { action: "resolve", choice: "Sun" });
  await wait(() =>
    evaluate(
      "document.querySelector('#activity').textContent.includes('1 correct: frame-observer (web)')",
    ),
  );
  check("overlay renders streamer-reported prediction winner", true);
  await capture("local-ui-overlay-prediction");
  await post("/admin/chat-effects", { paused: true });
  await wait(() =>
    evaluate(
      "document.querySelector('#activity').textContent.includes('Chat effects paused')",
    ),
  );
  check("overlay renders actual effects pause", true);
  await capture("local-ui-overlay-paused");
  await post("/admin/chat-effects", { paused: false });
  await post("/admin/fallback", {});
  await wait(() =>
    evaluate(
      "document.querySelector('#activity').textContent.includes('Requested by local streamer')",
    ),
  );
  check("overlay shows the actual local fallback reason", true);
  await post("/admin/round", { action: "close" });
  await post("/admin/round", { action: "select", ids: [1] });
  const approvedRound = (await (await fetch(base + "/community/state")).json())
    .round;
  await post("/admin/round", {
    action: "approve",
    roundId: approvedRound.id,
    reviewToken: approvedRound.reviewToken,
  });
  await wait(() =>
    evaluate(
      "document.querySelector('#activity').textContent.includes('Approved input credit')",
    ),
  );
  check(
    "overlay separates current approved input co-credit from live game attribution",
    await evaluate(
      "document.querySelector('#activity').textContent.includes('Voted by 1 · Approved by local streamer')",
    ),
  );
  await capture("local-ui-overlay-round-credit");
  for (const [width, height] of [
    [1280, 720],
    [1920, 1080],
  ]) {
    await command("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(200);
    check(
      `${height}p crowded sidebar has no scrollbars, overlap or clipped activity`,
      await evaluate(
        `(()=>{const side=document.querySelector('#side'),a=document.querySelector('#activity'),feed=document.querySelector('#feed'),players=document.querySelector('#players'),ar=a.getBoundingClientRect(),fr=feed.getBoundingClientRect(),pr=players.getBoundingClientRect();return a.scrollHeight<=a.clientHeight&&ar.bottom<=fr.top+1&&fr.bottom<=pr.top+1&&pr.bottom<=side.getBoundingClientRect().bottom&&[a,feed,players].every(e=>getComputedStyle(e).overflowY==='hidden')&&[...feed.children].filter(e=>!e.hidden).every(e=>{const r=e.getBoundingClientRect();return r.top>=fr.top&&r.bottom<=fr.bottom+0.1})})()`,
      ),
    );
    check(
      `${height}p Marble credit names its owner and inherited prototype`,
      await evaluate(
        "document.querySelector('.creator-strip').textContent.includes('Cristóbal Muñoz · pre-hackathon prototype')",
      ),
    );
    await capture("local-ui-overlay-crowded-" + height + "p");
  }
  await command("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  // Synthetic maximum-field fixture: exercise the real overlay layout without Twitch/provider calls.
  await evaluate(
    `(async () => {
      const original = document.getElementById('activity');
      original.id = 'ws-activity';
      const fixture = original.cloneNode(false);
      fixture.id = 'activity';
      original.replaceWith(fixture);
      const { attachActivity } = await import('/overlay-activity.js');
      window.maxActivityRenderer = attachActivity(fixture);
      window.maxActivityState = {
        round: {
          phase: 'approved', ideas: 100, voters: 10000,
          highlights: [{
            id: 100, votes: 10000, author: 'viewer'.repeat(6),
            text: 'A cooperative lantern garden with a long proposal that fills the stream summary for this layout fixture.'.slice(0, 100)
          }],
          credit: {
            ideaAuthors: Array.from({ length: 10 }, (_, i) => ({
              name: 'Selected author ' + i + ' with a fifty character name.....'
            })),
            voterCount: 10000,
            approvedBy: { name: 'trusted_moderator_fixture', authority: 'delegated-moderator' }
          }
        },
        fallback: 'Requested by moderator: ' + 'recovery reason '.repeat(13),
        builder: 'Studio builder: off — enabled per approved run',
        delegation: { name: 'trusted_moderator_fixture', expiresAt: Date.now() + 60000 },
        prediction: {
          phase: 'resolved',
          choices: Array.from({ length: 6 }, (_, i) => ({
            label: 'A thirty-two-character choice ' + i, count: 10000
          })),
          result: 'A thirty-two-character choice 0', winnerCount: 10000,
          winners: Array.from({ length: 6 }, (_, i) =>
            ('Winner ' + i + ' with a long public display name................').slice(0, 50))
        },
        chatEffectsPaused: true
      };
      window.maxActivityRenderer.update(window.maxActivityState);
      const error = document.getElementById('err');
      const previousError = error.textContent;
      const fixtureError = 'Fallback: ' + window.maxActivityState.fallback;
      const keepFixtureError = new MutationObserver(() => {
        if (error.textContent !== fixtureError) error.textContent = fixtureError;
      });
      error.textContent = fixtureError;
      keepFixtureError.observe(error, { childList: true });
      window.restoreActivity = () => {
        keepFixtureError.disconnect();
        error.textContent = previousError;
        fixture.replaceWith(original);
        original.id = 'activity';
      };
    })()`,
  );
  for (const authors of [10, 1]) {
    await evaluate(
      `window.maxActivityState.round.credit.ideaAuthors=window.maxActivityState.round.credit.ideaAuthors.slice(0,${authors});window.maxActivityRenderer.update(window.maxActivityState)`,
    );
    for (const [width, height] of [
      [1280, 720],
      [1920, 1080],
    ]) {
      await command("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await sleep(200);
      await capture(
        "local-ui-overlay-synthetic-max-" + authors + "authors-" + height + "p",
      );
      const bounds = await evaluate(
        "(()=>{const box=id=>{const r=document.getElementById(id).getBoundingClientRect();return {top:r.top,bottom:r.bottom};};const p=document.querySelector('#side > a').getBoundingClientRect();return {side:box('side'),activity:box('activity'),players:box('players'),privacy:{top:p.top,bottom:p.bottom}}})()",
      );
      check(
        `${height}p ${authors}-author maximum-field synthetic overlay with a long fallback banner keeps activity and sidebar in bounds: ${JSON.stringify(bounds)}`,
        bounds.activity.bottom <= bounds.side.bottom &&
          bounds.activity.top >= bounds.side.top &&
          bounds.players.bottom <= bounds.side.bottom &&
          bounds.privacy.bottom <= bounds.side.bottom &&
          bounds.privacy.top >= bounds.activity.bottom,
      );
    }
  }
  await evaluate(
    "window.restoreActivity();delete window.restoreActivity;delete window.maxActivityRenderer;delete window.maxActivityState",
  );
  await command("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await wait(() =>
    evaluate(
      "(()=>{const feed=document.getElementById('feed'),last=feed.lastElementChild;if(!last||last.hidden||getComputedStyle(feed).visibility==='hidden')return false;return last.getBoundingClientRect().bottom<=feed.getBoundingClientRect().bottom+0.1})()",
    ),
  );
  check(
    "feed shows its latest event again after the crowded layout expands",
    true,
  );
}
