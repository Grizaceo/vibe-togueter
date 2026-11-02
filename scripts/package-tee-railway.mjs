// Only assemble reviewed inert source. Does not build, upload or deploy anything.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const source=path.resolve(process.argv[2]||''),destination=path.resolve(process.argv[3]||'');
if(!process.argv[2]||!process.argv[3]||!destination.startsWith('/tmp/'))throw Error('Specify clean external worktree and a fresh /tmp destination');
if(fs.existsSync(destination))throw Error('Use a new package directory');
const git=(...args)=>execFileSync('git',['-C',source,...args],{encoding:'utf8'}).trim();
if(git('status','--porcelain'))throw Error('Commit/review the isolated game changes first');
const base='172cfef66565af00f75e865c60e3c91859beb039';git('merge-base','--is-ancestor',base,'HEAD');
fs.mkdirSync(destination,{recursive:true});
const gameDir=path.join(destination,'game');fs.mkdirSync(gameDir);
// Only tracked committed external source. No host .env, Git metadata, target or node_modules.
const archive=path.join(destination,'source.tar');
execFileSync('git',['-C',source,'archive','--format=tar','--output='+archive,'HEAD']);
execFileSync('tar',['-xf',archive,'-C',gameDir]);fs.unlinkSync(archive);
for(const file of ['Dockerfile','railway.json'])fs.copyFileSync('deploy/tee-railway/'+file,path.join(destination,file));
fs.copyFileSync('scripts/tee-vm-gateway.mjs',path.join(destination,'tee-vm-gateway.mjs'));
fs.mkdirSync(path.join(destination,'public'));
for(const file of ['tee-play.html','tee-play.js'])fs.copyFileSync('public/'+file,path.join(destination,'public',file));
const wsVersion=JSON.parse(fs.readFileSync('node_modules/ws/package.json','utf8')).version;
fs.writeFileSync(path.join(destination,'gateway-package.json'),JSON.stringify({private:true,type:'module',dependencies:{ws:wsVersion}},null,2)+'\n');
fs.writeFileSync(path.join(destination,'source-manifest.json'),JSON.stringify({contractVersion:1,schema:'teeworlds-rs/172cfef',gameBaseRevision:base,gameRevision:git('rev-parse','HEAD'),platformRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),credits:'External teeworlds-rs by Cristóbal Muñoz with Devin and Hermes; platform Vibe Togueter implemented as Vibe Arena.',platformCustomDomain:'pending',temporaryGameTrial:true},null,2)+'\n');
console.log(JSON.stringify({package:destination,gameRevision:git('rev-parse','HEAD'),built:false,uploaded:false}));
