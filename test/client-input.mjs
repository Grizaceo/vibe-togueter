import {test} from 'node:test';import assert from 'node:assert/strict';import {connect} from '../public/client.js';
function fixture(t){
 const globals=['location','localStorage','WebSocket','addEventListener'];const previous=Object.fromEntries(globals.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 t.after(()=>{for(const key of globals){if(previous[key])Object.defineProperty(globalThis,key,previous[key]);else delete globalThis[key];}});
 const windowEvents=new Map(),canvasEvents=new Map(),sent=[];globalThis.location={search:'',protocol:'http:',host:'localhost'};globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
 globalThis.WebSocket=class{readyState=1;send(s){sent.push(JSON.parse(s).data);}};
 globalThis.addEventListener=(name,fn)=>windowEvents.set(name,fn);
 const canvas={getContext:()=>null,addEventListener:(name,fn)=>canvasEvents.set(name,fn),getBoundingClientRect:()=>({left:0,top:0,width:1280,height:720}),setPointerCapture:()=>{}};
 connect({canvas});return {sent,windowEvents,canvasEvents};
}
test('blur releases both vertical arrow keys as well as held pointer input',t=>{
 const {sent,windowEvents,canvasEvents}=fixture(t);canvasEvents.get('pointerdown')({pointerId:1,clientX:100,clientY:200});windowEvents.get('blur')();
 for(const key of ['up','down','left','right','space'])assert.ok(sent.some(e=>e.kind==='key'&&e.key===key&&!e.down));assert.ok(sent.some(e=>e.kind==='pointer'&&!e.down));
});
test('releasing outside canvas sends a pointer-up and permits the next click',t=>{
 const {sent,windowEvents,canvasEvents}=fixture(t);canvasEvents.get('pointerdown')({pointerId:2,clientX:100,clientY:200});
 assert.equal(typeof windowEvents.get('pointerup'),'function');windowEvents.get('pointerup')({pointerId:2,clientX:1500,clientY:200});canvasEvents.get('pointerdown')({pointerId:3,clientX:100,clientY:200});assert.deepEqual(sent.filter(e=>e.kind==='pointer').map(e=>e.down),[true,false,true]);
});
test('pointer cancellation clears held state without accepting another touch release',t=>{
 const {sent,windowEvents,canvasEvents}=fixture(t);canvasEvents.get('pointerdown')({pointerId:2,clientX:100,clientY:200});
 assert.equal(typeof windowEvents.get('pointercancel'),'function');windowEvents.get('pointercancel')({pointerId:8,clientX:0,clientY:0});assert.equal(sent.length,1);windowEvents.get('pointercancel')({pointerId:2,clientX:0,clientY:0});assert.equal(sent.at(-1).down,false);
});
