import {communityCreditText} from './community-credit.js';
import {renderCreatorCredits} from './credits.js';
function names(items){return items?.map(person=>person.name).join(', ');}
function addPeople(container,label,items,fallback){
 const line=document.createElement('div');line.className='credit-line';line.append(document.createTextNode(label+': '));
 if(!items?.length)line.append(document.createTextNode(fallback));
 else items.forEach((person,index)=>{if(index)line.append(document.createTextNode(', '));if(person.url){const link=document.createElement('a');link.href=person.url;link.textContent=person.name;link.target='_blank';link.rel='noopener noreferrer';line.append(link);}else line.append(document.createTextNode(person.name));});
 container.append(line);
}
export function attachLiveCredits(container){
 let publication=null,gameHash=null,gameName='Waiting for game',lastPin=null;
 function render(){
  const valid=publication?.codeSha256===gameHash&&!!gameHash;
  const credits=valid?publication.contributors:null;
  const manifest=valid&&publication.status==='published'?publication.manifest:null;
  const pin=JSON.stringify([gameHash,gameName,credits,manifest?.sha256,publication?.showCommunityCredit]);if(lastPin===pin)return;lastPin=pin;
  container.hidden=false;container.replaceChildren();
  const strip=document.createElement('div');strip.className='creator-strip';strip.setAttribute?.('aria-label','Game, art and idea credits');
  addPeople(strip,'Game by',credits?.gameAuthors,'Attribution pending · '+gameName);
  const artists=[...new Map([...(credits?.artAuthors||[]),...(manifest?.assets||[]).map(a=>({name:a.creator.name,url:a.creator.website}))].map(person=>[person.name+'|'+(person.url||''),person])).values()];
  addPeople(strip,'Art by',artists,credits?.artNote||'Attribution pending');
  addPeople(strip,'Idea by',credits?.ideaAuthors,'Author not recorded');if(credits?.communityCredit&&publication.showCommunityCredit!==false){const community=document.createElement('div');community.className='community-credit';community.textContent=communityCreditText(credits.communityCredit);strip.append(community);}container.append(strip);
  if(credits?.artNote&&artists?.length){const note=document.createElement('div');note.textContent=credits.artNote;container.append(note);}
  if(manifest?.assets?.length){
   const details=document.createElement('details'),summary=document.createElement('summary'),body=document.createElement('div');
   summary.textContent='Art licenses & creator links · '+names(artists);renderCreatorCredits(body,manifest);details.append(summary,body);container.append(details);
  }
 }
 render();
 return {update(value){publication=value;render();},matchGame(game){gameHash=game?.versionSha256||null;gameName=game?.name||'Waiting for game';render();},close(){container.replaceChildren();}};
}
