import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGameHandler, PUBLIC_ROOM, CLASSIC_PUBLIC_ROOM, PUBLIC_ROOMS } from '../lib/game-api';
import { SqliteRoomStore, ROOM_TTL_MS } from '../lib/room-store';
import { LOCATIONS } from '../lib/locations';
import { MATCH_DURATION, CLASSIC_FREEZE_TIME, RULESET_VERSION, type Match } from '../lib/simulation';

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

test('private rooms preserve every location and share authoritative human movement',async()=>{
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

test('three-slot loadout and melee events persist across independent API instances',async()=>{
  const f=fixture();
  try{
    const host=await f.request({action:'create',name:'HOST'},201);
    const guest=await f.request({action:'join',room:host.room,name:'GUEST'},200,1);
    await f.request({action:'input',room:host.room,token:host.token,input:{...idle(0),weapon:'pistol',shoot:true}});
    const handgun=await f.request({action:'input',room:host.room,token:guest.token,input:idle(0)},200,1);
    assert.equal(handgun.state.players.find(p=>p.id===host.playerId)!.weapon,'pistol');
    assert.equal(handgun.state.players.find(p=>p.id===host.playerId)!.ammo,11);
    await f.request({action:'input',room:host.room,token:host.token,input:{...idle(1),weapon:'knife'}});
    f.advance(600);
    await f.request({action:'input',room:host.room,token:host.token,input:{...idle(2),weapon:'knife',shoot:true,reload:true}},200,1);
    const knife=await f.request({action:'input',room:host.room,token:guest.token,input:idle(1)});
    const seen=knife.state.players.find(p=>p.id===host.playerId)!;
    assert.equal(seen.weapon,'knife');assert.equal(seen.ammo,0);assert.equal(seen.reloadUntil,0);
    assert.ok(knife.state.events.some(e=>e.type==='melee'&&e.playerId===host.playerId));
    const back=await f.request({action:'input',room:host.room,token:host.token,input:{...idle(3),weapon:'pistol'}},200,1);
    assert.equal(back.state.players.find(p=>p.id===host.playerId)!.ammo,11);
    assert.equal(back.state.players.length,2);assert.ok(back.state.players.every(p=>!p.bot));
  }finally{f.cleanup();}
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

test('classic and deathmatch public pools stay separate across independent instances',async()=>{
  const f=fixture();
  try {
    const [classic,deathmatch]=await Promise.all([
      f.request({action:'quickjoin',name:'CLASSIC HOST',mode:'classic'}),
      f.request({action:'quickjoin',name:'DEATHMATCH HOST',mode:'deathmatch'},200,1),
    ]);
    assert.equal(classic.room,CLASSIC_PUBLIC_ROOM);assert.equal(classic.state.mode,'classic');
    assert.equal(deathmatch.room,PUBLIC_ROOM);assert.equal(deathmatch.state.mode,'deathmatch');
    assert.notEqual(classic.room,deathmatch.room);
    const [classicGuest,legacyGuest]=await Promise.all([
      f.request({action:'quickjoin',name:'CLASSIC GUEST',mode:'classic'},200,1),
      f.request({action:'quickjoin',name:'OLD CLIENT'}),
    ]);
    assert.equal(classicGuest.room,classic.room);assert.equal(legacyGuest.room,deathmatch.room);
    assert.deepEqual(classicGuest.state.players.map(p=>p.name).sort(),['CLASSIC GUEST','CLASSIC HOST']);
    assert.deepEqual(legacyGuest.state.players.map(p=>p.name).sort(),['DEATHMATCH HOST','OLD CLIENT']);
    // Player IDs are only unique within a room; credentials must still be room-bound.
    await f.request({action:'input',room:deathmatch.room,token:classic.token,input:idle(0)},401,1);
    await f.request({action:'input',room:classic.room,token:deathmatch.token,input:idle(0)},401);
    for(const mode of ['classic','deathmatch'] as const){
      const persisted=JSON.parse((await f.stores[1].get(PUBLIC_ROOMS[mode]))!.state) as Match;
      assert.equal(persisted.mode,mode);assert.equal(persisted.players.length,2);
    }
  } finally {f.cleanup();}
});

test('private room mode belongs to the room and survives joins, inputs and empty resets',async()=>{
  const f=fixture();
  try {
    for(const mode of ['classic','deathmatch'] as const){
      const opposite=mode==='classic'?'deathmatch':'classic';
      const host=await f.request({action:'create',name:'HOST',locationId:'workshop',mode},201);
      assert.equal(host.state.mode,mode);
      assert.ok(!Object.values(PUBLIC_ROOMS).some(room=>room===host.room));
      const guest=await f.request({action:'join',room:host.room,name:'GUEST',mode:opposite},200,1);
      assert.equal(guest.state.mode,mode,'joining must not change the creator-selected game mode');
      const observed=await f.request({action:'input',room:host.room,token:host.token,mode:opposite,input:idle(0)},200,1);
      assert.equal(observed.state.mode,mode,'input must not change the room mode');
      await f.request({action:'leave',room:host.room,token:host.token});
      await f.request({action:'leave',room:host.room,token:guest.token},200,1);
      const restarted=await f.request({action:'join',room:host.room,name:'NEW HOST',mode:opposite});
      assert.equal(restarted.state.mode,mode,'an empty private room keeps its mode');
      assert.equal(restarted.state.locationId,'workshop');assert.equal(restarted.state.players.length,1);
      const persisted=JSON.parse((await f.stores[1].get(host.room))!.state) as Match;
      assert.equal(persisted.mode,mode);
    }
  } finally {f.cleanup();}
});

test('both public modes survive expired session and room resets',async()=>{
  const f=fixture();
  try {
    for(const mode of ['classic','deathmatch'] as const){
      const first=await f.request({action:'quickjoin',name:'FIRST',mode});
      f.advance(46_000);
      const fresh=await f.request({action:'quickjoin',name:'SECOND',mode},200,1);
      assert.equal(fresh.state.mode,mode);assert.equal(fresh.state.players.length,1);
      assert.equal(fresh.state.players[0].name,'SECOND');
      await f.request({action:'input',room:first.room,token:first.token,input:idle(0)},401);
      f.advance(ROOM_TTL_MS+1000);
      const expired=await f.request({action:'quickjoin',name:'THIRD',mode});
      assert.equal(expired.room,PUBLIC_ROOMS[mode]);assert.equal(expired.state.mode,mode);
      assert.equal(expired.state.players.length,1);assert.equal(expired.state.players[0].name,'THIRD');
    }
  } finally {f.cleanup();}
});

test('room creators reject invalid modes and omitted mode keeps deathmatch compatibility',async()=>{
  const f=fixture();
  try {
    for(const mode of ['competitive','CLASSIC',null,0,true,{},[]]){
      await f.request({action:'create',name:'INVALID',mode},400);
      await f.request({action:'quickjoin',name:'INVALID',mode},400,1);
    }
    const legacy=await f.request({action:'create',name:'OLD CLIENT'},201);
    assert.equal(legacy.state.mode,'deathmatch');
    const next=await f.request({action:'join',room:legacy.room,name:'GUEST'},200,1);
    assert.equal(next.state.mode,'deathmatch');
    assert.equal(await f.stores[1].get(CLASSIC_PUBLIC_ROOM),null,'invalid mode requests must not allocate a public room');
  } finally {f.cleanup();}
});

test('persisted classic rooms retain their mode during rules migration and old rooms default to deathmatch',async()=>{
  const f=fixture();
  try {
    for(const mode of ['classic','deathmatch'] as const){
      const host=await f.request({action:'create',name:'HOST',mode},201);
      const row=(await f.stores[0].get(host.room))!;
      const old=JSON.parse(row.state) as Partial<Match>;
      delete old.rulesVersion;
      if(mode==='deathmatch')delete old.mode; // Simulate the deployed format before modes existed.
      assert.ok(await f.stores[0].compareAndSwap({...row,state:JSON.stringify(old),revision:row.revision+1},row.revision));
      const migrated=await f.request({action:'input',room:host.room,token:host.token,input:idle(0)},200,1);
      assert.equal(migrated.state.mode,mode);
      assert.equal(migrated.state.rulesVersion,RULESET_VERSION);
      assert.equal(migrated.state.players[0].id,host.playerId,'migration preserves the authenticated human session');
      assert.equal((JSON.parse((await f.stores[0].get(host.room))!.state) as Match).mode,mode);
    }
  } finally {f.cleanup();}
});

test('classic purchases, sequence protection and grenade state remain authoritative across API instances',async()=>{
  const f=fixture();
  try {
    const host=await f.request({action:'create',name:'DEFENDER',mode:'classic'},201);
    assert.equal(host.state.classic!.phase,'waiting');
    const guest=await f.request({action:'join',room:host.room,name:'ATTACKER'},200,1);
    assert.equal(guest.state.classic!.phase,'freeze');
    const bought=await f.request({action:'input',room:host.room,token:host.token,input:{...idle(0),buy:'kit'}},200,1);
    assert.equal(bought.state.players.find(p=>p.id===host.playerId)!.money,400);
    assert.equal(bought.state.players.find(p=>p.id===host.playerId)!.defuseKit,true);
    await f.request({action:'input',room:host.room,token:host.token,input:{...idle(0),buy:'he'}});
    const denied=await f.request({action:'input',room:host.room,token:host.token,input:{...idle(1),buy:'sniper'}},200,1);
    const defender=denied.state.players.find(p=>p.id===host.playerId)!;
    assert.equal(defender.money,400,'replayed or unaffordable purchases never deduct money');
    assert.equal(defender.grenades.he,0,'old sequence cannot buy another item');
    assert.ok(!defender.inventory.includes('sniper'));
    const armed=await f.request({action:'input',room:host.room,token:guest.token,input:{...idle(0),buy:'smoke'}});
    assert.equal(armed.state.players.find(p=>p.id===guest.playerId)!.money,500);
    assert.equal(armed.state.players.find(p=>p.id===guest.playerId)!.grenades.smoke,1);
    f.advance(CLASSIC_FREEZE_TIME+1);
    const thrown=await f.request({action:'input',room:host.room,token:guest.token,input:{...idle(1),grenade:'smoke'}},200,1);
    assert.equal(thrown.state.classic!.phase,'live');
    assert.equal(thrown.state.players.find(p=>p.id===guest.playerId)!.grenades.smoke,0);
    assert.equal(thrown.state.grenades.length,1);
    f.advance(1700);
    const observed=await f.request({action:'input',room:host.room,token:host.token,input:idle(2)});
    assert.equal(observed.state.grenades.length,0);assert.equal(observed.state.smokes.length,1);
    const peer=await f.request({action:'input',room:host.room,token:guest.token,input:idle(2)},200,1);
    assert.deepEqual(peer.state.smokes,observed.state.smokes,'both API instances share the committed cloud');
    assert.equal(peer.state.classic!.bomb.carrierId,guest.playerId);
  } finally {f.cleanup();}
});

test('expiring a bomb carrier runs departure cleanup instead of stranding the objective',async()=>{
  const f=fixture();
  try {
    const host=await f.request({action:'create',name:'DEFENDER',mode:'classic'},201);
    const carrier=await f.request({action:'join',room:host.room,name:'ATTACKER'},200,1);
    const position=carrier.state.players.find(p=>p.id===carrier.playerId)!;
    assert.equal(carrier.state.classic!.bomb.carrierId,carrier.playerId);
    f.advance(CLASSIC_FREEZE_TIME+1);
    await f.request({action:'input',room:host.room,token:host.token,input:idle(0)});
    f.advance(30_001);
    const remaining=await f.request({action:'input',room:host.room,token:host.token,input:idle(1)},200,1);
    assert.equal(remaining.state.players.length,1);
    assert.equal(remaining.state.classic!.bomb.status,'dropped');
    assert.equal(remaining.state.classic!.bomb.carrierId,undefined);
    assert.equal(remaining.state.classic!.bomb.x,position.x);assert.equal(remaining.state.classic!.bomb.z,position.z);
    assert.ok(remaining.state.events.some(event=>event.type==='bomb'&&event.playerId===carrier.playerId&&event.text==='Bomb dropped'));
    await f.request({action:'input',room:host.room,token:carrier.token,input:idle(0)},401);
    const saved=JSON.parse((await f.stores[0].get(host.room))!.state) as Match;
    assert.equal(saved.classic!.bomb.status,'dropped');assert.equal(saved.classic!.bomb.carrierId,undefined);
  } finally {f.cleanup();}
});
