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
