export async function rehearseStudio({
  navigate,
  check,
  evaluate,
  capture,
  click,
  wait,
  base,
  env,
}) {
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
}
