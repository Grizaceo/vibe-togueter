import {test} from 'node:test';import assert from 'node:assert/strict';import {renderCreatorCredits} from '../public/credits.js';
// Only the content contract is tested here. This is not browser/layout evidence.
test('creator-specified notice, license and follow links appear in the credit panel',()=>{
 class Node{constructor(tag){this.tag=tag;this.children=[];this.textContent='';}append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}}
 const previous=globalThis.document;globalThis.document={createElement:tag=>new Node(tag),createTextNode:text=>Object.assign(new Node('#text'),{textContent:text})};
 try{
  const root=new Node('section'),notice='Credit the Example Collective and retain this copyright notice.';
  renderCreatorCredits(root,{assets:[{title:'Test art',creator:{name:'Synthetic creator',website:'https://example.test/artist',socials:[{label:'Follow',url:'https://example.test/social'}]},license:{id:'CC-BY-4.0',url:'https://creativecommons.org/licenses/by/4.0/',attribution:notice}}]});
  const all=[];const walk=n=>{all.push(n);for(const child of n.children||[])walk(child);};walk(root);
  assert.ok(all.some(n=>n.textContent===notice));assert.ok(all.some(n=>n.href==='https://creativecommons.org/licenses/by/4.0/'));assert.ok(all.some(n=>n.href==='https://example.test/social'));assert.ok(all.filter(n=>n.tag==='a').every(n=>n.rel==='noopener noreferrer'));
 }finally{globalThis.document=previous;}
});
test('live credits stay visible without polling and never attribute a stale version',async()=>{
 const {attachLiveCredits}=await import('../public/live-credits.js');class Node{constructor(tag){this.tag=tag;this.children=[];}append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}}
 const previous={document:globalThis.document,fetch:globalThis.fetch};let reads=0;
 globalThis.document={createElement:tag=>new Node(tag),createTextNode:text=>({textContent:text})};globalThis.fetch=()=>{reads++;throw Error('Credit polling must not occur');};
 const text=node=>[node.textContent||'',...(node.children||[]).map(text)].join(' ');
 try{
  const root=new Node('section'),panel=attachLiveCredits(root);assert.equal(root.hidden,false);
  panel.update({status:'published',codeSha256:'version-a',contributors:{gameAuthors:[{name:'External vibecoder',url:'https://example.test/coder'}],ideaAuthors:[{name:'Community proposer'}],artAuthors:[{name:'Additional artist',url:'https://example.test/additional'}]},manifest:{sha256:'manifest-a',assets:[{title:'Test art',creator:{name:'Synthetic creator',website:'https://example.test/',socials:[]},license:{id:'CC0-1.0',url:'https://creativecommons.org/publicdomain/zero/1.0/',attribution:'Test art attribution'}}]}});
  panel.matchGame({name:'Example game',versionSha256:'version-a'});const strip=root.children[0];assert.equal(strip.className,'creator-strip');for(const author of ['External vibecoder','Community proposer','Synthetic creator','Additional artist'])assert.ok(text(strip).includes(author));assert.equal(root.children[1].tag,'details');assert.equal(root.children[1].open,undefined);
  panel.matchGame({name:'Changed game',versionSha256:'version-b'});assert.equal(root.hidden,false);assert.ok(!text(root).includes('Synthetic creator'));assert.ok(!text(root).includes('External vibecoder'));assert.ok(text(root).includes('Attribution pending'));assert.equal(reads,0);panel.close();assert.equal(root.children.length,0);
 }finally{Object.assign(globalThis,previous);}
});

test('co-credit disappears on source change or disabled presentation flag',async()=>{
 const {attachLiveCredits}=await import('../public/live-credits.js');class Node{constructor(tag){this.tag=tag;this.children=[];}append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}}
 const previous=globalThis.document;globalThis.document={createElement:tag=>new Node(tag),createTextNode:text=>({textContent:text})};const text=n=>[n.textContent||'',...(n.children||[]).map(text)].join(' ');
 try{const root=new Node('section'),panel=attachLiveCredits(root),publication={codeSha256:'exact',contributors:{gameAuthors:[{name:'Coder'}],ideaAuthors:[{name:'Proposer'}],communityCredit:{voterCount:7,approvedBy:{name:'streamer_login',authority:'streamer'}}}};panel.matchGame({versionSha256:'exact'});panel.update(publication);assert.ok(text(root).includes('Voted by 7 · Approved by streamer_login'));panel.update({...publication,showCommunityCredit:false});assert.ok(!text(root).includes('Voted by 7'));panel.update(publication);panel.matchGame({versionSha256:'different'});assert.ok(!text(root).includes('Approved by streamer_login'));}finally{globalThis.document=previous;}
});
