import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGameHandler, PUBLIC_ROOM } from '../lib/game-api';
import { SqliteRoomStore, ROOM_TTL_MS } from '../lib/room-store';
import { LOCATIONS } from '../lib/locations';
import { MATCH_DURATION, RULESET_VERSION, type Match } from '../lib/simulation';

interface Joined { room:string; token:string; playerId:string; state:Match; }
const idle=(seq:number,yaw=0)=>({seq,yaw,pitch:0,forward:0,strafe:0,shoot:false,reload:false,sprint:false,jump:false});
function fixture() {
  const directory=mkdtempSync(join(tmpdir(),'nanded-game-api-'));
  const stores=[new SqliteRoomStore(join(directory,'rooms.sqlite')),new SqliteRoomStore(join(directory,'rooms.sqlite'))];
  let now=1_700_000_000_000;
  const handlers=stores.map(store=>createGameHandler(()=>store,()=>now));
  return {
    stores, handlers, get now(){return now;}, advance(ms:number){now+=ms;},
    async request(payload:unknown,status=200,connection=0):Promise<Joined> {
      const response=await handlers[connection](new Request('http://local/api/game',{method:'POST',body:JSON.stringify(payload)}));
      const result=await response.json() as Joined & {error?:string};
      assert.equal(response.status,status,`${(payload as {action?:string})?.action}: ${result.error??'unexpected HTTP status'}`);
      return result;
    },
    cleanup(){stores.forEach(store=>store.close());rmSync(directory,{recursive:true,force:true});},
  };
}

test('simultaneous public joins converge on one durable room with eight real humans',async()=>{
  const f=fixture();
  try {
    const joined=await Promise.all(Array.from({length:8},(_,i)=>f.request({action:'quickjoin',name:`HUMAN ${i}`},200,i%2)));
    assert.ok(joined.every(result=>result.room===PUBLIC_ROOM));
    assert.equal(new Set(joined.map(result=>result.token)).size,8);
    assert.equal(new Set(joined.map(result=>result.playerId)).size,8);
    const row=await f.stores[1].get(PUBLIC_ROOM);assert.ok(row);
    const state=JSON.parse(row.state) as Match;
    assert.equal(state.players.length,8);assert.ok(state.players.every(player=>!player.bot));
    assert.equal(state.locationId,'bhagya');
    assert.equal(state.players.filter(player=>player.team==='blue').length,4);
    assert.equal(state.players.filter(player=>player.team==='orange').length,4);
    await f.request({action:'quickjoin',name:'NINTH HUMAN'},409);
    const snapshot=JSON.stringify(joined.at(-1)!.state);
    for(const result of joined)assert.ok(!snapshot.includes(result.token),'private credential leaked in world snapshot');
    assert.ok(!snapshot.includes('tokenHash'));
    await f.request({action:'leave',room:PUBLIC_ROOM,token:joined[0].token});
    assert.equal((JSON.parse((await f.stores[0].get(PUBLIC_ROOM))!.state) as Match).players.length,7);
    await f.request({action:'input',room:PUBLIC_ROOM,token:joined[0].token,input:idle(0)},401);
    const replacement=await f.request({action:'quickjoin',name:'REPLACEMENT'},200,1);
    assert.equal(replacement.state.players.length,8);
    assert.ok(replacement.state.players.every(player=>!player.bot));
  } finally { f.cleanup(); }
});

test('private rooms preserve all seven locations and share authoritative human movement',async()=>{
  const f=fixture();
  try {
    for(const location of LOCATIONS){
      const host=await f.request({action:'create',name:'HOST',locationId:location.id},201);
      assert.notEqual(host.room,PUBLIC_ROOM);assert.equal(host.state.locationId,location.id);
      assert.equal(host.state.players.length,1);assert.equal(host.state.players[0].bot,false);
      const guest=await f.request({action:'join',room:host.room,name:'GUEST'},200,1);
      assert.equal(guest.state.players.length,2);
      const player=guest.state.players.find(p=>p.id===host.playerId)!;
      const enemy=guest.state.players.find(p=>p.id===guest.playerId)!;
      assert.ok(Math.hypot(player.x-enemy.x,player.z-enemy.z)>=80);
      await f.request({action:'input',room:host.room,token:host.token,input:{...idle(0,player.yaw),forward:1}});
      f.advance(100);
      const moved=await f.request({action:'input',room:host.room,token:host.token,input:idle(1,player.yaw)});
      const observed=await f.request({action:'input',room:host.room,token:guest.token,input:idle(0,enemy.yaw)},200,1);
      const after=moved.state.players.find(p=>p.id===host.playerId)!;
      assert.ok(Math.hypot(after.x-player.x,after.z-player.z)>.4);
      assert.deepEqual(observed.state.players.find(p=>p.id===host.playerId),after);
    }
    await f.request({action:'create',name:'INVALID',locationId:'not-a-sector'},400);
    await f.request({action:'join',room:'ZZZZZZ',name:'UNKNOWN'},404);
    await f.request({action:'input',room:PUBLIC_ROOM,token:'bad',input:idle(0)},401);
  } finally { f.cleanup(); }
});

test('persisted bot and orphan states are removed and old spawns migrate on the next request',async()=>{
  const f=fixture();
  try {
    const host=await f.request({action:'create',name:'REAL HOST',locationId:'workshop'},201);
    const row=(await f.stores[0].get(host.room))!;
    const state=JSON.parse(row.state) as Match;
    delete state.rulesVersion;
    state.players.push({...state.players[0],id:'old-bot',name:'OLD BOT',bot:true});
    state.players.push({...state.players[0],id:'orphan-human',name:'ORPHAN',bot:false});
    state.scores.orange=12;
    state.spawns={blue:[{x:0,z:0}],orange:[{x:1,z:1}]};
    await f.stores[0].compareAndSwap({...row,state:JSON.stringify(state),revision:row.revision+1},row.revision);
    const clean=await f.request({action:'input',room:host.room,token:host.token,input:idle(0)},200,1);
    assert.deepEqual(clean.state.players.map(player=>player.id),[host.playerId]);
    assert.equal(clean.state.rulesVersion,RULESET_VERSION);assert.equal(clean.state.locationId,'workshop');
    assert.deepEqual(clean.state.scores,{blue:0,orange:0});
    assert.ok(clean.state.spawns!.blue.length>=4);
    assert.ok(!JSON.stringify(clean.state).includes('OLD BOT'));
    const persisted=JSON.parse((await f.stores[1].get(host.room))!.state) as Match;
    assert.deepEqual(persisted.players.map(player=>player.id),[host.playerId]);
  } finally { f.cleanup(); }
});

test('public match expires abandoned sessions and resets empty or expired rooms',async()=>{
  const f=fixture();
  try {
    const first=await f.request({action:'quickjoin',name:'FIRST',locationId:'iti'});
    assert.equal(first.state.locationId,'bhagya','public match always uses the same sector');
    f.advance(46_000);
    const fresh=await f.request({action:'quickjoin',name:'SECOND'},200,1);
    assert.equal(fresh.state.players.length,1);assert.equal(fresh.state.players[0].name,'SECOND');
    assert.equal(fresh.state.endsAt,f.now+MATCH_DURATION);assert.equal(fresh.state.round,1);
    await f.request({action:'input',room:PUBLIC_ROOM,token:first.token,input:idle(0)},401);
    await f.request({action:'leave',room:PUBLIC_ROOM,token:fresh.token});
    const empty=JSON.parse((await f.stores[0].get(PUBLIC_ROOM))!.state) as Match;
    assert.equal(empty.players.length,0);
    f.advance(ROOM_TTL_MS+1000);
    const restarted=await f.request({action:'quickjoin',name:'THIRD'},200,1);
    assert.equal(restarted.state.players.length,1);assert.equal(restarted.state.players[0].name,'THIRD');
    assert.equal(restarted.state.endsAt,f.now+MATCH_DURATION);
    assert.ok(restarted.state.players.every(player=>!player.bot));
  } finally { f.cleanup(); }
});
