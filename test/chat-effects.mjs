import {test} from 'node:test';import assert from 'node:assert/strict';import {ChatEffects} from '../src/chat-effects.js';
test('only trusted Twitch broadcaster or mod can pause; nicknames and disabled config cannot',()=>{
 const control=new ChatEffects({enabled:true,channel:'owner'});
 for(const actor of [{source:'web',user:'owner'},{source:'web',user:'mod',isModerator:true},{source:'admin',user:'owner'},{source:'twitch',user:'viewer'}]){assert.equal(control.command(actor,'!pause').changed,false);assert.equal(control.blocked,false);}
 assert.equal(control.command({source:'twitch',user:'OWNER'},'!pause').changed,true);assert.equal(control.blocked,true);
 assert.equal(control.command({source:'twitch',user:'mod',isModerator:true},'!resume').changed,true);assert.equal(control.blocked,false);
 const disabled=new ChatEffects({enabled:false,channel:'owner'});disabled.command({source:'twitch',user:'owner'},'!pause');disabled.setPaused(true);assert.equal(disabled.blocked,false);
});
test('pause/resume repeats are idempotent and other commands remain routable',()=>{
 const control=new ChatEffects({enabled:true,channel:'owner'}),actor={source:'twitch',user:'mod',isModerator:true};
 assert.equal(control.command(actor,'!pause').changed,true);assert.equal(control.command(actor,'!pause').changed,false);assert.equal(control.command(actor,'!fallback').handled,false);
 assert.equal(control.command(actor,' !RESUME ').changed,true);assert.equal(control.command(actor,'!resume').changed,false);
});
