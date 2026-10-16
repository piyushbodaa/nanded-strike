import test from 'node:test';
import assert from 'node:assert/strict';
import { LOCATIONS } from '../lib/map';
import {
  addBot, addPlayer, advanceMatch, applyInput, createBotMatch, createMatch, fillBotTeams,
  isWalkable, shiftMatchTime, snapshot, type GameEvent, type Match, type Team,
} from '../lib/simulation';

const START=1_700_000_000_000;
function run(match:Match,duration:number,observe?:(events:GameEvent[])=>void,checkMovement=false) {
  const end=match.time+duration;let lastEvent=match.eventId;
  while(match.time<end){
    const before=checkMovement?new Map(match.players.map(player=>[player.id,{x:player.x,z:player.z,health:player.health}])):undefined;
    advanceMatch(match,Math.min(end,match.time+100));
    const events=match.events.filter(event=>event.id>lastEvent);lastEvent=match.eventId;observe?.(events);
    if(checkMovement)for(const player of match.players){
      assert.ok(isWalkable(player.x,player.z),`${player.name} entered a mapped building in ${match.locationId}`);
      const old=before?.get(player.id);
      if(old&&old.health>0&&player.health>0&&!events.some(event=>event.type==='respawn'&&event.playerId===player.id)){
        assert.ok(Math.hypot(player.x-old.x,player.z-old.z)<=.721,`${player.name} exceeded ordinary movement speed`);
      }
    }
  }
}

test('bots require explicit local opt-in and never populate ordinary exploration or online-style matches',()=>{
  for(const options of [{},{bots:false},{bots:true,exploration:true}]){
    const match=createMatch(START,options);addPlayer(match,'HUMAN');
    assert.throws(()=>addBot(match,'BOT','orange'),/local bot match/);
    assert.throws(()=>fillBotTeams(match),/local bot match/);
    run(match,1000);assert.equal(match.players.length,1);assert.equal(match.players[0].bot,false);
  }
  const ordinary=createMatch(START),human=addPlayer(ordinary,'KEEP'),injected={...human,id:'legacy-bot',name:'LEGACY BOT',bot:true};
  ordinary.players.push(injected);assert.equal(snapshot(ordinary).players.length,1);
  assert.equal(ordinary.players[0].id,human.id);
});

test('CT and T local games fill exactly four players per side; watching adds no fake human',()=>{
  for(const mode of ['classic','deathmatch'] as const)for(const team of ['blue','orange','spectator'] as const){
    const {match,playerId}=createBotMatch(START,{name:'BOSS',team,mode});
    assert.equal(match.bots,true);assert.equal(match.mode,mode);assert.equal(match.players.length,8);
    for(const side of ['blue','orange'] as const)assert.equal(match.players.filter(player=>player.team===side).length,4);
    assert.equal(match.players.filter(player=>player.bot).length,team==='spectator'?8:7);
    if(team==='spectator')assert.equal(playerId,null);
    else{const human=match.players.find(player=>player.id===playerId)!;assert.equal(human.team,team);assert.equal(human.bot,false);}
    fillBotTeams(match);assert.equal(match.players.length,8,'filling is idempotent');
    assert.throws(()=>addBot(match,'NINTH','blue'),/full/);assert.throws(()=>addPlayer(match,'NINTH'),/full/);
    if(mode==='classic')assert.equal(match.classic?.phase,'freeze');
  }
});

test('bot input decisions are bounded, buy real equipment and cannot be overwritten through human input',()=>{
  const {match}=createBotMatch(START,{team:'spectator',botDifficulty:'hard'});run(match,10_000);
  for(const player of match.players){
    assert.ok(player.lastSeq>=35&&player.lastSeq<=51,'decisions should run at roughly five per second');
    assert.ok(player.money>=0&&player.money<800);assert.ok(player.inventory.includes('pistol'));
    if(player.team==='blue')assert.equal(player.defuseKit,true);
    assert.ok(player.grenades.he>0);
  }
  const bot=match.players[0],before=JSON.stringify(bot);
  applyInput(match,bot.id,{seq:100_000,forward:1,yaw:2,shoot:true,buy:'sniper'},match.time);
  assert.equal(JSON.stringify(bot),before,'the human input endpoint must not control an AI player');
});

test('bots play complete autonomous rounds on every unmodified Nanded sector without teleporting',async context=>{
  for(const location of LOCATIONS)await context.test(location.name,()=>{
    const {match}=createBotMatch(START,{team:'spectator',locationId:location.id,botDifficulty:'hard'});
    const counts:Partial<Record<GameEvent['type'],number>>={};
    run(match,250_000,events=>{for(const event of events)counts[event.type]=(counts[event.type]??0)+1;},true);
    assert.ok(match.round>1,`${location.name} did not complete a round`);
    assert.ok((counts.shot??0)>0,`${location.name} bots never engaged`);
    assert.ok((counts.kill??0)>0,`${location.name} bots never completed an elimination`);
    assert.ok((counts.purchase??0)>0,`${location.name} bots never bought equipment`);
    assert.equal(match.players.length,8);assert.ok(match.players.every(player=>player.bot));
  });
});

test('classic bots plant, retrieve and defuse bombs, switch sides, win a match and restart autonomously',()=>{
  const {match}=createBotMatch(START,{team:'spectator',locationId:'bhagya',botDifficulty:'hard'});
  const names=new Map(match.players.map(player=>[player.id,player.name])),initialTeams=new Map(match.players.map(player=>[player.id,player.team]));
  const counts:Partial<Record<GameEvent['type'],number>>={};let won=false,restarted=false,switched=false;
  run(match,900_000,events=>{
    for(const event of events)counts[event.type]=(counts[event.type]??0)+1;
    if(match.classic?.sidesSwitched)switched||=match.players.every(player=>player.team!==initialTeams.get(player.id));
    if(match.winner)won=true;
    else if(won&&match.round===1)restarted=true;
  });
  assert.ok((counts.plant??0)>0);assert.ok((counts.defuse??0)>0);assert.ok((counts.bomb??0)>0);
  assert.ok((counts.reload??0)>0);assert.ok(switched);assert.ok(won);assert.ok(restarted);
  for(const player of match.players)assert.equal(player.name,names.get(player.id),'halftime must not leave misleading CT/T names');
  assert.equal(match.mode,'classic');assert.equal(match.bots,true);
});

test('deathmatch bots reload, score kills, respawn and keep playing after victory',()=>{
  const {match}=createBotMatch(START,{team:'spectator',mode:'deathmatch',botDifficulty:'hard'});const counts:Partial<Record<GameEvent['type'],number>>={};
  run(match,300_000,events=>{for(const event of events)counts[event.type]=(counts[event.type]??0)+1;});
  assert.ok((counts.kill??0)>=25);assert.ok((counts.reload??0)>0);assert.ok((counts.respawn??0)>8);
  assert.ok(match.round>1);assert.equal(match.players.length,8);assert.ok(match.players.every(player=>player.bot));
});

test('serialized bot state resumes deterministically with independent paths, reactions and random state',()=>{
  const {match}=createBotMatch(START,{team:'spectator',locationId:'konale'});run(match,35_000);
  const restored=snapshot(match);assert.ok(restored.players.some(player=>player.botState?.path.length));
  for(const [index,player] of match.players.entries())if(player.botState)assert.notEqual(restored.players[index].botState?.path,player.botState.path);
  run(match,25_000);run(restored,25_000);assert.deepEqual(snapshot(restored),snapshot(match));
});

test('pausing shifts bot reaction and navigation clocks with plant, defuse and round timers',()=>{
  const {match}=createBotMatch(START,{team:'spectator'});
  while(!match.classic?.bomb.action&&match.time<START+180_000)advanceMatch(match,match.time+100);
  const action=match.classic?.bomb.action;assert.ok(action,'fixture needs a naturally started bot plant or defuse');
  const before=snapshot(match),remaining=action.completesAt-match.time;
  shiftMatchTime(match,60_000);
  assert.equal(match.time,before.time+60_000);assert.equal(match.classic!.bomb.action!.completesAt-match.time,remaining);
  assert.equal(match.classic!.phaseEndsAt-match.time,before.classic!.phaseEndsAt-before.time);
  for(const player of match.players){
    const original=before.players.find(candidate=>candidate.id===player.id)!;
    assert.equal(player.botDecisionAt-match.time,original.botDecisionAt-before.time);
    if(original.botState?.lastProgressAt)assert.equal(player.botState!.lastProgressAt-match.time,original.botState.lastProgressAt-before.time);
  }
  advanceMatch(match,match.time+50);assert.ok(match.classic!.bomb.action,'the paused objective must not finish during the pause');
});

test('a human can join either side while teammates and enemies still move and fight independently',()=>{
  for(const team of ['blue','orange'] as Team[]){
    const {match,playerId}=createBotMatch(START,{team,botDifficulty:'hard'});const human=match.players.find(player=>player.id===playerId)!;
    const bots=match.players.filter(player=>player.bot),initial=new Map(bots.map(player=>[player.id,{x:player.x,z:player.z}]));
    run(match,30_000);
    assert.ok(bots.some(player=>{const before=initial.get(player.id)!;return Math.hypot(player.x-before.x,player.z-before.z)>10;}));
    assert.equal(human.lastSeq,-1,'AI must not send inputs for the human');
    assert.ok(match.players.some(player=>player.bot&&player.kills>0),'AI teams should fight without human input');
  }
});
