import test from "node:test";
import assert from "node:assert/strict";
import {
  addPlayer, advanceMatch, applyInput, createMatch, CROUCH_EYE_HEIGHT, EYE_HEIGHT,
  INPUT_EXPIRY, isWalkable, KNIFE_SECONDARY, movePlayer, playerEyeHeight,
  RULESET_VERSION, sanitizeInput, snapshot, WEAPONS, type Input, type Player,
} from "../lib/simulation";
import { COLLIDERS, WAYPOINTS } from "../lib/map";
import { touchesSolid } from "../lib/geometry";

const START=1_700_000_000_000;
const OPEN=WAYPOINTS.find(point=>[-1,0,1].every(dx=>
  Array.from({length:49},(_,index)=>-6+index*.25).every(dz=>isWalkable(point.x+dx,point.z+dz))));
assert.ok(OPEN,"combat tests require an unobstructed 12-metre street");
const input=(seq:number,extra:Partial<Input>={}):Input=>({
  seq,forward:0,strafe:0,yaw:0,pitch:0,shoot:false,reload:false,sprint:false,jump:false,...extra,
});
function duel() {
  const match=createMatch(START),attacker=addPlayer(match,"ATTACKER","blue"),target=addPlayer(match,"TARGET","orange");
  Object.assign(attacker,{x:OPEN!.x,z:OPEN!.z+4,y:0,yaw:0,invulnerableUntil:0});
  Object.assign(target,{x:OPEN!.x,z:OPEN!.z-4,y:0,invulnerableUntil:0});
  return {match,attacker,target};
}

test("combat modifiers accept only literal booleans and stay serializable",()=>{
  const malformed=sanitizeInput({
    aim:1 as unknown as boolean,crouch:"true" as unknown as boolean,
    walk:[] as unknown as boolean,secondary:{} as unknown as boolean,
  });
  for(const key of ["aim","crouch","walk","secondary"] as const){
    assert.equal(malformed[key],false);
    assert.equal(sanitizeInput({[key]:true})[key],true);
    assert.equal(sanitizeInput(null)[key],false);
  }
  const {match,attacker}=duel();
  applyInput(match,attacker.id,input(0,{aim:true,crouch:true,walk:true}),START);
  const copy=snapshot(match).players.find(player=>player.id===attacker.id)!;
  assert.equal(copy.aiming,true);assert.equal(copy.crouched,true);assert.equal(copy.walking,true);
  assert.equal(copy.attackRecoveryUntil,0);assert.equal(copy.lastAttackSecondary,false);
});

test("aim, crouch and walk cap movement and take precedence over sprint",()=>{
  const {match,attacker}=duel();
  for(const [modifiers,speed] of [
    [{},4.8],[{sprint:true},7.2],[{aim:true},2.5],[{aim:true,sprint:true},2.5],
    [{crouch:true,sprint:true},2],[{walk:true,sprint:true},2.4],
    [{aim:true,crouch:true,walk:true,sprint:true},2],
  ] as const){
    Object.assign(attacker,{x:OPEN!.x,z:OPEN!.z,yaw:0});
    movePlayer(match,attacker,input(0,{forward:1,strafe:1,...modifiers}),.05);
    assert.ok(Math.abs(Math.hypot(attacker.x-OPEN!.x,attacker.z-OPEN!.z)-speed*.05)<1e-8,JSON.stringify(modifiers));
  }
  applyInput(match,attacker.id,input(0,{aim:true,sprint:true,shoot:true}),START);
  assert.equal(attacker.aiming,true);assert.equal(attacker.ammo,29,"aim must suppress sprint, allowing aimed fire");
});

test("only guns aim, switching and reload clear aim, and stale inputs release stances",()=>{
  const {match,attacker}=duel();
  applyInput(match,attacker.id,input(0,{aim:true}),START);assert.equal(attacker.aiming,true);
  applyInput(match,attacker.id,input(1,{weapon:"pistol",aim:true}),START);
  assert.equal(attacker.aiming,false,"switching must clear the old weapon's aim");
  applyInput(match,attacker.id,input(2,{weapon:"pistol",aim:true}),START);assert.equal(attacker.aiming,true);
  attacker.ammo=3;
  applyInput(match,attacker.id,input(3,{aim:true,reload:true}),START);
  assert.equal(attacker.aiming,false);assert.ok(attacker.reloadUntil>START);
  applyInput(match,attacker.id,input(4,{aim:true}),START);assert.equal(attacker.aiming,false,"reload cannot be bypassed by aiming");
  applyInput(match,attacker.id,input(5,{weapon:"knife",aim:true}),START);
  applyInput(match,attacker.id,input(6,{aim:true}),START);assert.equal(attacker.aiming,false);
  applyInput(match,attacker.id,input(7,{weapon:"rifle"}),START);
  applyInput(match,attacker.id,input(8,{aim:true,crouch:true,walk:true}),START);
  advanceMatch(match,START+INPUT_EXPIRY+20);
  assert.equal(attacker.aiming,false);assert.equal(attacker.crouched,false);assert.equal(attacker.walking,false);
});

test("crouching lowers the authoritative eye, hitbox and headshot region",()=>{
  const {match,attacker,target}=duel();
  assert.equal(playerEyeHeight(attacker),EYE_HEIGHT);
  applyInput(match,target.id,input(0,{crouch:true}),START);
  assert.equal(playerEyeHeight(target),CROUCH_EYE_HEIGHT);
  applyInput(match,attacker.id,input(0,{shoot:true}),START);
  assert.equal(target.health,100,"standing head-height fire must pass above a crouched opponent");
  applyInput(match,attacker.id,input(1),START);
  applyInput(match,attacker.id,input(2,{shoot:true,crouch:true}),START+120);
  assert.equal(target.health,32,"aim at crouched eye height must hit its lowered head region");
  assert.ok(match.events.some(event=>event.type==="shot"&&event.y===CROUCH_EYE_HEIGHT));
  assert.ok(match.events.some(event=>event.type==="hit"&&event.targetId===target.id&&event.headshot));
});

test("crouched fire uses its lower origin and hits a standing opponent's body",()=>{
  const {match,attacker,target}=duel();
  applyInput(match,attacker.id,input(0,{crouch:true,shoot:true}),START);
  assert.equal(target.health,100-WEAPONS.rifle.damage);
  assert.ok(match.events.some(event=>event.type==="hit"&&event.headshot===false));
});

test("secondary knife stab is stronger, shorter and conserves both gun magazines",()=>{
  const {match,attacker,target}=duel();target.z=attacker.z-1.5;
  applyInput(match,attacker.id,input(0,{weapon:"knife",secondary:true}),START);
  assert.equal(target.health,100-KNIFE_SECONDARY.damage);assert.equal(attacker.ammo,0);
  assert.equal(attacker.magazines.rifle.ammo,30);assert.equal(attacker.magazines.pistol.ammo,12);
  assert.equal(attacker.lastAttackSecondary,true);assert.equal(attacker.attackRecoveryUntil,START+KNIFE_SECONDARY.interval);
  assert.ok(match.events.some(event=>event.type==="melee"&&event.secondary===true));
  assert.ok(match.events.some(event=>event.type==="hit"&&event.headshot===false));
  applyInput(match,attacker.id,input(1),START);
  target.z=attacker.z-KNIFE_SECONDARY.range-.5;
  applyInput(match,attacker.id,input(2,{secondary:true}),START+KNIFE_SECONDARY.interval+1);
  assert.equal(target.health,25,"shorter stab must not reach an opponent beyond its range");
  applyInput(match,attacker.id,input(3),START+KNIFE_SECONDARY.interval+1);
  applyInput(match,attacker.id,input(4,{shoot:true}),START+KNIFE_SECONDARY.interval*2+2);
  assert.equal(target.health,0,"the longer primary slash can still reach that opponent");
});

test("stab recovery survives gun switching, primary attacks and persisted snapshots",()=>{
  const {match,attacker}=duel();
  applyInput(match,attacker.id,input(0,{weapon:"knife",secondary:true}),START);
  applyInput(match,attacker.id,input(1),START);
  const restored=snapshot(match),player=restored.players.find(p=>p.id===attacker.id)!;
  applyInput(restored,player.id,input(2,{weapon:"rifle",shoot:true}),START+WEAPONS.knife.interval+10);
  assert.equal(player.ammo,30,"switching to a faster rifle must not bypass the prior stab recovery");
  applyInput(restored,player.id,input(3),START+WEAPONS.knife.interval+10);
  applyInput(restored,player.id,input(4,{weapon:"knife",shoot:true}),START+KNIFE_SECONDARY.interval-1);
  assert.equal(restored.events.filter(event=>event.type==="melee").length,1);
  applyInput(restored,player.id,input(5),START+KNIFE_SECONDARY.interval-1);
  applyInput(restored,player.id,input(6,{weapon:"rifle",shoot:true}),START+KNIFE_SECONDARY.interval+1);
  assert.equal(player.ammo,29);assert.equal(player.lastAttackSecondary,false);
});

test("secondary input alone never fires a gun and both buttons choose one knife stab",()=>{
  const {match,attacker}=duel();
  applyInput(match,attacker.id,input(0,{secondary:true,aim:true}),START);
  advanceMatch(match,START+200);assert.equal(attacker.ammo,30);assert.equal(attacker.lastShotAt,0);
  applyInput(match,attacker.id,input(1,{weapon:"knife",secondary:true,shoot:true}),START+200);
  assert.equal(match.events.filter(event=>event.type==="melee").length,1);
  assert.equal(attacker.lastAttackSecondary,true);
  advanceMatch(match,START+INPUT_EXPIRY+500);
  assert.equal(match.events.filter(event=>event.type==="melee").length,1,"abandoned secondary fire must expire");
});

test("secondary attacks preserve friendly fire, spawn shields and solid cover",()=>{
  for(const protectedBy of ["team","shield"]){
    const {match,attacker,target}=duel();target.z=attacker.z-1.5;
    if(protectedBy==="team")target.team=attacker.team;else target.invulnerableUntil=START+2000;
    applyInput(match,attacker.id,input(0,{weapon:"knife",secondary:true}),START);
    assert.equal(target.health,100,protectedBy);
  }
  const pier=COLLIDERS.find(c=>c.h>1.8&&c.w<1.2&&touchesSolid(c.x,c.z,c)&&
    isWalkable(c.x-c.w/2-.4,c.z)&&isWalkable(c.x+c.w/2+.4,c.z));
  assert.ok(pier,"map needs a narrow pillar for the close-cover test");
  const {match,attacker,target}=duel();
  Object.assign(attacker,{x:pier.x-pier.w/2-.4,z:pier.z});
  Object.assign(target,{x:pier.x+pier.w/2+.4,z:pier.z});
  assert.ok(Math.hypot(attacker.x-target.x,attacker.z-target.z)-.38<KNIFE_SECONDARY.range);
  applyInput(match,attacker.id,input(0,{weapon:"knife",secondary:true,yaw:-Math.PI/2}),START);
  assert.equal(target.health,100);assert.ok(!match.events.some(event=>event.type==="hit"));
});

test("death and respawn clear combat stances and prohibit secondary attacks while dead",()=>{
  const {match,attacker,target}=duel();target.health=20;
  applyInput(match,target.id,input(0,{aim:true,crouch:true,walk:true}),START);
  applyInput(match,attacker.id,input(0,{shoot:true,crouch:true}),START);
  assert.equal(target.health,0);assert.equal(target.aiming,false);assert.equal(target.crouched,false);assert.equal(target.walking,false);
  const attacks=match.events.filter(event=>event.playerId===target.id&&event.type==="melee").length;
  applyInput(match,target.id,input(1,{weapon:"knife",secondary:true,crouch:true}),START+100);
  assert.equal(match.events.filter(event=>event.playerId===target.id&&event.type==="melee").length,attacks);
  assert.equal(target.crouched,false);
  advanceMatch(match,START+3100);
  assert.equal(target.health,100);assert.equal(target.aiming,false);assert.equal(target.crouched,false);assert.equal(target.walking,false);
  assert.equal(target.attackRecoveryUntil,0);assert.equal(target.lastAttackSecondary,false);
});

test("previous persisted rules migrate stances and attack recovery without changing humans",()=>{
  const {match,attacker}=duel();match.rulesVersion=RULESET_VERSION-1;
  const oldPlayer=attacker as Partial<Player>;
  delete oldPlayer.aiming;delete oldPlayer.crouched;delete oldPlayer.walking;
  delete oldPlayer.attackRecoveryUntil;delete oldPlayer.lastAttackSecondary;
  const copy=snapshot(match),player=copy.players.find(p=>p.id===attacker.id)!;
  assert.equal(copy.rulesVersion,RULESET_VERSION);assert.equal(player.name,"ATTACKER");assert.equal(player.team,"blue");
  assert.equal(player.aiming,false);assert.equal(player.crouched,false);assert.equal(player.walking,false);
  assert.equal(player.attackRecoveryUntil,0);assert.equal(player.lastAttackSecondary,false);
  assert.equal(copy.players.length,2);assert.ok(copy.players.every(p=>!p.bot));
});
