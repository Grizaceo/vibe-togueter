export function studioLinkURL(value,origin){
 const target=new URL(value,origin);
 const curated=typeof value==='string'&&/^\/curated\/[a-z0-9-]+\/[a-zA-Z0-9_-]+\.png$/.test(value)&&target.origin===origin;
 return target.protocol==='https:'||curated?target.toString():null;
}
