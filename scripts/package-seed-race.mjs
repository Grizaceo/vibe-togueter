// Inert, allowlisted transfer package. Never imports candidate code or starts a guest.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {creditManifestFingerprint} from '../src/creator-assets.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const pins=Object.freeze({
 codeSha256:'f145319f61feb57ffbb41a0057954f5533b59d28caed10f3a625d751ef812105',
 artifactHash:'e41cdbd68ccad078fb9ab33e35b7c95dadbc44db1177808c81c03f62e914f3f5',
 reportHash:'3dcbc39f0eea93ba2acb134b421afb253227c6d5441163337bbb9656ae71165e',
});
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const json=bytes=>JSON.parse(bytes.toString('utf8'));
const artifact='artifacts/seed-race/'+pins.codeSha256;
const mapping={
 'candidate/game.js':artifact+'/game.js',
 'provenance.json':artifact+'/provenance.json',
 'evidence/approval.json':'docs/evidence/seed-race-owner-approval-1793545735358.json',
 'evidence/quarantine.json':'docs/evidence/seed-race-quarantine-1793545575065.json',
 'sdk/gamehost.mjs':'src/gamehost.js',
 'guest/check.mjs':'scripts/vm-seed-check.mjs',
 'public/curated/kenney-background-elements/License.txt':'public/curated/kenney-background-elements/License.txt',
 'public/curated/kenney-background-elements/provenance.json':'public/curated/kenney-background-elements/provenance.json',
 ...Object.fromEntries(['sky','hills1','tree01'].map(name=>{
  const file='public/curated/kenney-background-elements/'+name+'.png';return [file,file];
 })),
};
const required=[...Object.keys(mapping),'task.json'].sort();
function requireValue(ok,message){if(!ok)throw Error(message);}
function readPlain(base,name){
 const file=path.resolve(base,name);
 requireValue(file.startsWith(path.resolve(base)+path.sep)&&fs.realpathSync(file)===file&&fs.lstatSync(file).isFile(),'Package path must be a regular unlinked file: '+name);
 return fs.readFileSync(file);
}
function validateBindings(read){
 const source=read('candidate/game.js'),p=json(read('provenance.json'));
 const approval=json(read('evidence/approval.json')),q=json(read('evidence/quarantine.json'));
 for(const [key,value] of Object.entries(pins)){
  requireValue(p[key]===value&&approval[key]===value,'Pinned '+key+' mismatch');
 }
 requireValue(sha(source)===pins.codeSha256,'Candidate source hash mismatch');
 requireValue(p.status==='approved'&&p.published===false&&approval.published===false,'Expected approved, unpublished artifact');
 requireValue(p.ownerApproval?.rightsAttested===true&&JSON.stringify(p.ownerApproval)===JSON.stringify(approval.approval),'Exact owner approval mismatch');
 requireValue(p.ownerApproval.artifactHash===pins.artifactHash&&p.ownerApproval.reportHash===pins.reportHash,'Owner approval version mismatch');
 const resourceHash=creditManifestFingerprint(p.resourceManifest);
 requireValue(sha(JSON.stringify({roundId:p.roundId,inputHash:p.inputHash,codeSha256:p.codeSha256,resourceHash}))===pins.artifactHash,'Artifact binding mismatch');
 requireValue(sha(JSON.stringify(q.report)+'\n')===q.evidenceSha256,'Historical guest evidence hash mismatch');
 const checks=q.report?.checks;
 requireValue(q.artifactHash===pins.artifactHash&&q.codeSha256===pins.codeSha256&&q.report?.codeSha256===pins.codeSha256&&q.report?.artifactHash===pins.artifactHash,'Quarantine version mismatch');
 requireValue(Array.isArray(checks)&&checks.length===12&&checks.every(c=>c.passed===true)&&q.report.passed===true,'Expected 12 passing historical guest checks');
 const report={artifactHash:q.artifactHash,testNonce:q.testNonce,testVmId:q.vmId,isolatedVmAttested:true,evidenceSha256:q.evidenceSha256,checks:checks.map(c=>({name:c.name,passed:c.passed})),passed:true,verification:'operator-attested'};
 requireValue(sha(JSON.stringify(report))===pins.reportHash,'Approved report hash mismatch');
 requireValue(q.buildVmId===p.buildVmId&&q.vmId!==p.buildVmId&&q.cleanupConfirmed===true,'Separate guest/cleanup binding mismatch');
 const assets=p.resourceManifest.assets;
 requireValue(assets.length===3,'Expected three pinned resources');
 for(const a of assets){
  requireValue(/^\/curated\/kenney-background-elements\/(sky|hills1|tree01)\.png$/.test(a.sourceURL),'Unexpected resource path');
  requireValue(sha(read('public'+a.sourceURL))===a.expectedContentSha256,'Pinned PNG mismatch: '+a.sourceURL);
 }
 const task=json(read('task.json'));
 requireValue(JSON.stringify(task)===JSON.stringify({codeSha256:p.codeSha256,artifactHash:p.artifactHash,resources:p.resourceManifest}),'Guest task mismatch');
 return {sourceBytes:source.length,resourceCount:assets.length,historicalGuestChecks:checks.length};
}
function filesUnder(dir,prefix=''){
 return fs.readdirSync(dir).flatMap(name=>{
  const entry=path.join(dir,name),relative=prefix+name,stat=fs.lstatSync(entry);
  requireValue(!stat.isSymbolicLink(),'Linked package entry: '+relative);
  return stat.isDirectory()?filesUnder(entry,relative+'/'):[relative];
 }).sort();
}
export function verifyPackage(dir,{manifestSha256}={}){
 requireValue(fs.realpathSync(dir)===path.resolve(dir),'Package root cannot be linked');
 const manifestBytes=readPlain(dir,'manifest.json'),manifest=json(manifestBytes);
 if(manifestSha256!==undefined)requireValue(sha(manifestBytes)===manifestSha256,'Trusted manifest hash mismatch');
 requireValue(manifest.kind==='inert-seed-race-transfer-v1'&&manifest.published===false,'Invalid package type');
 requireValue(JSON.stringify(manifest.pins)===JSON.stringify(pins),'Package pins mismatch');
 requireValue(JSON.stringify(Object.keys(manifest.files).sort())===JSON.stringify(required),'Unexpected package inventory');
 requireValue(JSON.stringify(filesUnder(dir))===JSON.stringify([...required,'manifest.json'].sort()),'Missing or extra package entries');
 for(const name of required){const bytes=readPlain(dir,name),entry=manifest.files[name];requireValue(bytes.length===entry.bytes&&sha(bytes)===entry.sha256,'Transfer hash mismatch: '+name);}
 return {...validateBindings(name=>readPlain(dir,name)),manifestSha256:sha(manifestBytes),files:required.length+1,kind:manifest.kind,published:false,candidateExecuted:false};
}
export function createPackage(output,{sourceRoot=root}={}){
 const dir=path.resolve(output);
 requireValue(!fs.existsSync(dir),'Output must not exist; never overwrite a prior package');
 // Read only explicit source/resource/evidence paths, never runtime journals or config.
 const bytes=Object.fromEntries(Object.entries(mapping).map(([name,source])=>[name,readPlain(sourceRoot,source)]));
 const p=json(bytes['provenance.json']);
 bytes['task.json']=Buffer.from(JSON.stringify({codeSha256:p.codeSha256,artifactHash:p.artifactHash,resources:p.resourceManifest})+'\n');
 validateBindings(name=>bytes[name]);
 fs.mkdirSync(dir,{mode:0o700});
 try{
  for(const name of required){const file=path.join(dir,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes[name],{mode:0o600,flag:'wx'});}
  const manifest={kind:'inert-seed-race-transfer-v1',pins,published:false,execution:'Separate runtime VM only; no host import or execution. SDK/harness included as transfer material, not a connected runtime.',files:Object.fromEntries(required.map(name=>[name,{bytes:bytes[name].length,sha256:sha(bytes[name])}]))};
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600,flag:'wx'});
  return verifyPackage(dir);
 }catch(error){fs.rmSync(dir,{recursive:true,force:true});throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{
  const [action,dir,expectedManifest,...extra]=process.argv.slice(2);
  requireValue(['create','verify'].includes(action)&&dir&&!extra.length&&(action==='create'?!expectedManifest:/^[a-f0-9]{64}$/.test(expectedManifest||'')),'Usage: node scripts/package-seed-race.mjs create DIRECTORY | verify DIRECTORY TRUSTED_MANIFEST_SHA256');
  console.log(JSON.stringify(action==='create'?createPackage(dir):verifyPackage(dir,{manifestSha256:expectedManifest}),null,2));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
