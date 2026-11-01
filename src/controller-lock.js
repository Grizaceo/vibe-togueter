import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import net from 'node:net';
// Kernel-owned IPC lease; a different HTTP port must not create a second writer.
export async function acquireController(file){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const identity=crypto.createHash('sha256').update(path.join(fs.realpathSync(path.dirname(file)),path.basename(file))).digest('hex').slice(0,32);
 const endpoint=process.platform==='linux'?'\0vibe-arena-'+identity:process.platform==='win32'?'\\\\.\\pipe\\vibe-arena-'+identity:file+'.socket';
 const lease=net.createServer(socket=>socket.destroy());
 await new Promise((resolve,reject)=>{lease.once('error',()=>reject(new Error('Another controller owns this runtime, or its IPC lease needs inspection.')));lease.listen(endpoint,resolve);});
 const nonce=crypto.randomBytes(16).toString('hex');
 try{fs.writeFileSync(file,JSON.stringify({pid:process.pid,nonce}),{mode:0o600});}catch(error){lease.close();throw error;}
 let released=false;
 const release=()=>{if(released)return Promise.resolve();released=true;try{if(JSON.parse(fs.readFileSync(file,'utf8')).nonce===nonce)fs.unlinkSync(file);}catch{}return new Promise(resolve=>lease.close(resolve));};
 process.once('exit',()=>{release();});return release;
}
