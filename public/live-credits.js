import {renderCreatorCredits} from './credits.js';
export function attachLiveCredits(container){
 let publication=null,gameHash=null,lastPin=null;
 function render(){
  const valid=publication?.status==='published'&&publication.codeSha256===gameHash;
  container.hidden=!valid;if(!valid){container.replaceChildren();lastPin=null;return;}
  const pin=publication.codeSha256+':'+publication.manifest.sha256;if(lastPin===pin)return;lastPin=pin;
  const details=document.createElement('details'),summary=document.createElement('summary'),body=document.createElement('div');
  const creators=[...new Set(publication.manifest.assets.map(a=>a.creator.name))];summary.textContent='Art by '+creators.join(', ')+' · creator links & licenses';renderCreatorCredits(body,publication.manifest);details.append(summary,body);container.replaceChildren(details);
 }
 async function refresh(){try{const response=await fetch('/community/game-credits',{cache:'no-store'});if(!response.ok)throw Error('Credits unavailable');publication=await response.json();}catch{publication=null;}render();}
 const timer=setInterval(refresh,2000);refresh();
 return {matchGame(game){gameHash=game?.versionSha256||null;render();},close(){clearInterval(timer);container.replaceChildren();}};
}
