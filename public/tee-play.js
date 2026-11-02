const status=document.querySelector('#status');
try{
  const params=new URLSearchParams(location.search),id=params.get('game'),name=params.get('name')||'viewer';
  const response=await fetch('/community/games',{cache:'no-store'});
  if(!response.ok)throw Error('Game catalog unavailable.');
  const catalog=await response.json(),game=catalog.games.find(g=>g.id===id&&g.adapter==='tee');
  if(!game)throw Error('This game is not configured.');
  const url=new URL(game.baseURL);
  const local=game.localPrototype===true&&['127.0.0.1','localhost','[::1]'].includes(location.hostname)&&url.protocol==='http:'&&url.hostname==='127.0.0.1';
  if((url.protocol!=='https:'&&!local)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Invalid game endpoint.');
  url.hash=encodeURIComponent(name.slice(0,25));
  document.querySelector('#boundary').textContent=local
    ?'Verified local integration prototype. VM deployment and external access testing pending.'
    :'External game. Your name is a display name and grants no authenticated role.';
  status.textContent='Ready. Controls and ONLINE connection status appear inside the game.';
  const play=document.querySelector('#play');play.hidden=false;
  play.onclick=()=>{
    play.disabled=true;play.textContent='Game opened below';
    const frame=document.createElement('iframe');frame.title='Your individual teeworlds-rs player';frame.src=url.toString();
    document.body.append(frame);status.textContent='Click inside the game, then use keyboard and mouse. Check ONLINE in its HUD.';
  };
}catch(error){status.textContent=error.message;}
