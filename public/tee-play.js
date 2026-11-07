const status=document.querySelector('#status');
try{
  // Chat links carry no name; ask the viewer instead of reusing whoever requested the link.
  const params=new URLSearchParams(location.search),id=params.get('game'),linkName=params.get('name')?.trim()||'';
  const nameInput=document.querySelector('#name');
  const response=await fetch('/community/games',{cache:'no-store'});
  if(!response.ok)throw Error('Game catalog unavailable.');
  const catalog=await response.json(),game=catalog.games.find(g=>g.id===id&&g.adapter==='tee');
  if(!game)throw Error('This game is not configured.');
  const url=new URL(game.baseURL);
  const local=game.localPrototype===true&&['127.0.0.1','localhost','[::1]'].includes(location.hostname)&&url.protocol==='http:'&&url.hostname==='127.0.0.1';
  if((url.protocol!=='https:'&&!local)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Invalid game endpoint.');
  if(game.playPath!==undefined&&game.playPath!=='/game')throw Error('Unknown game entry path.');
  if(game.playPath)url.pathname=game.playPath;
  // The sandbox tokens only make sense on a foreign origin; never frame ourselves.
  if(url.origin===location.origin)throw Error('This game shares the page origin and cannot be sandboxed.');
  document.querySelector('#boundary').textContent=local
    ?'Verified local integration prototype. VM deployment and external access testing pending.'
    :'External game. Your name is a display name and grants no authenticated role.';
  status.textContent='Ready. Controls and ONLINE connection status appear inside the game.';
  if(!linkName){
    try{nameInput.value=(localStorage.getItem('va-name')||'').slice(0,25);}catch{}
    document.querySelector('#name-row').hidden=false;
  }
  const accept=document.querySelector('#modeb-accept'),acceptKey='va-modeb-accept:'+game.id+':'+url.origin;
  try{if(localStorage.getItem(acceptKey)==='1')accept.checked=true;}catch{}
  document.querySelector('#modeb-row').hidden=false;
  const play=document.querySelector('#play');play.hidden=false;
  accept.onchange=()=>{
    play.disabled=!accept.checked;
    if(accept.checked)try{localStorage.setItem(acceptKey,'1');}catch{}
  };
  play.disabled=!accept.checked;
  play.onclick=()=>{
    const name=(linkName||nameInput.value.trim()).slice(0,25);
    if(!name){status.textContent='Type your name first.';nameInput.focus();return;}
    if(!linkName)try{localStorage.setItem('va-name',name);}catch{}
    url.hash=encodeURIComponent(name);
    document.querySelector('#name-row').hidden=true;
    document.querySelector('#modeb-row').hidden=true;
    play.disabled=true;play.textContent='Game opened below';
    const frame=document.createElement('iframe');frame.title='Your individual teeworlds-rs player';
    frame.setAttribute('sandbox','allow-scripts allow-same-origin');
    frame.setAttribute('allow','');
    frame.setAttribute('referrerpolicy','no-referrer');
    frame.src=url.toString();
    document.body.append(frame);status.textContent='Click inside the game, then use keyboard and mouse. Check ONLINE in its HUD.';
  };
}catch(error){status.textContent=error.message;}
