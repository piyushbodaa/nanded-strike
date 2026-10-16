import test from 'node:test';
import assert from 'node:assert/strict';
import { BOT_DIFFICULTIES, type BotDifficulty } from '../lib/bot-difficulty';
import { botLineWalkable } from '../lib/bot-navigation';
import { addBot, addPlayer, advanceMatch, createMatch, type Player } from '../lib/simulation';

const START=1_700_000_000_000;
const levels:BotDifficulty[]=['beginner','easy','normal','hard'];
function encounter(difficulty:BotDifficulty,locationId='bhagya',seed=2654435761) {
  const match=createMatch(START,{bots:true,locationId,botDifficulty:difficulty});
  const human=addPlayer(match,'DAMAGE PROBE','orange'),bot=addBot(match,'AI','blue');match.seed=seed;
  const origin=match.spawns!.blue[0];let target:{x:number;z:number}|undefined;
  for(let index=0;index<72;index++){
    const angle=index*Math.PI/36,point={x:origin.x+Math.cos(angle)*20,z:origin.z+Math.sin(angle)*20};
    if(botLineWalkable(origin,point)){target=point;break;}
  }
  assert.ok(target,`${locationId} needs a collision-free 20 m street lane`);
  // Keep the measurement target alive so respawning cannot distort cadence or
  // aim. Crossing 100 cumulative damage records an ordinary unarmored death.
  Object.assign(human,target,{health:10_000,invulnerableUntil:0});
  Object.assign(bot,origin,{invulnerableUntil:0,yaw:Math.atan2(-(target.x-origin.x),-(target.z-origin.z)),inventory:['rifle'],weapon:'rifle'});
  return {match,human,bot};
}
function botShots(match:ReturnType<typeof createMatch>,bot:Player) {
  return match.events.filter(event=>event.playerId===bot.id&&event.type==='shot');
}
function sample(difficulty:BotDifficulty,locationId:string,seed:number) {
  const {match,human,bot}=encounter(difficulty,locationId,seed);
  let firstShot=Infinity,timeTo100=Infinity,damageAt2s=0,damageAt5s=0,shots=0,lastEvent=match.eventId;
  for(let elapsed=50;elapsed<=15_000;elapsed+=50){
    advanceMatch(match,START+elapsed);
    const recent=botShots(match,bot).filter(event=>event.id>lastEvent);lastEvent=match.eventId;shots+=recent.length;
    if(recent.length)firstShot=Math.min(firstShot,recent[0].time-START);
    const damage=10_000-human.health;
    if(damage>=100)timeTo100=Math.min(timeTo100,elapsed);
    if(elapsed===2000)damageAt2s=damage;if(elapsed===5000)damageAt5s=damage;
  }
  return {firstShot,timeTo100,damageAt2s,damageAt5s,damageAt15s:10_000-human.health,shots};
}
const mean=(values:number[])=>values.reduce((sum,value)=>sum+value,0)/values.length;
const median=(values:number[])=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];

test('seeded street encounters give Beginner breathing room and progressively stronger opponents',context=>{
  const measurements=Object.fromEntries(levels.map(level=>[level,[] as ReturnType<typeof sample>[]])) as Record<BotDifficulty,ReturnType<typeof sample>[]>;
  for(const level of levels)for(const locationId of ['bhagya','shrinagar','iib'])for(let index=1;index<=12;index++)
    measurements[level].push(sample(level,locationId,(index*2654435761)>>>0));
  for(const level of levels){
    const rows=measurements[level];
    assert.ok(rows.every(row=>row.firstShot>=BOT_DIFFICULTIES[level].reactionMinMs),`${level} shot before its reaction floor`);
    assert.ok(rows.every(row=>Number.isFinite(row.firstShot)),`${level} never engaged an unobstructed target`);
    context.diagnostic(JSON.stringify({level,encounters:rows.length,firstShotMedianMs:Math.round(median(rows.map(row=>row.firstShot))),
      firstShotRangeMs:[Math.round(Math.min(...rows.map(row=>row.firstShot))),Math.round(Math.max(...rows.map(row=>row.firstShot)))],
      averageDamageAt2s:+mean(rows.map(row=>row.damageAt2s)).toFixed(2),averageDamageAt5s:+mean(rows.map(row=>row.damageAt5s)).toFixed(2),
      averageDamageAt15s:+mean(rows.map(row=>row.damageAt15s)).toFixed(2),averageShotsAt15s:+mean(rows.map(row=>row.shots)).toFixed(2),
      timeTo100DamageMedianMs:Number.isFinite(median(rows.map(row=>row.timeTo100)))?median(rows.map(row=>row.timeTo100)):null,
      encountersReaching100Damage:rows.filter(row=>Number.isFinite(row.timeTo100)).length}));
  }
  assert.ok(measurements.beginner.every(row=>row.damageAt2s===0),'Beginner must give a visible reaction window');
  assert.ok(mean(measurements.beginner.map(row=>row.damageAt15s))<mean(measurements.hard.map(row=>row.damageAt15s))*.2);
  assert.ok(median(measurements.beginner.map(row=>row.firstShot))>median(measurements.hard.map(row=>row.firstShot))+1500);
  for(let index=1;index<levels.length;index++){
    const easier=measurements[levels[index-1]],harder=measurements[levels[index]];
    assert.ok(mean(easier.map(row=>row.damageAt15s))<mean(harder.map(row=>row.damageAt15s)),`${levels[index]} should be measurably stronger`);
    assert.ok(mean(easier.map(row=>row.shots))<mean(harder.map(row=>row.shots)),`${levels[index]} should fire more often`);
  }
});

test('actual-map perception respects facing and Beginner has a narrower awareness cone',()=>{
  for(const level of levels){
    const {match,human,bot}=encounter(level);bot.yaw+=Math.PI;
    advanceMatch(match,START+1);
    assert.notEqual(bot.botState?.enemyId,human.id,`${level} acquired an unseen enemy directly behind it`);
    assert.equal(botShots(match,bot).length,0);
  }
  for(const level of ['beginner','hard'] as const){
    const {match,human,bot}=encounter(level);bot.yaw+=80*Math.PI/180;
    advanceMatch(match,START+1);
    assert.equal(bot.botState?.enemyId===human.id,level==='hard',`${level} did not respect its field of view`);
  }
});

test('smoke breaks a live burst immediately and a peek needs a fresh reaction',()=>{
  for(const level of ['beginner','hard'] as const){
    const {match,human,bot}=encounter(level);
    while(!botShots(match,bot).length&&match.time<START+10_000)advanceMatch(match,match.time+25);
    assert.ok(botShots(match,bot).length);
    const firstId=match.eventId;
    match.smokes.push({id:10000,x:(human.x+bot.x)/2,y:1,z:(human.z+bot.z)/2,radius:4,expiresAt:match.time+10_000});
    const hiddenAt=match.time;
    // A brief peek interrupts firing before the next navigation decision can
    // turn the bot away; reacquisition must still pay a fresh reaction cost.
    while(match.time<hiddenAt+100)advanceMatch(match,Math.min(hiddenAt+100,match.time+25));
    assert.equal(botShots(match,bot).filter(event=>event.id>firstId).length,0,`${level} retained fire through smoke`);
    match.smokes=[];const visibleAt=match.time;
    while(botShots(match,bot).every(event=>event.id<=firstId)&&match.time<visibleAt+10_000)advanceMatch(match,match.time+25);
    const reacquired=botShots(match,bot).find(event=>event.id>firstId);assert.ok(reacquired);
    assert.ok(reacquired.time-visibleAt>=BOT_DIFFICULTIES[level].reactionMinMs,`${level} bypassed fresh reaction after cover`);
  }
});

test('Beginner damage assistance is isolated to local bot attacks on humans',()=>{
  const damage=(local:boolean,attackerBot:boolean,targetBot:boolean)=>{
    const {match,human,bot}=encounter('beginner');
    match.bots=local;bot.bot=attackerBot;human.bot=targetBot;
    bot.botDecisionAt=Infinity;human.botDecisionAt=Infinity;
    bot.botState=undefined;human.botState=undefined;
    bot.intent={seq:0,forward:0,strafe:0,yaw:bot.yaw,pitch:Math.atan2(1.06-1.58,20),shoot:true,reload:false,sprint:false,jump:false};
    bot.pitch=bot.intent.pitch;bot.lastInputAt=START;
    advanceMatch(match,START+1);
    return 10_000-human.health;
  };
  assert.ok(Math.abs(damage(true,true,false)-10.2)<.001);
  assert.equal(damage(true,true,true),34,'bot vs bot damage must remain standard');
  assert.equal(damage(true,false,true),34,'human attacks on bots must remain standard');
  assert.equal(damage(true,false,false),34,'human vs human damage must remain standard');
  assert.equal(damage(false,false,false),34,'online-style human multiplayer must remain standard');
});
