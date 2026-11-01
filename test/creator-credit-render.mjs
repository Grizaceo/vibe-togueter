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
test('live creator panel only displays credits matching the executing game hash',async()=>{
 const {attachLiveCredits}=await import('../public/live-credits.js');class Node{constructor(tag){this.tag=tag;this.children=[];}append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}}
 const previous={document:globalThis.document,fetch:globalThis.fetch,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval};let cleared=false;
 globalThis.document={createElement:tag=>new Node(tag),createTextNode:text=>({textContent:text})};globalThis.fetch=async()=>({ok:true,json:async()=>({status:'published',codeSha256:'version-a',manifest:{sha256:'manifest-a',assets:[{title:'Test art',creator:{name:'Synthetic creator',website:'https://example.test/',socials:[]},license:{id:'CC0-1.0',url:'https://creativecommons.org/publicdomain/zero/1.0/',attribution:'Test art attribution'}}]}})});globalThis.setInterval=()=>1;globalThis.clearInterval=()=>{cleared=true;};
 try{const root=new Node('div'),panel=attachLiveCredits(root);await new Promise(resolve=>setImmediate(resolve));assert.equal(root.hidden,true);panel.matchGame({versionSha256:'version-a'});assert.equal(root.hidden,false);assert.equal(root.children[0].tag,'details');panel.matchGame({versionSha256:'version-b'});assert.equal(root.hidden,true);assert.equal(root.children.length,0);panel.close();assert.equal(cleared,true);}finally{Object.assign(globalThis,previous);}
});
