// Individual play is a browser session, not a collective bridge command.
// Without a name the entry page asks the viewer for one; links posted in chat omit it.
export function teeEntryURL(platformURL, gameId, name) {
  const url=new URL(platformURL);
  if(url.username||url.password||url.search||url.hash||!(url.protocol==='https:'||(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname))))throw Error('Invalid platform entry URL');
  if(!/^[a-z0-9-]{1,60}$/.test(gameId))throw Error('Invalid game ID');
  url.pathname='/tee-play.html';
  const params={game:gameId};
  if(name!==undefined&&name!==null&&String(name).trim())params.name=String(name).slice(0,25);
  url.search=new URLSearchParams(params).toString();
  return url.toString();
}

export function localTeeJoinReply(baseURL) {
  const url=new URL(baseURL);
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.search||url.hash)
    throw Error('Use the private local demo address.');
  // Twitch can linkify the filename as a domain while leaving the local IP plain.
  // A root URL avoids that false link; the local prototype explicitly needs copy/paste.
  // Posted in chat, so no requester name: the entry page asks each viewer.
  url.pathname='/';
  return {entryURL:url.toString(),text:'Local prototype, this PC only: COPY the entire address into your browser (Twitch does not link it reliably): '+url.toString()};
}
