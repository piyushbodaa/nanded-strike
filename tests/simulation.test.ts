import test from "node:test";
import assert from "node:assert/strict";
import { addPlayer, advanceMatch, applyInput, createMatch, isWalkable, MATCH_DURATION, movePlayer, removePlayer, sanitizeInput, snapshot, type Input, type Match, type Player } from "../lib/simulation";
import { COLLIDERS, LOCATIONS, MAP_BOUNDS, SPAWNS, WAYPOINTS } from "../lib/map";
import { touchesSolid } from "../lib/geometry";
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
    const player=match.players.find(p=>p.team===team)!;
    for(const point of SPAWNS[team]){
      Object.assign(player,{x:point.x,z:point.z,y:0,vy:0,health:100});
      for(let frame=0;frame<10;frame++)movePlayer(match,player,input(frame,{forward:1}),.05);
      assert.ok(Math.hypot(player.x-point.x,player.z-point.z)>=1,`blocked forward spawn ${team} ${JSON.stringify(point)}`);
      assert.ok(isWalkable(player.x,player.z));
    }
  }
});
test("six combatants, eight-human cap, balanced four-person teams",()=>{
  const match=createMatch(START);assert.equal(match.players.length,6);assert.ok(match.players.every(p=>p.bot));
  for(let i=0;i<8;i++){addPlayer(match,`Player ${i}`,"blue");assert.equal(match.players.length,Math.max(6,i+1));}
  assert.equal(match.players.filter(p=>p.team==="blue").length,4);assert.equal(match.players.filter(p=>p.team==="orange").length,4);
  assert.throws(()=>addPlayer(match,"Ninth"),/full/);
  const departing=match.players[0].id;removePlayer(match,departing);assert.ok(!match.players.some(p=>p.id===departing));
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
  const match=createMatch(START);advanceMatch(match,START+MATCH_DURATION);assert.equal(match.winner,"draw");
  const copy=snapshot(match);copy.players[0].health=1;assert.notEqual(match.players[0].health,1);assert.doesNotThrow(()=>JSON.stringify(copy));
});
test("bots traverse the connected map and engage over a full minute",()=>{
  const match=createMatch(START),first=match.players.map(p=>({x:p.x,z:p.z}));
  for(let i=1;i<=600;i++)advanceMatch(match,START+i*100);
  assert.ok(match.scores.blue+match.scores.orange>0,"bots never scored");
  assert.ok(match.players.some((p,i)=>Math.hypot(p.x-first[i].x,p.z-first[i].z)>4));
  assert.ok(match.players.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)&&isWalkable(p.x,p.z)));
});

test("all seven practice starts produce nearby, clear spawns and playable opponents",async t=>{
  assert.equal(LOCATIONS.length,7);
  assert.equal(new Set(LOCATIONS.map(location=>location.id)).size,7);
  for(const location of LOCATIONS)await t.test(location.name,()=>{
    const match=createMatch(START,{locationId:location.id,start:location});
    assert.equal(match.locationId,location.id);
    assert.equal(match.exploration,false);
    assert.equal(match.players.length,6);
    const slots=match.spawns!;
    assert.ok(slots,"practice must derive spawns from the selected sector");
    const human=addPlayer(match,"PRACTICE","blue");
    assert.equal(match.players.filter(p=>p.bot).length,5);
    assert.ok(slots.blue.some(p=>p.x===human.x&&p.z===human.z));
    assert.ok(Math.hypot(human.x-location.x,human.z-location.z)<8,"player spawned outside the chosen neighbourhood");

    for(const team of ["blue","orange"] as const){
      assert.equal(slots[team].length,4,`${team} needs four distinct spawn slots`);
      for(const [index,point] of slots[team].entries()){
        assert.ok(isWalkable(point.x,point.z),`${team} slot ${index} is blocked`);
        assert.ok(slots[team].slice(index+1).every(other=>Math.hypot(point.x-other.x,point.z-other.z)>1.25),"spawn slots overlap");
        const probe={...human,x:point.x,y:0,z:point.z,vy:0,yaw:match.spawnYaws![team]};
        for(let frame=0;frame<10;frame++)movePlayer(match,probe,input(frame,{forward:1}),.05);
        assert.ok(Math.hypot(probe.x-point.x,probe.z-point.z)>2,`${team} slot ${index} faces an immediate wall`);
        assert.ok(isWalkable(probe.x,probe.z));
      }
    }
    for(const enemy of slots.orange){
      const distance=Math.hypot(enemy.x-location.x,enemy.z-location.z);
      assert.ok(distance>25&&distance<80,"opponents must start in this sector, not at the default sector");
    }
    const initial=match.players.map(p=>({x:p.x,z:p.z}));
    let scored=false;
    for(let frame=1;frame<=300;frame++){
      advanceMatch(match,START+frame*100);
      scored ||= match.scores.blue+match.scores.orange>0;
      assert.ok(match.players.every(p=>isWalkable(p.x,p.z)),"a combatant entered a building footprint");
    }
    assert.ok(scored,"bots could not find or engage opponents within 30 seconds");
    assert.ok(match.players.some((p,i)=>p.bot&&Math.hypot(p.x-initial[i].x,p.z-initial[i].z)>2),"bots did not leave their starting positions");

    // An ordinary death must bring the human back to this selected sector.
    match.players=[human];human.health=0;human.respawnAt=match.time+100;
    advanceMatch(match,match.time+150);
    assert.equal(human.health,100);
    assert.ok(slots.blue.some(point=>point.x===human.x&&point.z===human.z));
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
    assert.ok(Math.hypot(player.x-location.x,player.z-location.z)<8);
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
