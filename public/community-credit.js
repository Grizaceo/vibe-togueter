export function communityCreditText(credit){
 if(!credit)return '';
 return `Voted by ${credit.voterCount} · Approved by ${credit.approvedBy.name}${credit.approvedBy.authority==='delegated-moderator'?' (delegated mod)':''}`;
}
