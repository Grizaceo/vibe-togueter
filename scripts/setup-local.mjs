// Generate local-only secrets; never print values or overwrite configured keys.
// --rotate-seat-key replaces VA_SEAT_KEY on purpose, which voids every seat token.
import crypto from 'node:crypto';import {TwitchAuth,readEnv} from '../src/auth/twitch.js';import {generateSeatKey} from '../src/seats.js';
const values=readEnv(),fresh={};
for(const key of ['VA_ADMIN_TOKEN','VA_STREAMER_KEY','VA_EVENTSUB_SECRET','VA_WEBHOOK_SECRET'])if(!values[key])fresh[key]=crypto.randomBytes(24).toString('hex');
if(!values.VA_SEAT_KEY||process.argv.includes('--rotate-seat-key'))fresh.VA_SEAT_KEY=generateSeatKey();
new TwitchAuth().save(fresh);console.log('Local secrets ready in .env (600); values not printed.'+(fresh.VA_SEAT_KEY&&values.VA_SEAT_KEY?' Seat key rotated.':''));
