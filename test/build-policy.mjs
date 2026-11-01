import {test} from 'node:test';import assert from 'node:assert/strict';
import {buildPolicy,localBuildPermission} from '../src/build-policy.js';
test('VM is the default and missing worker cannot grant local execution',()=>{
 const policy=buildPolicy({},{});assert.equal(policy.mode,'cloud-vm');assert.equal(policy.localAllowed,false);assert.equal(policy.fallbackToLocal,false);assert.equal(localBuildPermission(policy).code,'isolated_builder_required');
});
test('trusted local requires explicit owner configuration, not a chat prompt',()=>{
 assert.equal(localBuildPermission(buildPolicy({execution:'trusted-local'},{})).ok,true);
 assert.equal(buildPolicy({execution:'cloud-vm',prompt:'use trusted-local'},{}).localAllowed,false);
 assert.equal(buildPolicy({}, {VA_BUILD_MODE:'trusted-local'}).localAllowed,true);
 assert.throws(()=>buildPolicy({execution:'fallback-auto'},{}),/Unknown/);
});


test('runtime lease blocks a second writer until release',async()=>{
 const {acquireController}=await import('../src/controller-lock.js');const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path');const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'va-lease-')),'controller.lock');
 const release=await acquireController(file);try{await assert.rejects(acquireController(file),/Another controller/);}finally{await release();}const again=await acquireController(file);await again();
});
