// Generate local-only secrets; never print values or overwrite configured keys.
import crypto from 'node:crypto';import {TwitchAuth,readEnv} from '../src/auth/twitch.js';
const values=readEnv(),fresh={};
for(const key of ['VA_ADMIN_TOKEN','VA_STREAMER_KEY','VA_EVENTSUB_SECRET','VA_WEBHOOK_SECRET'])if(!values[key])fresh[key]=crypto.randomBytes(24).toString('hex');
new TwitchAuth().save(fresh);console.log('Local secrets ready in .env (600); values not printed.');
