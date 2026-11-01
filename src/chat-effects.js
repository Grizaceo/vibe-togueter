// Authority comes from the trusted IRC adapter, never a browser nickname.
export class ChatEffects {
 constructor({enabled=false,channel=''}={}){this.enabled=enabled===true;this.channel=String(channel||'').toLowerCase();this.paused=false;}
 command({source,user,isModerator=false},text){
  const command=String(text).trim().toLowerCase();if(!['!pause','!resume'].includes(command))return {handled:false};
  if(!this.enabled||source!=='twitch'||!(isModerator===true||(this.channel&&String(user).toLowerCase()===this.channel)))return {handled:true,changed:false};
  return {handled:true,...this.setPaused(command==='!pause')};
 }
 setPaused(value){if(!this.enabled)return {changed:false};const next=value===true,changed=next!==this.paused;this.paused=next;return {changed,paused:this.paused};}
 get blocked(){return this.enabled&&this.paused;}
}
