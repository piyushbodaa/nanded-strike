import test from "node:test";
import assert from "node:assert/strict";
import { addPlayer, advanceMatch, applyInput, createMatch, isWalkable, MATCH_DURATION, movePlayer, removePlayer, sanitizeInput, snapshot, RULESET_VERSION, type Input, type Match, type Player } from "../lib/simulation";
import { COLLIDERS, LOCATIONS, MAP_BOUNDS, SPAWNS, WAYPOINTS } from "../lib/map";
import { touchesSolid, raySolid } from "../lib/geometry";
const START=1_700_000_000_000;
// Derive geometry-sensitive fixtures from the current map, preserving the collision assertions.
const WALL = COLLIDERS.find(c => c.h > 3 && c.w > 5 && c.d > 5 && c.d < 20 && touchesSolid(c.x,c.z,c) &&
  isWalkable(c.x,c.z+c.d/2+3) && isWalkable(c.x,c.z-c.d/2-3));
assert.ok(WALL, "map needs a building with accessible positions on both sides");
const openLane = WAYPOINTS.find(p => [-1,0,1].every(dx =>
  Array.from({length:49},(_,i)=>-6+i*.25).every(dz=>isWalkable(p.x+dx,p.z+dz))));
assert.ok(openLane, "map needs a clear 12-metre firing lane with room to strafe");
const OPEN = openLane;
const BOUNDARY_Z = Array.from({length:101},(_,i)=>MAP_BOUNDS.minZ+1+(MAP_BOUNDS.maxZ-MAP_BOUNDS.minZ-2)*i/100)
  .find(z=>isWalkable(MAP_BOUNDS.maxX-.4,z));
assert.notEqual(BOUNDARY_Z,undefined,"map needs an accessible point at its eastern boundary");
const input=(seq:number,extra:Partial<Input>={}):Input=>({seq,forward:0,strafe:0,yaw:0,pitch:0,shoot:false,reload:false,sprint:false,jump:false,...extra});
function duel() {
  const match=createMatch(START);const a=addPlayer(match,"A","blue"),b=addPlayer(match,"B","orange");
  match.players=[a,b];Object.assign(a,{x:OPEN.x,z:OPEN.z+5,y:0,yaw:0,invulnerableUntil:0});Object.assign(b,{x:OPEN.x,z:OPEN.z-5,y:0,invulnerableUntil:0});
  return {match,a,b};
}
function fire(match:Match,a:Player,time:number,seq=0,extra:Partial<Input>={}) {applyInput(match,a.id,input(seq,{shoot:true,...extra}),time);}

test("spawn slots and waypoints are inside collision-free map space",()=>{
  for(const point of [...SPAWNS.blue,...SPAWNS.orange,...WAYPOINTS])assert.ok(isWalkable(point.x,point.z),`blocked ${JSON.stringify(point)}`);
  assert.ok(COLLIDERS.length>10);
});
test("every spawn faces a walkable route into the arena",()=>{
  const match=createMatch(START);
  for(const team of ["blue","orange"] as const){
    const player=addPlayer(match,`SPAWN ${team}`,team);
    for(const point of SPAWNS[team]){
      Object.assign(player,{x:point.x,z:point.z,y:0,vy:0,health:100});
      for(let frame=0;frame<10;frame++)movePlayer(match,player,input(frame,{forward:1}),.05);
      assert.ok(Math.hypot(player.x-point.x,player.z-point.z)>=1,`blocked forward spawn ${team} ${JSON.stringify(point)}`);
      assert.ok(isWalkable(player.x,player.z));
    }
  }
});
test("matches contain only real players, with an eight-human cap and four-person teams",()=>{
  const match=createMatch(START);assert.equal(match.players.length,0);
  for(let i=0;i<8;i++){addPlayer(match,`Player ${i}`,"blue");assert.equal(match.players.length,i+1);assert.ok(match.players.every(p=>!p.bot));}
  assert.equal(match.players.filter(p=>p.team==="blue").length,4);assert.equal(match.players.filter(p=>p.team==="orange").length,4);
  assert.throws(()=>addPlayer(match,"Ninth"),/full/);
  const departing=match.players[0].id;removePlayer(match,departing);assert.ok(!match.players.some(p=>p.id===departing));assert.equal(match.players.length,7);
});
test("names and inputs sanitize control values without accepting client position",()=>{
  const match=createMatch(START);const p=addPlayer(match," <A>\u0000 ");assert.equal(p.name,"A");
  const clean=sanitizeInput({forward:Infinity,strafe:900,yaw:NaN,pitch:-Infinity,seq:Infinity,shoot:1 as unknown as boolean});
  assert.equal(clean.forward,0);assert.equal(clean.strafe,1);assert.equal(clean.yaw,0);assert.equal(clean.pitch,0);assert.equal(clean.seq,-1);assert.equal(clean.shoot,false);
  const {match:m,a}=duel();const x=a.x;applyInput(m,a.id,{...input(0),x:10000} as Input,START);assert.equal(a.x,x);
});
test("forward and strafe follow camera orientation; diagonal movement is normalized",()=>{
  const {match,a}=duel();Object.assign(a,{x:OPEN.x,z:OPEN.z,yaw:0});
  movePlayer(match,a,input(0,{forward:1}),.05);assert.equal(a.x,OPEN.x);assert.ok(a.z<OPEN.z);
  Object.assign(a,{x:OPEN.x,z:OPEN.z});movePlayer(match,a,input(1,{forward:1,strafe:1}),.05);
  assert.ok(Math.abs(Math.hypot(a.x-OPEN.x,a.z-OPEN.z)-.24)<1e-9);
  Object.assign(a,{x:OPEN.x,z:OPEN.z,yaw:-Math.PI/2});movePlayer(match,a,input(2,{forward:1}),.05);
  assert.ok(a.x>OPEN.x);assert.ok(Math.abs(a.z-OPEN.z)<1e-9,"east-facing forward must preserve north/south position");
});
test("server movement is speed-limited, bounded and stops stale controls",()=>{
  const {match,a}=duel();applyInput(match,a.id,input(0,{strafe:1}),START);
  advanceMatch(match,START+100);assert.ok(a.x>OPEN.x&&a.x<OPEN.x+.6);
  const before=a.x;advanceMatch(match,START+100_000);assert.equal(a.x,before);
  Object.assign(a,{x:MAP_BOUNDS.maxX-.4,z:BOUNDARY_Z,yaw:0});movePlayer(match,a,input(1,{strafe:1}),1);
  assert.equal(a.x,MAP_BOUNDS.maxX-.4);assert.ok(isWalkable(a.x,a.z));
});
test("mobile polling jitter keeps controls active, but abandoned input expires",()=>{
  const {match,a}=duel();
  applyInput(match,a.id,input(0,{forward:1}),START);
  advanceMatch(match,START+300);
  const after300=a.z;
  advanceMatch(match,START+500);
  assert.ok(a.z<after300,"450–500ms mobile gaps should not stop a held control");
  advanceMatch(match,START+800);
  const afterExpiry={x:a.x,z:a.z};
  advanceMatch(match,START+1100);
  assert.deepEqual({x:a.x,z:a.z},afterExpiry,"abandoned control must expire after650ms");
});
test("movement never passes through a building, even while jumping",()=>{
  const {match,a}=duel();Object.assign(a,{x:WALL.x,z:WALL.z+WALL.d/2+3,yaw:0});
  const startZ=a.z;
  for(let i=0;i<100;i++){
    movePlayer(match,a,input(i,{forward:1,jump:true}),.05);
    assert.ok(isWalkable(a.x,a.z),"player entered the actual building footprint");
  }
  assert.ok(a.z<startZ-1,"player should approach the building before stopping");
  assert.ok(a.z>WALL.z,"player crossed a solid footprint while jumping");
});
test("raycast damages enemy, records hit and prevents fire-rate abuse",()=>{
  const {match,a,b}=duel();fire(match,a,START);assert.equal(b.health,32);assert.equal(a.ammo,29);
  fire(match,a,START+1,1);assert.equal(a.ammo,29);assert.equal(b.health,32);
  assert.ok(match.events.some(e=>e.type==="hit"&&e.targetId===b.id&&e.headshot));
});
test("wall occlusion stops projectiles",()=>{
  const {match,a,b}=duel();Object.assign(a,{x:WALL.x,z:WALL.z+WALL.d/2+3});Object.assign(b,{x:WALL.x,z:WALL.z-WALL.d/2-3});
  fire(match,a,START);assert.equal(b.health,100);assert.equal(a.ammo,29);assert.ok(!match.events.some(e=>e.type==="hit"));
});
test("friendly fire and spawn shield cause no damage",()=>{
  const {match,a,b}=duel();b.team="blue";fire(match,a,START);assert.equal(b.health,100);
  b.team="orange";b.invulnerableUntil=START+2000;fire(match,a,START+120,1);assert.equal(b.health,100);
});
test("monotonic input sequence rejects replayed and forged-identity actions",()=>{
  const {match,a}=duel();fire(match,a,START,20);const ammo=a.ammo;
  applyInput(match,"not-a-player",input(999,{shoot:true}),START);
  fire(match,a,START,19);assert.equal(a.lastSeq,20);assert.equal(a.ammo,ammo);
});
test("reload waits for authoritative completion and conserves bullets",()=>{
  const {match,a}=duel();a.ammo=3;a.reserve=40;applyInput(match,a.id,input(0,{reload:true}),START);assert.equal(a.reloadUntil,START+1900);
  fire(match,a,START+500,1);assert.equal(a.ammo,3);
  applyInput(match,a.id,input(2),START+1901);assert.equal(a.ammo,30);assert.equal(a.reserve,13);assert.equal(a.reloadUntil,0);
});
test("weapon swapping keeps separate magazines and cancels active reload",()=>{
  const {match,a}=duel();a.ammo=7;applyInput(match,a.id,input(0,{reload:true}),START);
  applyInput(match,a.id,input(1,{weapon:"pistol"}),START);assert.equal(a.ammo,12);assert.equal(a.reloadUntil,0);
  applyInput(match,a.id,input(2,{weapon:"rifle"}),START);assert.equal(a.ammo,7);
});
test("kills score once, victims respawn, and victory restarts the round",()=>{
  const {match,a,b}=duel();match.scores.blue=24;b.health=20;fire(match,a,START);
  assert.equal(a.kills,1);assert.equal(b.deaths,1);assert.equal(match.scores.blue,25);assert.equal(match.winner,"blue");
  advanceMatch(match,START+7001);assert.equal(match.winner,null);assert.equal(match.round,2);assert.equal(b.health,100);assert.equal(match.scores.blue,0);
});
test("dead players cannot fire and respawn after three seconds",()=>{
  const {match,a,b}=duel();b.health=10;fire(match,a,START);assert.equal(b.health,0);
  const ammo=b.ammo;fire(match,b,START+100,0);assert.equal(b.ammo,ammo);
  advanceMatch(match,START+3100);assert.equal(b.health,100);assert.equal(b.respawnAt,0);
});
test("time limit supports draws and snapshots are serializable independent copies",()=>{
  const match=createMatch(START);addPlayer(match,"COPY");advanceMatch(match,START+MATCH_DURATION);assert.equal(match.winner,"draw");
  const copy=snapshot(match);copy.players[0].health=1;assert.notEqual(match.players[0].health,1);assert.doesNotThrow(()=>JSON.stringify(copy));
});
test("legacy bots are removed before ticking or snapshots and never refill",()=>{
  const match=createMatch(START),human=addPlayer(match,"HUMAN"),legacy=addPlayer(match,"OLD BOT");
  legacy.bot=true;legacy.intent=input(0,{shoot:true,forward:1});delete match.rulesVersion;
  match.scores.orange=9;match.events.push({id:++match.eventId,type:"kill",playerId:legacy.id,targetId:human.id,x:0,y:1,z:0,time:START,text:"OLD BOT kill"});
  advanceMatch(match,START+100);
  assert.equal(match.rulesVersion,RULESET_VERSION);
  assert.deepEqual(match.players.map(p=>p.id),[human.id]);
  assert.deepEqual(match.scores,{blue:0,orange:0});
  assert.ok(!JSON.stringify(snapshot(match)).includes("OLD BOT"));
  const injected={...human,id:"old-late-bot",name:"LATE BOT",bot:true};match.players.push(injected);
  assert.equal(snapshot(match).players.length,1,"snapshots must sanitize legacy bots even without a tick");
  removePlayer(match,human.id);advanceMatch(match,START+MATCH_DURATION*2);
  assert.equal(match.players.length,0);
});

test("all seven sectors separate real teams behind buildings with clear street exits",async t=>{
  assert.equal(LOCATIONS.length,7);
  assert.equal(new Set(LOCATIONS.map(location=>location.id)).size,7);
  for(const location of LOCATIONS)await t.test(location.name,()=>{
    const match=createMatch(START,{locationId:location.id,start:location});
    assert.equal(match.locationId,location.id);assert.equal(match.players.length,0);
    const slots=match.spawns!;
    assert.ok(slots,"room must derive spawns from its selected sector");
    const human=addPlayer(match,"OPERATOR","blue");
    for(let i=1;i<8;i++)addPlayer(match,`REAL PLAYER ${i}`);
    assert.equal(match.players.length,8);assert.ok(match.players.every(p=>!p.bot));
    assert.ok(slots.blue.some(p=>p.x===human.x&&p.z===human.z));
    assert.ok(Math.hypot(human.x-location.x,human.z-location.z)<15,"player spawned outside the chosen neighbourhood");
    for(const team of ["blue","orange"] as const){
      assert.ok(slots[team].length>=4,`${team} needs several distinct spawn slots`);
      for(const [index,point] of slots[team].entries()){
        assert.ok(isWalkable(point.x,point.z),`${team} slot ${index} is blocked`);
        assert.ok(slots[team].slice(index+1).every(other=>Math.hypot(point.x-other.x,point.z-other.z)>2.5),"spawn slots overlap");
        const probe={...human,x:point.x,y:0,z:point.z,vy:0,yaw:match.spawnYaws![team]};
        for(let frame=0;frame<20;frame++)movePlayer(match,probe,input(frame,{forward:1}),.05);
        assert.ok(Math.hypot(probe.x-point.x,probe.z-point.z)>4.5,`${team} slot ${index} faces an immediate wall`);
        assert.ok(isWalkable(probe.x,probe.z));
      }
      const teammates=match.players.filter(p=>p.team===team);
      for(const [i,p]of teammates.entries())assert.ok(teammates.slice(i+1).every(q=>Math.hypot(p.x-q.x,p.z-q.z)>=2),"real teammates spawned on top of one another");
    }
    for(const blue of slots.blue)for(const orange of slots.orange){
      const distance=Math.hypot(orange.x-blue.x,orange.z-blue.z);
      assert.ok(distance>=80&&distance<=160,`opposing spawns are ${distance}m apart`);
      const dx=(orange.x-blue.x)/distance,dz=(orange.z-blue.z)/distance;
      assert.ok(COLLIDERS.some(c=>raySolid(blue.x,1.8,blue.z,dx,0,dz,c)<distance),"opposing spawn slots have an unobstructed sightline");
    }
    const before=match.players.map(p=>({id:p.id,x:p.x,z:p.z,health:p.health,ammo:p.ammo}));
    for(let frame=1;frame<=300;frame++)advanceMatch(match,START+frame*100);
    assert.deepEqual(match.players.map(p=>({id:p.id,x:p.x,z:p.z,health:p.health,ammo:p.ammo})),before,"idle humans must not move or fight autonomously");
    assert.deepEqual(match.scores,{blue:0,orange:0});
    // Ordinary death returns a human to this sector, apart from other teammates.
    human.health=0;human.respawnAt=match.time+100;advanceMatch(match,match.time+150);
    assert.equal(human.health,100);
    assert.ok(slots.blue.some(point=>point.x===human.x&&point.z===human.z));
    assert.ok(match.players.filter(p=>p!==human&&p.team===human.team).every(p=>Math.hypot(p.x-human.x,p.z-human.z)>=2));
  });
});

test("exploration stays untimed and bot-free at every selected location",async t=>{
  for(const location of LOCATIONS)await t.test(location.name,()=>{
    const match=createMatch(START,{locationId:location.id,start:location,exploration:true});
    assert.equal(match.players.length,0,"exploration must not fill empty slots with bots");
    const player=addPlayer(match,"EXPLORER","blue");
    assert.equal(match.players.length,1);
    assert.equal(player.bot,false);
    assert.equal(match.locationId,location.id);
    assert.ok(Math.hypot(player.x-location.x,player.z-location.z)<15);
    const afterDeadline=START+MATCH_DURATION*10;
    advanceMatch(match,afterDeadline);
    assert.equal(match.winner,null);
    assert.equal(match.round,1,"exploration must not cycle through timed rounds");
    assert.equal(match.players.length,1);
    assert.equal(player.health,100);
    const before={x:player.x,z:player.z};
    applyInput(match,player.id,input(0,{forward:1,yaw:player.yaw}),afterDeadline);
    advanceMatch(match,afterDeadline+100);
    assert.ok(Math.hypot(player.x-before.x,player.z-before.z)>.4,"movement must remain active beyond the normal time limit");
    assert.ok(isWalkable(player.x,player.z));
    const copy=snapshot(match);
    assert.equal(copy.exploration,true);
    assert.equal(copy.locationId,location.id);
    assert.doesNotThrow(()=>JSON.stringify(copy));
    removePlayer(match,player.id);
    assert.equal(match.players.length,0,"leaving exploration must not create bots");
  });
});
