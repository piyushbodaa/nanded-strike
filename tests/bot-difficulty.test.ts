import test from 'node:test';
import assert from 'node:assert/strict';
import { BOT_DIFFICULTY_OPTIONS, DEFAULT_BOT_DIFFICULTY, normalizeBotDifficulty } from '../lib/bot-difficulty';
import { decideBot } from '../lib/bot-ai';
import {
  advanceMatch, createBotMatch, createMatch, isWalkable, playerEyeHeight, setBotDifficulty,
  shiftMatchTime, snapshot, WEAPONS, type GameEvent, type GrenadeProjectile, type Match,
} from '../lib/simulation';

const START=1_700_000_000_000;
function run(match:Match,duration:number,observe?:(events:GameEvent[])=>void) {
  const end=match.time+duration;let lastId=match.eventId;
  while(match.time<end){
    advanceMatch(match,Math.min(end,match.time+100));
    observe?.(match.events.filter(event=>event.id>lastId));lastId=match.eventId;
  }
}

test('new local games default to Beginner and explicit difficulty survives saved-state restore',()=>{
  assert.equal(DEFAULT_BOT_DIFFICULTY,'beginner');
  for(const value of [undefined,null,'',false,1,'HARD','__proto__','constructor',{}])assert.equal(normalizeBotDifficulty(value),'beginner');
  assert.equal(createBotMatch(START).match.botDifficulty,'beginner');
  assert.equal(createMatch(START,{botDifficulty:'hard'}).botDifficulty,undefined,'online-style games have no AI difficulty');
  for(const {id} of BOT_DIFFICULTY_OPTIONS){
    assert.equal(normalizeBotDifficulty(id),id);
    const {match}=createBotMatch(START,{team:'spectator',botDifficulty:id});run(match,1000);
    const restored=snapshot(match);assert.equal(restored.botDifficulty,id);
    run(match,1000);run(restored,1000);assert.deepEqual(snapshot(restored),snapshot(match));
  }
  const legacy=createBotMatch(START,{team:'spectator'}).match;delete legacy.botDifficulty;
  assert.equal(snapshot(legacy).botDifficulty,'beginner','old local saves become forgiving by default');
});

test('changing difficulty releases existing AI attacks without restarting or touching human input and equipment',()=>{
  const {match,playerId}=createBotMatch(START,{botDifficulty:'hard'});run(match,1000);
  const human=match.players.find(player=>player.id===playerId)!;
  human.intent.forward=1;human.intent.shoot=true;
  for(const bot of match.players.filter(player=>player.bot)){
    bot.intent.shoot=true;bot.intent.secondary=true;bot.aiming=true;
    Object.assign(bot.botState!,{enemyId:human.id,seenAt:match.time-1000,burstUntil:match.time+500,readyAt:match.time-500});
  }
  const before=snapshot(match),humanBefore=structuredClone(human);
  assert.equal(setBotDifficulty(match,'beginner'),true);
  assert.equal(match.botDifficulty,'beginner');assert.equal(match.time,before.time);
  assert.deepEqual(match.classic,before.classic);assert.deepEqual(match.scores,before.scores);assert.equal(match.round,before.round);
  assert.deepEqual(human,humanBefore);
  for(const bot of match.players.filter(player=>player.bot)){
    const old=before.players.find(player=>player.id===bot.id)!;
    assert.deepEqual([bot.x,bot.y,bot.z,bot.health,bot.money,bot.armor,bot.defuseKit,bot.inventory,bot.grenades,bot.magazines],
      [old.x,old.y,old.z,old.health,old.money,old.armor,old.defuseKit,old.inventory,old.grenades,old.magazines]);
    assert.equal(bot.intent.shoot,false);assert.equal(bot.intent.secondary,false);assert.equal(bot.aiming,false);
    assert.equal(bot.botState?.enemyId,undefined);assert.equal(bot.botState?.burstUntil,0);
    assert.ok(bot.nextBotShotAt>match.time,'switching while paused must grant a fresh reaction');
  }
  shiftMatchTime(match,60_000);
  for(const bot of match.players.filter(player=>player.bot))assert.ok(bot.nextBotShotAt>match.time,'a pause must not consume fresh reaction protection');
  assert.equal(match.classic!.phaseEndsAt-match.time,before.classic!.phaseEndsAt-before.time);
});

test('difficulty controls cannot modify ordinary multiplayer or exploration state',()=>{
  for(const options of [{},{exploration:true},{bots:true,exploration:true}]){
    const match=createMatch(START,options),before=structuredClone(match);
    assert.equal(setBotDifficulty(match,'hard'),false);assert.deepEqual(match,before);
  }
});

test('gentler difficulty cancels pending bot HE and flash while preserving human projectiles and smoke',()=>{
  for(const difficulty of ['beginner','easy'] as const){
    const {match,playerId}=createBotMatch(START,{botDifficulty:'hard'}),bot=match.players.find(player=>player.bot)!;
    const projectile=(id:number,kind:GrenadeProjectile['kind'],ownerId:string):GrenadeProjectile=>({
      id,kind,ownerId,team:'blue',x:bot.x,y:1,z:bot.z,vx:0,vy:0,vz:0,explodeAt:START+1000,
    });
    match.grenades=[projectile(1,'he',bot.id),projectile(2,'flash',bot.id),projectile(3,'smoke',bot.id),
      projectile(4,'he',playerId!),projectile(5,'flash',playerId!)];
    setBotDifficulty(match,difficulty);
    assert.deepEqual(match.grenades.map(grenade=>grenade.id),[3,4,5]);
    shiftMatchTime(match,60_000);
    assert.ok(match.grenades.every(grenade=>grenade.explodeAt-match.time===1000));
  }
});

test('Beginner and Easy do not throw retained attack grenades even after full reaction time',()=>{
  for(const difficulty of ['beginner','easy'] as const){
    const {match,playerId}=createBotMatch(START,{mode:'deathmatch',botDifficulty:'hard'});
    const human=match.players.find(player=>player.id===playerId)!,bot=match.players.find(player=>player.bot&&player.team!==human.team)!;
    match.players=[human,bot];Object.assign(bot,{x:0,z:0,yaw:0});Object.assign(human,{x:0,z:-15});
    bot.grenades={he:1,flash:1,smoke:0};setBotDifficulty(match,difficulty);
    const context={random:()=>.5,canSee:()=>true,canBuy:false,eyeHeight:playerEyeHeight,weapons:WEAPONS};
    for(let elapsed=0;elapsed<=15_000;elapsed+=200){
      match.time=START+elapsed;const input=decideBot(match,bot,context);
      assert.equal(input.grenade,undefined);bot.yaw=input.yaw;bot.pitch=input.pitch;
    }
    assert.deepEqual(bot.grenades,{he:1,flash:1,smoke:0},'changing difficulty preserves paid-for inventory');
  }
});

test('Beginner teams still navigate real streets, plant, defuse and finish rounds autonomously',()=>{
  const {match}=createBotMatch(START,{team:'spectator',locationId:'bhagya'});
  const counts:Partial<Record<GameEvent['type'],number>>={};
  run(match,500_000,events=>{
    for(const event of events){
      counts[event.type]=(counts[event.type]??0)+1;
      if(event.type==='grenade')assert.match(event.text??'',/smoke/i,'Beginner may use objective smoke but never HE or flash');
    }
    for(const player of match.players)assert.ok(isWalkable(player.x,player.z),'navigation must stay outside mapped buildings');
  });
  assert.ok(match.round>1);assert.ok((counts.plant??0)>0);assert.ok((counts.defuse??0)>0);
  assert.ok((counts.shot??0)>0);assert.ok((counts.kill??0)>0);assert.ok((counts.purchase??0)>0);
  assert.equal(match.botDifficulty,'beginner');
});
