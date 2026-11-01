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
