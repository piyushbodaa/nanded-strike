import { botLineWalkable, findBotPath } from './bot-navigation';
import type { Input, Match, Player, PurchaseId, Weapon } from './simulation';
import { BOT_DIFFICULTIES, normalizeBotDifficulty, type BotTuning } from './bot-difficulty';

type Point = {x:number;z:number};
export interface BotState {
  path:Point[];pathIndex:number;goal:Point|null;plannedAt:number;
  lastPosition:Point;lastProgressAt:number;enemyId?:string;seenAt:number;lastSeenAt:number;lastSeen?:Point;
  burstUntil:number;nextUtilityAt:number;patrolIndex:number;
  readyAt:number;reacquireUntil:number;trackingYaw?:number;trackingPitch?:number;
  action:'buying'|'moving'|'engaging'|'planting'|'defusing'|'retrieving'|'guarding'|'blinded'|'waiting';
}
export interface BotContext {
  random():number;
  canSee(target:Player):boolean;
  canBuy:boolean;
  eyeHeight(player:Player):number;
  weapons:Record<Weapon,{magazine:number;range:number}>;
}
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const angleDifference=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const primary=(weapon:Weapon)=>weapon!=='pistol'&&weapon!=='knife';
function idle(player:Player):Input {
  return {seq:player.lastSeq+1,forward:0,strafe:0,yaw:player.yaw,pitch:0,shoot:false,reload:false,sprint:false,jump:false,aim:false,crouch:false,walk:false,secondary:false,interact:false};
}
function newState(time:number,player:Player):BotState {
  return {path:[],pathIndex:0,goal:null,plannedAt:0,lastPosition:{x:player.x,z:player.z},lastProgressAt:time,
    seenAt:0,lastSeenAt:0,burstUntil:0,nextUtilityAt:time+6000,patrolIndex:0,readyAt:0,reacquireUntil:0,action:'waiting'};
}
function stateFor(match:Match,player:Player):BotState {
  const state=player.botState??(player.botState=newState(match.time,player));
  state.readyAt??=0;state.reacquireUntil??=0;return state;
}
export function resetBotTarget(player:Player,time:number,reacquireDelay:number):void {
  const state=player.botState??(player.botState=newState(time,player));
  state.enemyId=undefined;state.seenAt=0;state.lastSeenAt=0;state.burstUntil=0;state.readyAt=0;
  state.reacquireUntil=Math.max(state.reacquireUntil??0,time+reacquireDelay);
  state.trackingYaw=undefined;state.trackingPitch=undefined;
  player.nextBotShotAt=state.reacquireUntil;player.botTarget=-1;player.aiming=false;
  player.intent.shoot=false;player.intent.secondary=false;player.intent.aim=false;
}
export function botTargetInView(player:Player,target:Player,tuning:Readonly<BotTuning>):boolean {
  const desiredYaw=Math.atan2(-(target.x-player.x),-(target.z-player.z));
  return distance(player,target)<=tuning.sightRange&&Math.abs(angleDifference(desiredYaw,player.yaw))<=tuning.fieldOfView*Math.PI/360;
}
function buyChoice(player:Player,tuning:Readonly<BotTuning>):PurchaseId|undefined {
  if(!player.inventory.some(primary)){
    if(player.money>=2700)return 'rifle';
    if(player.money>=1250)return 'smg';
  }
  if(player.team==='blue'&&!player.defuseKit&&player.money>=400)return 'kit';
  if(player.armor<70&&player.money>=1000)return 'armor';
  if(tuning.attackGrenades&&player.grenades.he===0&&player.money>=300)return 'he';
  if(tuning.attackGrenades&&player.grenades.flash===0&&player.money>=200)return 'flash';
  if(player.grenades.smoke===0&&player.money>=300)return 'smoke';
  return undefined;
}
function combatWeapon(player:Player,range:number):Weapon {
  const loaded=(weapon:Weapon)=>player.inventory.includes(weapon)&&(weapon===player.weapon?player.ammo+player.reserve:player.magazines[weapon].ammo+player.magazines[weapon].reserve)>0;
  const candidates:Weapon[]=range>50?['sniper','rifle','smg','pistol','shotgun']:range<12?['shotgun','rifle','smg','pistol','sniper']:['rifle','smg','sniper','pistol','shotgun'];
  return candidates.find(loaded)??'knife';
}
function formationPoint(center:Point,index:number,radius=2.2):Point {
  for(let offset=0;offset<8;offset++){
    const angle=index*Math.PI/2+offset*Math.PI/4,point={x:center.x+Math.cos(angle)*radius,z:center.z+Math.sin(angle)*radius};
    if(botLineWalkable(center,point))return point;
  }
  return {x:center.x,z:center.z};
}
function navigate(match:Match,player:Player,state:BotState,goal:Point,input:Input,arrival=1):boolean {
  if(distance(player,goal)<=arrival){input.forward=0;return true;}
  if(distance(player,state.lastPosition)>.35){state.lastPosition={x:player.x,z:player.z};state.lastProgressAt=match.time;}
  const stuck=match.time-state.lastProgressAt>2200;
  if(!state.goal||distance(state.goal,goal)>3||(!state.path.length&&match.time-state.plannedAt>1500)||
    (stuck&&match.time-state.plannedAt>2000)){
    state.path=findBotPath(player,goal);state.pathIndex=0;state.goal={x:goal.x,z:goal.z};state.plannedAt=match.time;
    state.lastPosition={x:player.x,z:player.z};state.lastProgressAt=match.time;
  }
  while(state.pathIndex<state.path.length-1&&distance(player,state.path[state.pathIndex])<.22)state.pathIndex++;
  for(let next=state.path.length-1;next>state.pathIndex;next--){
    if(distance(player,state.path[next])<45&&botLineWalkable(player,state.path[next])){state.pathIndex=next;break;}
  }
  const target=state.path[state.pathIndex];
  if(!target)return false;
  const gap=distance(player,target);
  input.yaw=Math.atan2(-(target.x-player.x),-(target.z-player.z));input.pitch=0;
  input.forward=Math.min(1,gap/2.6);input.sprint=true;state.action='moving';
  return false;
}

/** Decisions only produce ordinary game inputs; the simulation retains movement, damage and money authority. */
export function decideBot(match:Match,player:Player,context:BotContext):Input {
  const input=idle(player),state=stateFor(match,player),tuning=BOT_DIFFICULTIES[normalizeBotDifficulty(match.botDifficulty)];
  if(player.health<=0||match.winner){state.action='waiting';return input;}
  if(match.mode==='classic'&&match.classic?.phase!=='live'){
    state.action=context.canBuy?'buying':'waiting';if(context.canBuy)input.buy=buyChoice(player,tuning);return input;
  }
  if(player.flashedUntil>match.time+400){state.action='blinded';return input;}
  const friends=match.players.filter(candidate=>candidate.team===player.team&&candidate.health>0),slot=Math.max(0,friends.findIndex(candidate=>candidate.id===player.id));
  const visible=match.players.filter(candidate=>candidate.team!==player.team&&candidate.health>0&&botTargetInView(player,candidate,tuning)&&context.canSee(candidate))
    .sort((a,b)=>distance(a,player)-distance(b,player));
  const enemy=visible[0],enemyRange=enemy?distance(enemy,player):Infinity;
  const classic=match.classic,bomb=classic?.bomb;
  let objective:Point|undefined,interact=false,arrival=1;
  if(match.mode==='classic'&&classic&&bomb){
    if(bomb.status==='planted'){
      if(player.team==='blue'){
        objective={x:bomb.x,z:bomb.z};arrival=1.4;
        const defuser=bomb.action?.type==='defuse'?bomb.action.playerId:[...friends].sort((a,b)=>distance(a,bomb)-distance(b,bomb)||a.id.localeCompare(b.id))[0]?.id;
        interact=defuser===player.id&&distance(player,bomb)<=2.4&&botLineWalkable(player,bomb);
        if(defuser!==player.id&&distance(player,bomb)<5)objective=formationPoint(bomb,slot,4.2);
      }else objective=formationPoint(bomb,slot,5.5);
    }else if(player.team==='orange'){
      const site=classic.sites[(match.round-1)%classic.sites.length];
      if(bomb.status==='dropped'){
        const collector=[...friends].sort((a,b)=>distance(a,bomb)-distance(b,bomb)||a.id.localeCompare(b.id))[0];
        if(collector?.id===player.id){objective={x:bomb.x,z:bomb.z};arrival=.9;interact=distance(player,bomb)<=1.6;state.action='retrieving';}
        else objective=formationPoint(site,slot,2.2);
      }else{
        objective=bomb.carrierId===player.id?site:formationPoint(site,slot,2.2);
        interact=bomb.carrierId===player.id&&distance(player,site)<=site.radius-1;
      }
    }else{
      const site=classic.sites[Math.floor(slot/2)%classic.sites.length];
      objective=formationPoint(site,slot,2.5);
    }
  }
  // Completing a nearby objective takes priority over a distant opponent. Close threats are fought first.
  if(interact&&enemyRange>7&&player.reloadUntil===0){
    state.action=bomb?.status==='planted'?'defusing':bomb?.status==='dropped'?'retrieving':'planting';input.interact=true;return input;
  }
  if(objective&&player.grenades.smoke>0&&match.time>=state.nextUtilityAt&&player.reloadUntil===0&&distance(player,objective)>8&&distance(player,objective)<20&&
    (bomb?.carrierId===player.id||(bomb?.status==='planted'&&player.team==='blue'))){
    input.yaw=Math.atan2(-(objective.x-player.x),-(objective.z-player.z));input.pitch=-.2;input.grenade='smoke';
    state.nextUtilityAt=match.time+12_000;return input;
  }
  if(enemy){
    if(state.enemyId!==enemy.id){
      state.enemyId=enemy.id;state.seenAt=match.time;state.burstUntil=0;
      state.readyAt=Math.max(state.reacquireUntil,match.time+tuning.reactionMinMs+context.random()*(tuning.reactionMaxMs-tuning.reactionMinMs));
      player.nextBotShotAt=state.readyAt;state.trackingYaw=player.yaw;state.trackingPitch=player.pitch;
    }
    state.lastSeenAt=match.time;state.lastSeen={x:enemy.x,z:enemy.z};state.action='engaging';
    const weapon=combatWeapon(player,enemyRange);if(weapon!==player.weapon)input.weapon=weapon;
    const weaponAmmo=weapon===player.weapon?player.ammo:player.magazines[weapon].ammo;
    if(!weaponAmmo&&weapon!=='knife'){input.reload=true;return input;}
    const desiredYaw=Math.atan2(-(enemy.x-player.x),-(enemy.z-player.z));
    const aimY=enemy.y+(enemy.crouched?.7:1.06),originY=player.y+context.eyeHeight(player);
    const desiredPitch=Math.atan2(aimY-originY,enemyRange);
    const error=(tuning.aimError+tuning.initialAimError*Math.max(0,1-(match.time-state.seenAt)/1800))*(player.flashedUntil>match.time?4:1);
    state.trackingYaw=(state.trackingYaw??player.yaw)+clamp(angleDifference(desiredYaw,state.trackingYaw??player.yaw),-tuning.turnPerDecision,tuning.turnPerDecision);
    state.trackingPitch=(state.trackingPitch??player.pitch)+clamp(desiredPitch-(state.trackingPitch??player.pitch),-tuning.turnPerDecision,tuning.turnPerDecision);
    input.yaw=state.trackingYaw+(context.random()-.5)*error*2;
    input.pitch=state.trackingPitch+(context.random()-.5)*error*2;
    input.aim=weapon!=='knife';
    // Readiness uses the tracking direction, before aim error: forgiving bots must fire misses too.
    const aligned=Math.abs(angleDifference(state.trackingYaw,desiredYaw))<.035&&Math.abs(state.trackingPitch-desiredPitch)<.08;
    if(match.time>=player.nextBotShotAt&&match.time>=state.burstUntil){
      state.burstUntil=match.time+tuning.burstMinMs+context.random()*(tuning.burstMaxMs-tuning.burstMinMs);
      player.nextBotShotAt=state.burstUntil+tuning.pauseMinMs+context.random()*(tuning.pauseMaxMs-tuning.pauseMinMs);
    }
    input.shoot=aligned&&match.time<state.burstUntil&&player.reloadUntil===0&&enemyRange<context.weapons[weapon].range;
    if(weapon==='knife'){
      input.forward=enemyRange>1.6?1:0;input.aim=false;input.secondary=input.shoot&&enemyRange<1.6;
    }else if(enemyRange>context.weapons[weapon].range*.85){
      navigate(match,player,state,state.lastSeen,input,8);input.sprint=false;input.aim=false;
    }
    // Utility is reserved for clear engagements; buying and throwing still use ordinary inventory checks.
    if(tuning.attackGrenades&&match.time>=state.readyAt&&match.time>=state.nextUtilityAt&&enemyRange>10&&enemyRange<24&&player.reloadUntil===0&&aligned){
      const kind=player.grenades.he>0?'he':player.grenades.flash>0?'flash':undefined;
      if(kind){input.grenade=kind;input.shoot=false;input.pitch=-.12;state.nextUtilityAt=match.time+9000;}
    }
    return input;
  }
  if(state.enemyId)resetBotTarget(player,match.time,tuning.reacquireMs);
  if(player.ammo<context.weapons[player.weapon].magazine*.4&&player.reserve>0&&player.reloadUntil===0)input.reload=true;
  if(!objective){
    const enemyTeam=player.team==='blue'?'orange':'blue',patrolTeam=state.patrolIndex%2===0?enemyTeam:player.team,spawns=match.spawns?.[patrolTeam];
    if(spawns?.length)objective=spawns[(slot+state.patrolIndex)%spawns.length];
  }
  if(objective){
    if(navigate(match,player,state,objective,input,arrival)){
      state.action='guarding';input.yaw=player.yaw+Math.min(.16,tuning.turnPerDecision*.5);
      if(match.mode==='deathmatch'){
        state.patrolIndex++;state.goal=null;
      }
    }
  }
  return input;
}
