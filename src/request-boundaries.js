import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function secretMatches(expected, supplied){
 if(typeof expected!=='string'||!expected||typeof supplied!=='string')return false;
 const a=Buffer.from(expected),b=Buffer.from(supplied);
 return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
const contained=(root,file)=>{const rel=path.relative(root,file);return rel!==''&&rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);};
export function staticFileInside(root,file){
 try{return contained(path.resolve(root),path.resolve(file))&&contained(fs.realpathSync(root),fs.realpathSync(file))&&fs.statSync(file).isFile();}
 catch{return false;}
}
