// Disposable local browser rehearsal. No owner .env, credentials, Twitch or cloud calls.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import WebSocket from "ws";
const root = path.resolve(new URL("..", import.meta.url).pathname),
  temp = fs.mkdtempSync(path.join(os.tmpdir(), "va-ui-"));
const runId = "local-ui-" + Date.now();
const evidence = path.join(root, "docs", "evidence"),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const free = () =>
  new Promise((r) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => r(p));
    });
  });
for (const name of [
  "src",
  "public",
  "games",
  "templates",
  "package.json",
  "vibe-arena.config.json",
])
  fs.cpSync(path.join(root, name), path.join(temp, name), {
    recursive: true,
    filter: (p) => !p.includes("/auto-"),
  });
fs.symlinkSync(
  path.join(root, "node_modules"),
  path.join(temp, "node_modules"),
  "dir",
);
const port = await free(),
  debugPort = await free(),
  base = "http://127.0.0.1:" + port;
const env = {
  PATH: process.env.PATH,
  HOME: temp,
  LANG: "C.UTF-8",
  VA_STREAMER_KEY: "local-ui-fixture-key",
};
const server = spawn(
  process.execPath,
  [
    "--experimental-vm-modules",
    "src/server.js",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--game-dir",
    "games/community-grove",
  ],
  { cwd: temp, env, stdio: "ignore" },
);
let browser,
  cdp,
  socket,
  id = 0;
const pending = new Map(),
  checks = [],
  errors = [],
  requests = [];
const check = (name, ok) => {
  checks.push({ name, ok });
  if (!ok) throw Error(name);
};
const wait = async (fn) => {
  for (let n = 0; n < 100; n++) {
    try {
      const result = await fn();
      if (result) return result;
    } catch {}
    await sleep(100);
  }
  throw Error("Readiness deadline");
};
try {
  await wait(async () => (await fetch(base + "/community/state")).ok);
  const post = async (route, body) => {
    const response = await fetch(base + route, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-streamer-key": env.VA_STREAMER_KEY,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw Error(await response.text());
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  };
  const assetIds = [];
  for (const key of [
    "kenney-background-sky",
    "kenney-background-hills1",
    "kenney-background-tree01",
  ]) {
    const asset = await post("/admin/assets/import", { key });
    if (asset.status === "pending-review")
      await post("/admin/assets/review", {
        id: asset.id,
        approved: true,
        rightsAttested: true,
      });
    assetIds.push(asset.id);
  }
  const reviewed = await post("/admin/game-publication", {
    action: "review",
    gameId: "community-grove",
  });
  await post("/admin/game-publication", {
    action: "publish",
    gameId: "community-grove",
    expectedCodeSha256: reviewed.codeSha256,
    assetIds,
  });
  browser = spawn(
    "chromium",
    [
      "--headless",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=" + debugPort,
      "--user-data-dir=" + path.join(temp, "browser-profile"),
      "about:blank",
    ],
    { env, stdio: "ignore" },
  );
  const target = await wait(async () => {
    const r = await fetch(
      "http://127.0.0.1:" + debugPort + "/json/new?about:blank",
      { method: "PUT" },
    );
    return r.ok ? r.json() : null;
  });
  cdp = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => cdp.once("open", r));
  const command = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const request = ++id;
      pending.set(request, { resolve, reject });
      cdp.send(JSON.stringify({ id: request, method, params }));
    });
  cdp.on("message", (raw) => {
    const msg = JSON.parse(raw);
    if (msg.id) {
      const call = pending.get(msg.id);
      if (call) {
        pending.delete(msg.id);
        msg.error
          ? call.reject(Error(msg.error.message))
          : call.resolve(msg.result);
      }
    } else if (msg.method === "Runtime.exceptionThrown")
      errors.push(msg.params.exceptionDetails.text);
    else if (msg.method === "Network.requestWillBeSent")
      requests.push(msg.params.request.url);
  });
  await command("Page.enable");
  await command("Runtime.enable");
  await command("Network.enable");
  await command("Emulation.setDeviceMetricsOverride", {
    width: 1600,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const evaluate = async (expression) =>
    (
      await command("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      })
    ).result.value;
  const click = async (selector) => {
    const point = await evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`,
    );
    if (!point) throw Error("Missing enabled control: " + selector);
    await command("Input.dispatchMouseEvent", {
      type: "mousePressed",
      ...point,
      button: "left",
      clickCount: 1,
    });
    await command("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      ...point,
      button: "left",
      clickCount: 1,
    });
  };
  const navigate = async (route) => {
    await command("Page.navigate", { url: base + route });
    await wait(() => evaluate("document.readyState==='complete'"));
    await sleep(500);
  };
  const capture = async (name) => {
    const shot = await command("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(
      path.join(evidence, name.replace("local-ui", runId) + ".png"),
      Buffer.from(shot.data, "base64"),
    );
  };
  await navigate("/?name=BrowserRehearsal");
  await wait(() =>
    evaluate(
      "document.querySelector('.creator-strip')?.textContent.includes('Kenney')",
    ),
  );
  check(
    "lobby shows game, art and idea credit while details are collapsed",
    await evaluate(
      "(()=>{const c=document.querySelector('.creator-strip');return c.textContent.includes('Game by:')&&c.textContent.includes('Art by:')&&c.textContent.includes('Idea by:')&&!document.querySelector('#live-credits details').open})()",
    ),
  );
  check(
    "creator strip is inside the desktop viewport",
    await evaluate(
      "(()=>{const r=document.querySelector('.creator-strip').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()",
    ),
  );
  socket = new WebSocket(
    base.replace(/^http/, "ws") + "/spectate?name=frame-observer",
  );
  let latest;
  socket.on("message", (raw) => {
    const msg = JSON.parse(raw);
    if (msg.t === "state") latest = msg;
  });
  await new Promise((r) => socket.once("open", r));
  await wait(() => latest);
  const before = latest.view.layers
    .filter((p) => p.t === "sprite" && p.src.endsWith("tree01.png"))
    .reduce((sum, p) => sum + p.h, 0);
  await command("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: " ",
    code: "Space",
    windowsVirtualKeyCode: 32,
  });
  await command("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: " ",
    code: "Space",
    windowsVirtualKeyCode: 32,
  });
  await wait(
    () =>
      latest.view.layers
        .filter((p) => p.t === "sprite" && p.src.endsWith("tree01.png"))
        .reduce((sum, p) => sum + p.h, 0) > before,
  );
  check("production browser keyboard handler plants a visible tree", true);
  await capture("local-ui-lobby");
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
  await navigate("/studio.html");
  check(
    "studio renders its selected Plan B boundary and privacy link",
    await evaluate(
      "document.querySelector('#execution').textContent.includes('enabled per approved run')&&!!document.querySelector('a[href=\"/privacy.html\"]')",
    ),
  );
  check(
    "studio shows supporting ballots, approver and singular round/resource counts",
    await evaluate(
      "document.querySelector('#community-credit').textContent.includes('Voted by 1 · Approved by local streamer')&&document.querySelector('#round-info').textContent.includes('1 voting session · 1 selection slot')&&document.querySelector('#assets').textContent.includes('Used in 1 published version')&&!document.querySelector('#assets').textContent.includes('Used in 1 published versions')",
    ),
  );
  await capture("local-ui-studio");
  await evaluate(
    "document.getElementById('assets').scrollIntoView({block:'center'})",
  );
  await capture("local-ui-studio-resources");
  await evaluate(
    "document.getElementById('round-info').scrollIntoView({block:'center'})",
  );
  await capture("local-ui-studio-round");
  await evaluate(
    "document.getElementById('games').scrollIntoView({block:'center'})",
  );
  await capture("local-ui-studio-games");
  await evaluate("window.scrollTo(0,0)");
  await evaluate(
    "document.getElementById('admin-key').value='local-fixture-admin';document.getElementById('streamer-key').value='local-ui-fixture-key'",
  );
  await click("#owner-unlock button");
  await wait(() => evaluate("!document.getElementById('owner-tools').hidden"));
  check(
    "owner unlock clears fixture keys and keeps VM controls disabled",
    await evaluate(
      "document.getElementById('admin-key').value===''&&document.getElementById('streamer-key').value===''&&document.getElementById('dispatch-worker').disabled&&document.getElementById('check-worker').disabled&&document.getElementById('worker-status').textContent.includes('off in this public demo')",
    ),
  );
  await evaluate(
    "document.getElementById('fallback-order').value='chat-vs-streamer, community-grove'",
  );
  await click("#save-fallback-order");
  await wait(() =>
    evaluate(
      "document.getElementById('fallback-message').textContent.includes('Fallback order saved')",
    ),
  );
  const savedFallback = (
    await (
      await fetch(base + "/admin/fallback-order", {
        headers: { "x-streamer-key": env.VA_STREAMER_KEY },
      })
    ).json()
  ).order;
  check(
    "Studio production control saves preferred fallback order " +
      JSON.stringify(savedFallback),
    JSON.stringify(savedFallback) ===
      JSON.stringify(["chat-vs-streamer", "community-grove", "marble-race"]),
  );
  await evaluate(
    "document.getElementById('delegate-name').value='fixture_mod';document.getElementById('delegate-minutes').value='1'",
  );
  await click("#grant-delegate");
  await wait(() =>
    evaluate(
      "document.getElementById('delegate-message').textContent.includes('@fixture_mod')",
    ),
  );
  await click("#revoke-delegate");
  await wait(() =>
    evaluate(
      "document.getElementById('delegate-message').textContent.includes('No active approval delegate')",
    ),
  );
  check(
    "Studio production controls grant and revoke a limited input delegate",
    true,
  );
  check(
    "disabled build control uses neutral gray",
    await evaluate(
      "getComputedStyle(document.getElementById('dispatch-worker')).backgroundColor==='rgb(52, 59, 72)'",
    ),
  );
  await evaluate(
    "document.getElementById('worker-status').previousElementSibling.scrollIntoView({block:'start'})",
  );
  await capture("local-ui-studio-owner");
  // Mocked warm-session HTTP only; production controls must not create a real VM in browser QA.
  check(
    "default-off warm controls cannot prepare extend or close a VM",
    await evaluate(
      "['prepare-warm','extend-warm','close-warm'].every(id=>document.getElementById(id).disabled)",
    ),
  );
  await evaluate(
    `(async()=>{const original=window.fetch;window.realWarmFetch=original;const real=await(await original('/community/state')).json();window.warmFixture={enabled:true,phase:'none',canPrepare:true};window.fetch=async(url,options)=>{if(url==='/community/state')return new Response(JSON.stringify({...real,build:{...real.build,enabled:true,warm:window.warmFixture}}));if(url==='/admin/builder-session'){const action=JSON.parse(options.body).action;if(action==='prepare')window.warmFixture={enabled:true,phase:'prepared',canPrepare:false,canExtend:true,canClose:true,expiresAt:Date.now()+1800000,maxExpiresAt:Date.now()+3600000};if(action==='extend')window.warmFixture.expiresAt+=900000;if(action==='close')window.warmFixture={enabled:true,phase:'none',canPrepare:false};return new Response(JSON.stringify({...window.warmFixture,instructionsFile:'/local/mock-login-instructions.txt'}));}return original(url,options);};})()`,
  );
  await wait(() =>
    evaluate("!document.getElementById('prepare-warm').disabled"),
  );
  await click("#prepare-warm");
  await wait(() =>
    evaluate(
      "document.getElementById('warm-status').textContent.includes('VM prepared')",
    ),
  );
  check(
    "mocked prepare control exposes countdown without approving or starting a model",
    await evaluate(
      "document.getElementById('warm-message').textContent.includes('private local instructions')&&document.getElementById('extend-warm').disabled===false",
    ),
  );
  await click("#extend-warm");
  await wait(() =>
    evaluate(
      "document.getElementById('warm-message').textContent.includes('deadline extended')",
    ),
  );
  check(
    "mocked keep-ready control adds fifteen minutes within the displayed maximum",
    await evaluate(
      "/(?:44|45):/.test(document.getElementById('warm-status').textContent)&&document.getElementById('warm-status').textContent.includes('approved maximum')",
    ),
  );
  await capture("local-ui-studio-warm-mocked");
  await click("#close-warm");
  await wait(() =>
    evaluate(
      "document.getElementById('warm-message').textContent.includes('closure confirmed')",
    ),
  );
  check(
    "mocked close control does not offer an automatic replacement",
    await evaluate(
      "document.getElementById('prepare-warm').disabled&&document.getElementById('extend-warm').disabled&&document.getElementById('close-warm').disabled",
    ),
  );
  await evaluate("window.fetch=window.realWarmFetch");
  // Mocked HTTP recovery fixture only: exercise production UI after approval persisted but evidence write failed.
  await evaluate(
    `(async()=>{const original=window.fetch;window.fixtureAuthors=[{name:'Custom approved creator',url:'https://example.com/creator'},{name:'Second creator'}];const real=await(await original('/community/state')).json();const job={id:'fixture-recovery',phase:'tested',cleanupConfirmed:true,artifactHash:'fixture-artifact',reportHash:'fixture-report',cleanup:{confirmed:true}};window.fetch=async(url,options)=>{if(url==='/community/state')return new Response(JSON.stringify({...real,build:{enabled:true,workerConnected:false,job}}));if(url==='/admin/studio-builds'){const body=JSON.parse(options.body);if(body.action==='inspect')return new Response(JSON.stringify({job,ticket:{state:'approved',source:'// inert fixture',artifactHash:job.artifactHash,reportHash:job.reportHash,approval:{contributors:{gameAuthors:window.fixtureAuthors}}}}));if(body.action==='publish-review'){window.fixturePublished=body;return new Response('{}');}}return original(url,options);};})()`,
  );
  await wait(() =>
    evaluate("!document.getElementById('inspect-worker').disabled"),
  );
  await click("#inspect-worker");
  await wait(() =>
    evaluate("!document.getElementById('artifact-review').hidden"),
  );
  check(
    "mocked interrupted publication reinspection shows persisted creator approval",
    await evaluate(
      "document.getElementById('artifact-creator').value.includes('Custom approved creator')&&document.getElementById('artifact-report').textContent.includes('artifactApproval')",
    ),
  );
  await click("#artifact-rights");
  await click("#publish-review");
  await wait(() => evaluate("!!window.fixturePublished"));
  check(
    "mocked UI publication retry preserves all approved creator metadata",
    await evaluate(
      "JSON.stringify(window.fixturePublished.gameAuthors)===JSON.stringify(window.fixtureAuthors)",
    ),
  );
  await click("#lock-owner");
  check(
    "owner lock hides private tools and clears candidate review state",
    await evaluate(
      "document.getElementById('owner-tools').hidden&&document.getElementById('artifact-source').value===''",
    ),
  );
  await navigate("/privacy.html");
  check(
    "privacy page shows supplied operator/contact and pending hosting",
    await evaluate(
      "document.body.textContent.includes('Cristóbal Muñoz')&&!!document.querySelector('a[href=\"mailto:cristobal.munoz@derecho.uchile.cl\"]')&&document.body.textContent.includes('[OWNER MUST COMPLETE BEFORE PUBLIC USE]')",
    ),
  );
  await capture("local-ui-privacy");
  check("no browser JavaScript exception occurred", errors.length === 0);
  check(
    "credit clients make no HTTP polling requests",
    !requests.some((url) => url.includes("/community/game-credits")),
  );
  fs.writeFileSync(
    path.join(evidence, runId + "-rehearsal.json"),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        kind: "automated-local-Chromium-rehearsal",
        checks,
        errors,
        temp,
        limits: [
          "Disposable checkout without owner configuration.",
          "No real Twitch traffic, human gameplay, OBS recording or submission video.",
          "Warm-session controls and interrupted artifact publication UI use mocked HTTP; no real VM or candidate runs.",
          "Maximum-field sidebar shots use synthetic activity and long fallback-banner text in the real overlay DOM, not actual audience or backend-failure evidence.",
          "Lobby 1600x900, overlay 1920x1080 and 1280x720; not a mobile usability claim.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ checks, errors, temp }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
  fs.writeFileSync(
    path.join(evidence, "local-ui-failure-" + Date.now() + ".json"),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        error: error.message,
        checks,
        errors,
        temp,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  socket?.close();
  cdp?.close();
  browser?.kill("SIGTERM");
  server.kill("SIGTERM");
  await sleep(300);
  fs.rmSync(temp, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
