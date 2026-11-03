// Local codec build only. Never builds/starts the external server or WASM.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
const source = path.resolve(process.argv[2] || '');
const pin = '172cfef66565af00f75e865c60e3c91859beb039';
if (execFileSync('git', ['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim() !== pin)
  throw Error('Use a separate external worktree at '+pin);
if (execFileSync('git',['-C',source,'status','--porcelain','--','crates/shared','Cargo.toml','Cargo.lock'],{encoding:'utf8'}).trim())
  throw Error('External protocol sources must be clean.');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'va-tee-codec-'));
fs.cpSync('tools/tee-codec/src',path.join(temp,'src'),{recursive:true});
fs.copyFileSync('tools/tee-codec/Cargo.lock',path.join(temp,'Cargo.lock'));
fs.writeFileSync(path.join(temp,'Cargo.toml'),fs.readFileSync('tools/tee-codec/Cargo.toml.in','utf8').replace('@SHARED_PATH@',path.join(source,'crates/shared')));
execFileSync('cargo',['build','--locked','--offline','--manifest-path',path.join(temp,'Cargo.toml')],{stdio:'inherit'});
console.log(path.join(temp,'target/debug/vibe-arena-tee-codec'));
