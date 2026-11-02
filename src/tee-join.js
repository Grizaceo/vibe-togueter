// Individual play is a browser session, not a collective bridge command.
export function teeEntryURL(platformURL, gameId, name) {
  const url=new URL(platformURL);
  if(url.username||url.password||url.search||url.hash||!(url.protocol==='https:'||(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname))))throw Error('Invalid platform entry URL');
  if(!/^[a-z0-9-]{1,60}$/.test(gameId))throw Error('Invalid game ID');
  url.pathname='/tee-play.html';
  url.search=new URLSearchParams({game:gameId,name:String(name).slice(0,25)}).toString();
  return url.toString();
}
