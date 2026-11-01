// Shared WS snapshots keep the stream summary current without another polling loop.
export function attachActivity(container){
 let pin;
 return {update(state){
  const next=JSON.stringify(state);if(pin===next)return;pin=next;
  container.replaceChildren();
  const line=(tag,text)=>{const node=document.createElement(tag);node.textContent=text;container.append(node);};
  const r=state?.round;
  line('strong',r?'Community round · '+r.phase.replaceAll('-',' '):'Community studio');
  line('p',r?`${r.ideas} ideas · ${r.voters} voters`:'Chat: !idea your game idea');
  for(const idea of r?.highlights||[])line('p',`#${idea.id} · ${idea.votes} votes · ${idea.author}: ${idea.text}`);
  if(!r)line('p','Propose → vote → streamer review');
  line('p',state?.builder||'Waiting for controller');
  if(state?.crowd?.enabled&&!state?.chatEffectsPaused)line('p',`Grove burst · 3 viewers in 5s: ☀️ ${state.crowd.sun}/${state.crowd.needed} · 🌧️ ${state.crowd.rain}/${state.crowd.needed}`);
  if(state?.chatEffectsPaused)line('strong','Chat effects paused · proposals and votes stay open');
  if(state?.fallback)line('strong','Safety fallback: '+state.fallback);
 }};
}
