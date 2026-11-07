// SDK adapter conformance driver: real v1 messages through the real sandbox.
// Realistic cases use a generated SDK game; hostile cases use a stub worker
// bound into the same bwrap+seccomp+cgroup path via command/extraBinds.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SdkAdapter } from "../../src/protocol/adapters/sdk.js";
import { cgroupsAvailable } from "../../src/sandbox.js";
const BASE_MANIFEST = {
  protocol: "va-game/1",
  id: "fixture",
  name: "fixture",
  world: { w: 1280, h: 720 },
  tickRate: 30,
  input: {
    keys: ["left", "right", "w", "a", "s", "d", "up", "down", "space"],
    pointer: true,
    actions: [{ name: "aim", fields: { x: [-1, 1], y: [-1, 1] } }],
  },
  chat: {
    commands: [
      {
        name: "plant",
        args: [{ int: [1, 6] }, { enum: ["oak", "pine"] }, { text: 40 }],
        who: "anyone",
        perActorMs: 150,
        globalPerSec: 1,
      },
      { name: "admin", args: [], who: "broadcaster", perActorMs: 100 },
    ],
    bursts: [],
  },
  delivery: ["A"],
  resources: [],
};
// The game records every SDK callback into view().hud as JSON text items, so
// received() can replay what the game actually got.
const GAME = (manifestExpr, meta) => `
export const meta=${JSON.stringify(meta)};
${manifestExpr === null ? "" : `export const manifest=${manifestExpr};`}
const log=[];const push=(o)=>{log.push(JSON.stringify(o));if(log.length>300)log.shift()};
export function createState(){return {}}
export function onJoin(s,p){push({t:'join',seat:p})}
export function onLeave(s,p){push({t:'leave',seat:p})}
export function onInput(s,id,d){push({t:'input',seat:id,data:d})}
export function onChat(s,a,c,args){push({t:'chat',actor:{name:a.name,platform:a.source},cmd:c,args})}
export function onEffect(s,name,args,actor){push({t:'effect',name,args,actor})}
export function onCrowdBonus(s,b){push({t:'crowd-bonus',bonus:b})}
export function tick(s){}
export function view(s){return {bg:'#111',world:{w:1280,h:720},layers:[],hud:log.map(t=>({t:'text',text:t}))}}`;
const parseHud = (view) =>
  (view?.hud || [])
    .filter((h) => h && h.t === "text")
    .map((h) => {
      try {
        return JSON.parse(h.text);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
// A stub worker inside the same sandbox: it speaks whatever line script the
// scenario demands, even ones a real game can never emit.
const stubSource = (scenario) => `import readline from 'node:readline';
const S=${JSON.stringify(scenario)};
const say=(o)=>process.stdout.write((typeof o==='string'?o:JSON.stringify(o))+'\\n');
const after=()=>{
 const b=S.behavior??'frames';
 if(b==='frames')setInterval(()=>say({t:'frame',view:{layers:[],hud:[]}}),S.interval??20);
 else if(b==='health')setInterval(()=>say({t:'health',tick:0,players:0}),S.interval??20);
 else if(b==='malformed')setTimeout(()=>say('{not json'),30);
 else if(b==='oversized')setTimeout(()=>say({t:'frame',view:{hud:'x'.repeat(700000)}}),30);
 else if(b==='unknown')setTimeout(()=>say({t:'bogus'}),30);
 else if(b==='failure')setTimeout(()=>say({t:'failure',code:'boom',message:S.failureMessage??'gave up'}),30);
 else if(b==='round')setTimeout(()=>say({t:'round',phase:'end',results:S.results??[]}),30);
 else if(b==='second-ready')setTimeout(()=>say({t:'ready',protocol:'va-game/1',manifest:${JSON.stringify(BASE_MANIFEST)},view:{}}),30);
};
readline.createInterface({input:process.stdin}).on('line',(line)=>{
 let msg;try{msg=JSON.parse(line)}catch{return}
 if(msg.t==='hello'&&!S.neverReady)setTimeout(()=>{say({t:'ready',protocol:S.protocol??'va-game/1',manifest:S.manifest===undefined?${JSON.stringify(BASE_MANIFEST)}:S.manifest,view:{bg:'#1',world:{w:1,h:1},layers:[],hud:[]}});after();},S.delay??0);
});
if(S.exitAfter!==undefined)setTimeout(()=>process.exit(0),S.exitAfter);`;
const HOSTILE = new Set([
  "malformed",
  "oversized",
  "unknown",
  "failure",
  "second-ready",
  "round",
  "silent",
]);
export async function makeSdk(scenario = {}) {
  const cgroups = await cgroupsAvailable();
  const needsStub =
    scenario.stub === true ||
    (scenario.protocol !== undefined && scenario.protocol !== "va-game/1") ||
    scenario.delay !== undefined ||
    scenario.neverReady === true ||
    scenario.exitAfter !== undefined ||
    HOSTILE.has(scenario.behavior);
  if (needsStub) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "va-stub-"));
    const file = path.join(dir, "stub.mjs");
    const stubScenario = { ...scenario };
    if (stubScenario.manifest === undefined && scenario.rounds !== undefined)
      stubScenario.manifest = {
        protocol: "va-game/1",
        rounds: scenario.rounds === true,
      };
    fs.writeFileSync(file, stubSource(stubScenario));
    const adapter = new SdkAdapter({
      source: "",
      cgroups,
      command: [
        "/usr/bin/node",
        "--max-old-space-size=96",
        "--experimental-vm-modules",
        file,
      ],
      extraBinds: [file],
    });
    return { adapter, received: () => [] };
  }
  const manifest =
    scenario.manifest === null ? null : (scenario.manifest ?? BASE_MANIFEST);
  const meta = {
    name: manifest?.name ?? "sdk-fixture",
    description: "conformance fixture",
    world: manifest?.world ?? { w: 1280, h: 720 },
    tickRate: manifest?.tickRate ?? 30,
  };
  const adapter = new SdkAdapter({
    source: GAME(manifest === null ? null : JSON.stringify(manifest), meta),
    cgroups,
  });
  return { adapter, received: (session) => parseHud(session?.view) };
}
