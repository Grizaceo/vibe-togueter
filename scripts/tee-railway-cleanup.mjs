// Operator-owned finite trial cleanup. Requires an explicit private creation intent.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const file=process.argv[2],railway='/tmp/vt-railway-cli/node_modules/.bin/railway';
if(!file)throw Error('Private lease path required');
const lease=JSON.parse(fs.readFileSync(file,'utf8'));
const save=()=>fs.writeFileSync(file,JSON.stringify(lease,null,2)+'\n',{mode:0o600});
const call=args=>JSON.parse(execFileSync(railway,args,{encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:20000}));
if(lease.version!==1||!/^vt-tee-demo-[a-f0-9]{12}$/.test(lease.projectName)||!lease.creationAuthorized||!Number.isFinite(Date.parse(lease.deadlineUTC)))throw Error('Invalid explicit lease');
if(Date.now()<Date.parse(lease.deadlineUTC)&&!process.argv.includes('--now'))process.exit(0);
lease.lastAttemptUTC=new Date().toISOString();save();
const list=call(['list','--json']);
const projects=Array.isArray(list)?list:list.projects;
if(!Array.isArray(projects))throw Error('Unrecognized inventory; do not guess');
const matches=projects.filter(p=>p.name===lease.projectName);
if(matches.length>1)throw Error('Ambiguous ownership; no deletion');
if(matches.length===0){lease.terminal='absent-from-authenticated-inventory';lease.terminalAt=new Date().toISOString();save();process.exit(0);}
const project=matches[0];
if(lease.projectId&&project.id!==lease.projectId)throw Error('Project identity mismatch');
lease.projectId=project.id;save();
// This project name was randomly reserved before creation; no unrelated project is touched.
call(['delete','--project',project.id,'--yes','--json']);
lease.deletionRequestedUTC=new Date().toISOString();save();
// Railway schedules deletion. A later timer checks actual absence; acceptance is not terminal.
process.exitCode=1;
