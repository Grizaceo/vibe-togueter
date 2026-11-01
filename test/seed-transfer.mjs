import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createPackage,verifyPackage,pins} from '../scripts/package-seed-race.mjs';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const fixture=fn=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'vibe-transfer-test-')),dir=path.join(temp,'package');
 try{createPackage(dir);fn(dir);}finally{fs.rmSync(temp,{recursive:true,force:true});}
};
const rehash=(dir,name)=>{const p=path.join(dir,'manifest.json'),m=JSON.parse(fs.readFileSync(p));const b=fs.readFileSync(path.join(dir,name));m.files[name]={bytes:b.length,sha256:sha(b)};fs.writeFileSync(p,JSON.stringify(m));};
test('exact approved source, historical report and PNGs package as inert data',()=>fixture(dir=>{
 const result=verifyPackage(dir);assert.equal(result.historicalGuestChecks,12);assert.equal(result.resourceCount,3);assert.equal(result.candidateExecuted,false);assert.equal(result.published,false);assert.equal(result.files,13);
 assert.equal(sha(fs.readFileSync(path.join(dir,'candidate/game.js'))),pins.codeSha256);
 assert.throws(()=>createPackage(dir),/must not exist/);
}));
test('transfer corruption and missing files fail verification',()=>{
 fixture(dir=>{fs.appendFileSync(path.join(dir,'candidate/game.js'),'// tampered');assert.throws(()=>verifyPackage(dir),/Transfer hash/);});
 fixture(dir=>{fs.unlinkSync(path.join(dir,'sdk/gamehost.mjs'));assert.throws(()=>verifyPackage(dir),/Missing or extra/);});
});
test('manifest rehash cannot replace approved code, resources or report',()=>{
 for(const name of ['candidate/game.js','public/curated/kenney-background-elements/sky.png','evidence/quarantine.json'])fixture(dir=>{
  if(name.endsWith('.json')){const file=path.join(dir,name),q=JSON.parse(fs.readFileSync(file));q.report.checks[0].name='replacement check';fs.writeFileSync(file,JSON.stringify(q));}
  else fs.appendFileSync(path.join(dir,name),'tampered');
  rehash(dir,name);assert.throws(()=>verifyPackage(dir),/source hash|PNG mismatch|report hash|Historical guest evidence hash/);
 });
});
test('extra secret-like files and linked entries are rejected',()=>{
 fixture(dir=>{fs.writeFileSync(path.join(dir,'.env'),'fixture only');assert.throws(()=>verifyPackage(dir),/Missing or extra/);});
 fixture(dir=>{const file=path.join(dir,'candidate/game.js');fs.unlinkSync(file);fs.symlinkSync('../sdk/gamehost.mjs',file);assert.throws(()=>verifyPackage(dir),/Linked package/);});
});

test('historical frame cannot be rewritten with a matching transfer manifest',()=>fixture(dir=>{
 const file=path.join(dir,'evidence/quarantine.json'),q=JSON.parse(fs.readFileSync(file));
 q.report.frame={hud:[{text:'fabricated gameplay'}]};fs.writeFileSync(file,JSON.stringify(q));rehash(dir,'evidence/quarantine.json');
 assert.throws(()=>verifyPackage(dir),/Historical guest evidence hash/);
}));

test('trusted external manifest digest pins SDK and harness transfer bytes',()=>fixture(dir=>{
 const digest=sha(fs.readFileSync(path.join(dir,'manifest.json')));
 assert.equal(verifyPackage(dir,{manifestSha256:digest}).published,false);
 const name='sdk/gamehost.mjs';fs.appendFileSync(path.join(dir,name),'// changed');rehash(dir,name);
 assert.throws(()=>verifyPackage(dir,{manifestSha256:digest}),/Trusted manifest hash/);
}));
