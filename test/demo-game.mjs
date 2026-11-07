import {test} from 'node:test';import assert from 'node:assert/strict';
import * as game from '../games/demo/game.js';
const advance=(s,seconds)=>{for(let i=0;i<Math.ceil(seconds*30);i++)game.tick(s,1/30);};
const move=(key)=>{const s=game.createState();game.onJoin(s,{id:1,name:'viewer'});const p=s.__players.get(1),x0=p.x,y0=p.y;game.onInput(s,1,{kind:'key',key,down:true});advance(s,.5);return {dx:p.x-x0,dy:p.y-y0};};
test('WASD keys move the demo player like the arrow keys',()=>{
 for(const [wasd,arrow,axis,sign] of [['d','right','dx',1],['a','left','dx',-1],['w','up','dy',-1],['s','down','dy',1]]){
  const k=move(wasd),a=move(arrow);
  assert.ok(Math.sign(k[axis])===sign&&Math.abs(k[axis])>0,`${wasd} moved ${axis} by ${k[axis]}`);
  assert.equal(Math.sign(k[axis]),Math.sign(a[axis]),`${wasd} does not match ${arrow}`);
  const other=axis==='dx'?'dy':'dx';assert.equal(k[other],0,`${wasd} also moved ${other}`);
 }
});
