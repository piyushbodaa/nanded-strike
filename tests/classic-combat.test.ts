import test from "node:test";
import assert from "node:assert/strict";
import {
  addPlayer, advanceMatch, applyInput, BOMB_TIME, canBuy, CLASSIC_FREEZE_TIME, CLASSIC_ROUND_TIME,
  CLASSIC_TARGET_SCORE, createMatch, DEFUSE_TIME, isWalkable, KIT_DEFUSE_TIME, movePlayer,
  PLANT_TIME, PURCHASES, removePlayer, RULESET_VERSION, sanitizeInput, snapshot, WEAPONS,
  type GrenadeProjectile, type Input, type Match, type Player, type Weapon,
} from "../lib/simulation";
import {COLLIDERS, LOCATIONS, WAYPOINTS} from "../lib/map";
import {touchesSolid} from "../lib/geometry";

const START=1_700_000_000_000;
const OPEN=WAYPOINTS.find(point=>[-1,0,1].every(dx=>
  Array.from({length:49},(_,index)=>-6+index*.25).every(dz=>isWalkable(point.x+dx,point.z+dz))));
assert.ok(OPEN);
const WALL=COLLIDERS.find(c=>c.h>3&&c.w>5&&c.d>5&&c.d<20&&touchesSolid(c.x,c.z,c)&&
  isWalkable(c.x,c.z+c.d/2+2)&&isWalkable(c.x,c.z-c.d/2-2));
assert.ok(WALL);
function input(seq:number,extra:Partial<Input>={}):Input {
  return {seq,forward:0,strafe:0,yaw:0,pitch:0,shoot:false,reload:false,sprint:false,jump:false,...extra};
}
function send(match:Match,player:Player,extra:Partial<Input>={},time=match.time) {
  applyInput(match,player.id,input(player.lastSeq+1,extra),time);
}
function classic(live=false) {
  const match=createMatch(START,{mode:"classic"}),blue=addPlayer(match,"DEFENDER","blue"),orange=addPlayer(match,"ATTACKER","orange");
  if(live)advanceMatch(match,START+CLASSIC_FREEZE_TIME+1);
  return {match,blue,orange};
}
function hold(match:Match,player:Player,duration:number,extra:Partial<Input>={}) {
  const end=match.time+duration;send(match,player,extra);
  while(match.time<end)send(match,player,extra,Math.min(end,match.time+100));
}
const bombAction=(match:Match)=>match.classic!.bomb.action;
function placeDuel(blue:Player,orange:Player) {
  Object.assign(blue,{x:OPEN!.x,z:OPEN!.z+4,y:0,yaw:0,invulnerableUntil:0});
  Object.assign(orange,{x:OPEN!.x,z:OPEN!.z-4,y:0,yaw:Math.PI,invulnerableUntil:0});
}
function injectGrenade(match:Match,owner:Player,kind:GrenadeProjectile["kind"],x:number,z:number,y=1) {
  match.grenades.push({id:++match.eventId,kind,ownerId:owner.id,team:owner.team,x,y,z,vx:0,vy:0,vz:0,explodeAt:match.time+1});
  advanceMatch(match,match.time+2);
}

test("classic waits for both real teams, freezes movement and fire, and starts on its authoritative deadline",()=>{
  const match=createMatch(START,{mode:"classic"}),blue=addPlayer(match,"BLUE","blue");
  assert.equal(match.mode,"classic");assert.equal(match.classic?.phase,"waiting");
  assert.deepEqual(blue.inventory,["pistol","knife"]);assert.equal(blue.money,800);
  const waiting={x:blue.x,z:blue.z};movePlayer(match,blue,input(0,{forward:1}),.05);
  assert.deepEqual({x:blue.x,z:blue.z},waiting);assert.equal(canBuy(match,blue),false);
  addPlayer(match,"ORANGE","orange");assert.equal(match.classic?.phase,"freeze");
  assert.equal(canBuy(match,blue),true);assert.equal(match.endsAt,START+CLASSIC_FREEZE_TIME);
  const before={x:blue.x,z:blue.z,ammo:blue.ammo};send(match,blue,{forward:1,shoot:true,aim:true});
  advanceMatch(match,START+1000);assert.deepEqual({x:blue.x,z:blue.z,ammo:blue.ammo},before);
  advanceMatch(match,START+CLASSIC_FREEZE_TIME+1000);
  assert.equal(match.classic?.phase,"live");assert.equal(match.endsAt,START+CLASSIC_FREEZE_TIME+CLASSIC_ROUND_TIME);
  assert.equal(canBuy(match,blue),false);
  assert.equal(match.players.length,2);assert.ok(match.players.every(player=>!player.bot));
});

test("all classic bomb sites use distinct walkable source waypoints in every sector",()=>{
  for(const location of LOCATIONS){
    const match=createMatch(START,{mode:"classic",locationId:location.id}),sites=match.classic!.sites;
    assert.equal(sites.length,2);
    assert.ok(Math.hypot(sites[0].x-sites[1].x,sites[0].z-sites[1].z)>50,location.id);
    for(const site of sites){assert.ok(isWalkable(site.x,site.z));assert.ok(WAYPOINTS.some(point=>point.x===site.x&&point.z===site.z));}
  }
});

test("purchases enforce funds, spawn zone, inventory limits, team roles and sequence replay",()=>{
  const {match,blue,orange}=classic();
  send(match,blue,{buy:"sniper"});assert.equal(blue.money,800);assert.ok(!blue.inventory.includes("sniper"));
  assert.ok(match.events.some(event=>event.type==="notice"&&event.playerId===blue.id&&event.text?.includes("$4750")));
  send(match,blue,{buy:"kit"});assert.equal(blue.money,400);assert.equal(blue.defuseKit,true);
  const seq=blue.lastSeq;applyInput(match,blue.id,input(seq,{buy:"smoke"}),match.time);assert.equal(blue.grenades.smoke,0);assert.equal(blue.money,400);
  send(match,blue,{buy:"kit"});assert.equal(blue.money,400);
  send(match,orange,{buy:"kit"});assert.equal(orange.defuseKit,false);assert.equal(orange.money,800);
  blue.money=16_000;
  for(const weapon of ["rifle","smg","shotgun","sniper"] as const){
    send(match,blue,{buy:weapon});assert.equal(blue.weapon,weapon);assert.deepEqual(new Set(blue.inventory),new Set(["pistol","knife",weapon]));
    assert.equal(blue.ammo,WEAPONS[weapon].magazine);
  }
  const spent=blue.money;send(match,blue,{buy:"sniper"});assert.equal(blue.money,spent);
  blue.money=5000;send(match,blue,{buy:"armor"});assert.equal(blue.armor,100);assert.equal(blue.money,4000);
  send(match,blue,{buy:"armor"});assert.equal(blue.money,4000);
  for(const buy of ["he","flash","flash","smoke"] as const)send(match,blue,{buy});
  assert.deepEqual(blue.grenades,{he:1,flash:2,smoke:1});
  const afterGrenades=blue.money;send(match,blue,{buy:"flash"});assert.equal(blue.money,afterGrenades);
  Object.assign(blue,{x:match.spawns!.orange[0].x,z:match.spawns!.orange[0].z});assert.equal(canBuy(match,blue),false);
  send(match,blue,{buy:"rifle"});assert.equal(blue.money,afterGrenades);
});

test("unowned weapons and malformed purchase or utility inputs never grant equipment",()=>{
  const {match,blue}=classic();send(match,blue,{weapon:"sniper"});assert.equal(blue.weapon,"pistol");
  const clean=sanitizeInput({buy:"__proto__" as Input["buy"],weapon:"constructor" as Weapon,grenade:"rocket" as Input["grenade"],interact:1 as unknown as boolean});
  assert.equal(clean.buy,undefined);assert.equal(clean.weapon,undefined);assert.equal(clean.grenade,undefined);assert.equal(clean.interact,false);
  send(match,blue,{grenade:"he"});assert.equal(match.grenades.length,0);assert.equal(blue.grenades.he,0);
});

test("classic kills award frags and money but round wins alone change the team score",()=>{
  const {match,blue,orange}=classic(true);placeDuel(blue,orange);
  const reserve=addPlayer(match,"LATE RESERVE","orange");reserve.health=100;
  Object.assign(reserve,{x:orange.x+10,z:orange.z});orange.health=20;
  send(match,blue,{shoot:true});assert.equal(orange.health,0);assert.equal(blue.kills,1);assert.equal(blue.money,1100);
  assert.deepEqual(match.scores,{blue:0,orange:0});assert.equal(match.classic?.phase,"live");
  advanceMatch(match,match.time+3100);assert.equal(orange.health,0,"dead humans must not respawn during the round");
  send(match,orange,{shoot:true,grenade:"he"});assert.equal(orange.health,0);
  reserve.health=0;advanceMatch(match,match.time+1);
  assert.deepEqual(match.scores,{blue:1,orange:0});assert.equal(match.classic?.phase,"over");
  assert.equal(blue.money,4350);assert.equal(orange.money,2200);
});

test("late joiners spectate until the next round, survivors keep gear and dead players reset",()=>{
  const {match,blue,orange}=classic();blue.money=5000;send(match,blue,{buy:"rifle"});send(match,blue,{buy:"armor"});send(match,blue,{buy:"kit"});
  const late=addPlayer(match,"LATE","blue");assert.equal(late.health,0);
  advanceMatch(match,START+CLASSIC_FREEZE_TIME+1);orange.health=0;advanceMatch(match,match.time+1);
  assert.equal(match.classic?.phase,"over");advanceMatch(match,match.classic!.phaseEndsAt+1);
  assert.equal(match.round,2);assert.equal(match.classic?.phase,"freeze");assert.equal(late.health,100);
  assert.ok(blue.inventory.includes("rifle"));assert.equal(blue.armor,100);assert.equal(blue.defuseKit,true);
  assert.deepEqual(orange.inventory,["pistol","knife"]);assert.equal(orange.armor,0);assert.equal(orange.defuseKit,false);
});

test("planting requires held interaction at a site and cancels on release, movement or switching",()=>{
  const {match,orange}=classic(true),site=match.classic!.sites[0];
  send(match,orange,{interact:true});assert.equal(match.classic!.bomb.action,undefined,"spawn is not a site");
  Object.assign(orange,{x:site.x,z:site.z});hold(match,orange,1000,{interact:true,weapon:"pistol"});
  assert.equal(bombAction(match)?.type,"plant");send(match,orange,{interact:false});assert.equal(match.classic!.bomb.action,undefined);
  hold(match,orange,1000,{interact:true});orange.x+=.6;advanceMatch(match,match.time+1);
  const restartedAction=bombAction(match);
  assert.ok(!restartedAction||restartedAction.startedAt>=match.time-1,"movement must restart plant progress");
  send(match,orange,{interact:true,weapon:"knife"});assert.equal(match.classic!.bomb.action,undefined);
  Object.assign(orange,{x:site.x,z:site.z});hold(match,orange,PLANT_TIME+20,{interact:true,weapon:"knife"});
  assert.equal(match.classic!.bomb.status,"planted");assert.equal(match.classic!.bomb.siteId,"A");
  assert.ok(Math.abs(match.classic!.bomb.explodeAt-match.time-BOMB_TIME)<50);assert.equal(orange.money,1100);
});

test("stale interaction cannot plant; dropped bomb can be collected only by a nearby attacker",()=>{
  const {match,blue,orange}=classic(true),site=match.classic!.sites[0];
  Object.assign(orange,{x:site.x,z:site.z});send(match,orange,{interact:true});advanceMatch(match,match.time+PLANT_TIME+100);
  assert.equal(match.classic!.bomb.status,"carried");assert.equal(match.classic!.bomb.action,undefined);
  const collector=addPlayer(match,"COLLECTOR","orange");collector.health=100;Object.assign(collector,{x:site.x,z:site.z});
  removePlayer(match,orange.id);assert.equal(match.classic!.bomb.status,"dropped");
  Object.assign(blue,{x:site.x,z:site.z});send(match,blue,{interact:true});assert.equal(match.classic!.bomb.status,"dropped");
  send(match,collector,{interact:true});assert.equal(match.classic!.bomb.carrierId,collector.id);
});

for(const kit of [false,true])test(`defusing requires ${kit?5:10} seconds of held interaction${kit?" with a kit":""} and awards defenders`,()=>{
  const {match,blue,orange}=classic(true),site=match.classic!.sites[0];
  Object.assign(orange,{x:site.x,z:site.z});hold(match,orange,PLANT_TIME+20,{interact:true});
  send(match,orange,{});Object.assign(blue,{x:site.x,z:site.z,defuseKit:kit});
  const duration=kit?KIT_DEFUSE_TIME:DEFUSE_TIME;
  hold(match,blue,duration-100,{interact:true});assert.equal(match.classic!.bomb.status,"planted");
  hold(match,blue,150,{interact:true});assert.equal(match.classic!.bomb.status,"defused");
  assert.equal(match.classic!.phase,"over");assert.equal(match.scores.blue,1);assert.equal(blue.money,4350);
});

test("planting keeps the round live after attacker elimination; explosion and deadline resolve once",()=>{
  const {match,blue,orange}=classic(true),site=match.classic!.sites[0];
  Object.assign(orange,{x:site.x,z:site.z});hold(match,orange,PLANT_TIME+20,{interact:true});
  orange.health=0;Object.assign(blue,{x:match.spawns!.blue[0].x,z:match.spawns!.blue[0].z});
  advanceMatch(match,match.time+1);assert.equal(match.classic!.phase,"live");
  advanceMatch(match,match.classic!.bomb.explodeAt+1);
  assert.equal(match.classic!.bomb.status,"exploded");assert.equal(match.classic!.phase,"over");assert.equal(match.scores.orange,1);
  advanceMatch(match,match.time+100);assert.equal(match.scores.orange,1);
  const other=classic(true);advanceMatch(other.match,other.match.classic!.phaseEndsAt+1);
  assert.equal(other.match.classic!.roundWinner,"blue");assert.equal(other.match.classic!.reason,"Time expired");
});

test("a plant cannot complete after the round deadline when polling resumes late",()=>{
  const {match,orange}=classic(true),site=match.classic!.sites[0],deadline=match.classic!.phaseEndsAt;
  Object.assign(orange,{x:site.x,z:site.z});
  send(match,orange,{interact:true},deadline-PLANT_TIME+100);
  assert.equal(match.classic!.bomb.action,undefined,"there is no time left to complete a plant");
  // An old serialized in-progress action must also respect the round's original deadline.
  match.classic!.bomb.action={type:"plant",playerId:orange.id,startedAt:deadline-1000,completesAt:deadline+2000,x:orange.x,z:orange.z};
  orange.lastInputAt=deadline+1900;
  advanceMatch(match,deadline+2100);
  assert.equal(match.classic!.bomb.status,"carried");assert.equal(match.classic!.roundWinner,"blue");
});

test("round economy bounds money and increases the losing team's compensation",()=>{
  const {match,blue,orange}=classic(true);blue.money=15_900;orange.money=0;orange.health=0;
  advanceMatch(match,match.time+1);assert.equal(blue.money,16_000);assert.equal(orange.money,1400);
  advanceMatch(match,match.classic!.phaseEndsAt+1);advanceMatch(match,match.classic!.phaseEndsAt+1);
  orange.health=0;advanceMatch(match,match.time+1);assert.equal(blue.money,16_000);assert.equal(orange.money,3300);
});

test("bomb pickup and defuse cannot cross a solid wall",()=>{
  const pier=COLLIDERS.find(c=>c.h>1.8&&c.w<1.2&&touchesSolid(c.x,c.z,c)&&isWalkable(c.x-c.w/2-.4,c.z)&&isWalkable(c.x+c.w/2+.4,c.z));assert.ok(pier);
  const {match,blue,orange}=classic(true),bomb=match.classic!.bomb;
  Object.assign(bomb,{status:"planted",carrierId:undefined,x:pier.x+pier.w/2+.4,z:pier.z,explodeAt:match.time+BOMB_TIME});
  Object.assign(blue,{x:pier.x-pier.w/2-.4,z:pier.z});send(match,blue,{interact:true});assert.equal(bomb.action,undefined);
  bomb.status="dropped";Object.assign(orange,{x:blue.x,z:blue.z});send(match,orange,{interact:true});assert.equal(bomb.status,"dropped");
});

test("HE has distance falloff, team protection and wall occlusion; flash respects facing and cover",()=>{
  const {match,blue,orange}=classic(true);placeDuel(blue,orange);
  injectGrenade(match,blue,"he",orange.x,orange.z+1);assert.ok(orange.health<100);assert.equal(blue.health,100);
  const pier=COLLIDERS.find(c=>c.h>1.8&&c.w<1.2&&touchesSolid(c.x,c.z,c)&&isWalkable(c.x-c.w/2-.4,c.z)&&isWalkable(c.x+c.w/2+.4,c.z));assert.ok(pier);
  orange.health=100;Object.assign(blue,{x:pier.x-pier.w/2-.4,z:pier.z});Object.assign(orange,{x:pier.x+pier.w/2+.4,z:pier.z});
  assert.ok(Math.hypot(blue.x-orange.x,blue.z-orange.z)<3,"cover fixture must be well within grenade range");
  injectGrenade(match,blue,"he",blue.x,blue.z);assert.equal(orange.health,100);
  injectGrenade(match,blue,"flash",blue.x,blue.z);assert.equal(orange.flashedUntil,0);
  placeDuel(blue,orange);orange.yaw=Math.PI;
  injectGrenade(match,blue,"flash",orange.x,orange.z+2);const front=orange.flashedUntil-match.time;
  orange.flashedUntil=0;orange.yaw=0;injectGrenade(match,blue,"flash",orange.x,orange.z+2);const back=orange.flashedUntil-match.time;
  assert.ok(front>back*2);assert.ok(back>0);
});

test("grenades consume purchased inventory once, bounce off cover and persist smoke with an expiry",()=>{
  const {match,blue}=classic();send(match,blue,{buy:"smoke"});advanceMatch(match,START+CLASSIC_FREEZE_TIME+1);
  Object.assign(blue,{x:WALL!.x,z:WALL!.z+WALL!.d/2+2,yaw:0,pitch:0});send(match,blue,{grenade:"smoke"});
  assert.equal(blue.grenades.smoke,0);assert.equal(match.grenades.length,1);
  const seq=blue.lastSeq;applyInput(match,blue.id,input(seq,{grenade:"smoke"}),match.time);assert.equal(match.grenades.length,1);
  for(let tick=0;tick<17;tick++)advanceMatch(match,match.time+100);
  assert.equal(match.grenades.length,0);assert.equal(match.smokes.length,1);
  assert.ok(match.smokes[0].z>WALL!.z,"grenade must not pass through the building");
  const restored=snapshot(match);assert.deepEqual(restored.smokes,match.smokes);
  advanceMatch(restored,restored.smokes[0].expiresAt+1);assert.equal(restored.smokes.length,0);
});

test("armor absorbs finite damage, shotgun fires eight pellets, and recoil is serialized and recovers",()=>{
  const {match,blue,orange}=classic(true);placeDuel(blue,orange);orange.armor=100;
  send(match,blue,{shoot:true});assert.ok(orange.health>46&&orange.health<100);assert.ok(orange.armor<100);
  send(match,blue,{});send(match,blue,{shoot:true},match.time+300);assert.equal(blue.shotsInBurst,1);
  assert.equal(snapshot(match).players.find(player=>player.id===blue.id)!.shotsInBurst,1);
  send(match,blue,{});send(match,blue,{shoot:true},match.time+500);assert.equal(blue.shotsInBurst,0);
  const sandbox=createMatch(START),shooter=addPlayer(sandbox,"SHOTGUN");Object.assign(shooter,{x:OPEN!.x,z:OPEN!.z});
  send(sandbox,shooter,{weapon:"shotgun",shoot:true});
  assert.equal(sandbox.events.filter(event=>event.type==="shot"&&event.weapon==="shotgun").length,8);assert.equal(shooter.ammo,7);
});

test("halftime swaps once after six rounds and final victory restarts a classic match",()=>{
  const {match,blue,orange}=classic(true);
  for(let round=1;round<=6;round++){
    orange.health=0;advanceMatch(match,match.time+1);assert.equal(match.classic!.phase,"over");
    advanceMatch(match,match.classic!.phaseEndsAt+1);
    if(round<6)advanceMatch(match,match.classic!.phaseEndsAt+1);
  }
  assert.equal(match.round,7);assert.equal(blue.team,"orange");assert.equal(orange.team,"blue");
  assert.equal(match.scores.orange,6);assert.equal(match.scores.blue,0);assert.equal(blue.money,800);
  removePlayer(match,orange.id);advanceMatch(match,match.time+1);assert.equal(match.classic!.phase,"waiting");
  addPlayer(match,"REJOINED DEFENDER","blue");assert.equal(blue.team,"orange","restarting round7 freeze must not swap twice");
  assert.equal(match.classic!.sidesSwitched,true);
  advanceMatch(match,match.classic!.phaseEndsAt+1);
  for(const player of match.players)if(player.team==="blue")player.health=0;
  advanceMatch(match,match.time+1);assert.equal(match.scores.orange,CLASSIC_TARGET_SCORE);assert.equal(match.winner,"orange");
  advanceMatch(match,match.winnerAt+7001);assert.equal(match.mode,"classic");assert.equal(match.winner,null);assert.equal(match.round,1);
  assert.deepEqual(match.scores,{blue:0,orange:0});assert.ok(match.players.every(player=>player.money===800));
});

test("classic migration keeps human identity and mode while rebuilding deterministic serializable state",()=>{
  const {match,blue}=classic();match.rulesVersion=RULESET_VERSION-1;blue.money=8000;
  const persisted=snapshot(match);assert.equal(persisted.mode,"classic");assert.equal(persisted.rulesVersion,RULESET_VERSION);
  assert.equal(persisted.players.find(player=>player.id===blue.id)?.money,800);
  assert.equal(persisted.classic?.phase,"freeze");assert.equal(persisted.classic?.sites.length,2);
  const restored=JSON.parse(JSON.stringify(persisted)) as Match;
  advanceMatch(persisted,START+CLASSIC_FREEZE_TIME+1);advanceMatch(restored,START+CLASSIC_FREEZE_TIME+1);
  assert.deepEqual(restored,persisted);
  assert.equal(PURCHASES.sniper.price,4750);
});
