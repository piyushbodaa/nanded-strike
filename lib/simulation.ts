import { COLLIDERS, SPAWNS, SPAWN_YAWS, WAYPOINTS, MAP_BOUNDS } from "./map";

export type Team = "blue" | "orange";
export type Weapon = "rifle" | "pistol";
export interface Input {
  forward: number; strafe: number; yaw: number; pitch: number;
  shoot: boolean; reload: boolean; sprint: boolean; jump: boolean;
  weapon?: Weapon; seq: number;
}
export type PlayerInput = Input;
export interface Player {
  id: string; name: string; team: Team; bot: boolean;
  x: number; y: number; z: number; yaw: number; pitch: number;
  health: number; ammo: number; reserve: number; weapon: Weapon;
  kills: number; deaths: number; respawnAt: number; reloadUntil: number;
  invulnerableUntil: number; lastShotAt: number; lastInputAt: number;
  lastSeq: number; vy: number; intent: Input; magazines: Record<Weapon, { ammo: number; reserve: number }>;
  botTarget: number; botDecisionAt: number; nextBotShotAt: number;
}
/** Shot events contain muzzle position and endX/endY/endZ; hit/kill identify the victim. */
export interface GameEvent {
  id: number; type: "shot" | "kill" | "hit" | "reload" | "respawn" | "round";
  playerId: string; targetId?: string; x: number; y: number; z: number;
  endX?: number; endY?: number; endZ?: number; text?: string; time: number; headshot?: boolean;
}
export interface Match {
  players: Player[]; scores: Record<Team, number>; endsAt: number;
  winner: Team | "draw" | null; events: GameEvent[]; time: number;
  startedAt: number; round: number; winnerAt: number; nextId: number; eventId: number; seed: number;
}
export const EYE_HEIGHT = 1.58;
export const PLAYER_RADIUS = 0.36;
export const MATCH_DURATION = 300_000;
export const TARGET_SCORE = 25;
// Tolerates a delayed mobile poll while still releasing abandoned controls promptly.
export const INPUT_EXPIRY = 650;
export const WEAPONS = {
  rifle: { name: "AR30", magazine: 30, reserve: 120, damage: 34, interval: 110, reload: 1900, range: 110 },
  pistol: { name: "P12", magazine: 12, reserve: 60, damage: 27, interval: 260, reload: 1250, range: 70 },
} as const;
const ZERO_INPUT: Input = { forward: 0, strafe: 0, yaw: 0, pitch: 0, shoot: false, reload: false, sprint: false, jump: false, seq: -1 };
const BOT_NAMES = ["GODAVARI", "DECCAN", "WAZIRABAD", "MARATHWADA", "SAHYADRI", "VISHNUPURI", "TARODA", "KINWAT"];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const distance = (a: {x:number;z:number}, b: {x:number;z:number}) => Math.hypot(a.x-b.x,a.z-b.z);
const finite = (v: unknown, fallback = 0) => typeof v === "number" && Number.isFinite(v) ? v : fallback;

export function sanitizeInput(value: Partial<Input> | null | undefined): Input {
  const i = value && typeof value === "object" ? value : {};
  return { forward: clamp(finite(i.forward), -1, 1), strafe: clamp(finite(i.strafe), -1, 1),
    yaw: finite(i.yaw) % (Math.PI*2), pitch: clamp(finite(i.pitch), -1.45, 1.45),
    shoot: i.shoot === true, reload: i.reload === true, sprint: i.sprint === true, jump: i.jump === true,
    weapon: i.weapon === "pistol" ? "pistol" : i.weapon === "rifle" ? "rifle" : undefined,
    seq: Number.isSafeInteger(i.seq) && finite(i.seq, -1) >= 0 ? i.seq! : -1 };
}
function random(match: Match) {
  let x = match.seed | 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  match.seed = x >>> 0; return match.seed / 4294967296;
}
function event(match: Match, type: GameEvent["type"], player: Player | undefined, extra: Partial<GameEvent> = {}) {
  match.events.push({ id: ++match.eventId, type, playerId: player?.id ?? "", x: player?.x ?? 0, y: (player?.y ?? 0)+EYE_HEIGHT, z: player?.z ?? 0, time: match.time, ...extra });
  if (match.events.length > 48) match.events.splice(0, match.events.length-48);
}
function magazines(): Player["magazines"] { return { rifle: {ammo:30,reserve:120}, pistol: {ammo:12,reserve:60} }; }
function spawn(match: Match, player: Player) {
  const options = SPAWNS[player.team];
  let best = options[0]; let score = -Infinity;
  for (const spot of options) {
    const enemy = Math.min(80, ...match.players.filter(p => p.team !== player.team && p.health>0).map(p => distance(p, spot)));
    const friend = Math.min(5, ...match.players.filter(p => p.id !== player.id && p.team === player.team && p.health>0).map(p => distance(p, spot)));
    const s = enemy + friend*3 + random(match)*3;
    if (s > score) { best = spot; score = s; }
  }
  Object.assign(player, { x:best.x, z:best.z, y:0, vy:0, health:100, respawnAt:0, reloadUntil:0,
    invulnerableUntil:match.time+1300, magazines:magazines(), weapon:"rifle", ammo:30, reserve:120,
    yaw:SPAWN_YAWS[player.team], pitch:0, intent:{...ZERO_INPUT}, botTarget:-1,
    botDecisionAt:0, nextBotShotAt:match.time+700, lastShotAt:0 });
  event(match,"respawn",player);
}
function makePlayer(match: Match, name: string, team: Team, bot: boolean): Player {
  const player: Player = { id:`p${match.nextId++}`, name, team, bot, x:0,y:0,z:0,yaw:0,pitch:0,
    health:100,ammo:30,reserve:120,weapon:"rifle",kills:0,deaths:0,respawnAt:0,reloadUntil:0,
    invulnerableUntil:0,lastShotAt:0,lastInputAt:match.time,lastSeq:-1,vy:0,intent:{...ZERO_INPUT},magazines:magazines(),
    botTarget:-1,botDecisionAt:0,nextBotShotAt:0 };
  match.players.push(player); spawn(match,player); return player;
}
function fillBots(match: Match) {
  while (match.players.length < 6) {
    const blue = match.players.filter(p => p.team === "blue").length;
    const orange = match.players.length-blue;
    const team = blue <= orange ? "blue" : "orange";
    const used = new Set(match.players.map(p=>p.name));
    makePlayer(match,BOT_NAMES.find(n=>!used.has(n))??`BOT ${match.nextId}`,team,true);
  }
}
export function createMatch(now: number): Match {
  const time = finite(now, Date.now());
  const match: Match = {players:[],scores:{blue:0,orange:0},endsAt:time+MATCH_DURATION,winner:null,events:[],time,
    startedAt:time,round:1,winnerAt:0,nextId:1,eventId:0,seed:(time>>>0)||12345};
  fillBots(match); return match;
}
export function addPlayer(match: Match, name: string, requestedTeam?: Team): Player {
  if (match.players.filter(p=>!p.bot).length >= 8) throw new Error("This room is full. Try another room.");
  const blue = match.players.filter(p=>!p.bot&&p.team==="blue").length;
  const orange = match.players.filter(p=>!p.bot&&p.team==="orange").length;
  let team: Team = requestedTeam === "blue" || requestedTeam === "orange" ? requestedTeam : blue <= orange ? "blue" : "orange";
  if ((team === "blue" ? blue : orange) >= 4) team = team === "blue" ? "orange" : "blue";
  const bot = match.players.findIndex(p=>p.bot&&p.team===team);
  const otherBot = match.players.findIndex(p=>p.bot);
  if (bot>=0) match.players.splice(bot,1); else if (otherBot>=0) match.players.splice(otherBot,1);
  const safeName = String(name ?? "").replace(/[\u0000-\u001f\u007f<>]/g,"").trim().slice(0,18)||"PLAYER";
  const player = makePlayer(match,safeName,team,false); fillBots(match); return player;
}
export function removePlayer(match: Match, playerId: string) {
  match.players = match.players.filter(p=>p.id!==playerId); fillBots(match);
}

/** Collider coordinates are centers; their vertical slabs stop shots. */
function rayBox(ox:number,oy:number,oz:number,dx:number,dy:number,dz:number, box:{x:number;z:number;w:number;d:number;h:number}, padding=0):number {
  let near=0; let far=Infinity;
  const axes = [[ox,dx,box.x-box.w/2-padding,box.x+box.w/2+padding],
    [oy,dy,0,box.h], [oz,dz,box.z-box.d/2-padding,box.z+box.d/2+padding]];
  for(const [o,d,min,max] of axes) {
    if(Math.abs(d)<1e-8) {if(o<min||o>max)return Infinity;continue;}
    const a=(min-o)/d,b=(max-o)/d; near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));
    if(near>far)return Infinity;
  }
  return near;
}
export function isWalkable(x:number,z:number,y=0) {
  if(x<MAP_BOUNDS.minX+PLAYER_RADIUS||x>MAP_BOUNDS.maxX-PLAYER_RADIUS||z<MAP_BOUNDS.minZ+PLAYER_RADIUS||z>MAP_BOUNDS.maxZ-PLAYER_RADIUS)return false;
  return !COLLIDERS.some(c=>y<c.h-.04&&x>c.x-c.w/2-PLAYER_RADIUS&&x<c.x+c.w/2+PLAYER_RADIUS&&z>c.z-c.d/2-PLAYER_RADIUS&&z<c.z+c.d/2+PLAYER_RADIUS);
}
export function movePlayer(_match:Match, player:Player, input:Input, dt:number) {
  if(player.health<=0)return;
  const frame=clamp(finite(dt),0,.05);
  let f=finite(input.forward),s=finite(input.strafe); const magnitude=Math.hypot(f,s); if(magnitude>1){f/=magnitude;s/=magnitude;}
  const speed=input.sprint&&!input.shoot?7.2:4.8;
  const dx=(-Math.sin(player.yaw)*f+Math.cos(player.yaw)*s)*speed*frame;
  const dz=(-Math.cos(player.yaw)*f-Math.sin(player.yaw)*s)*speed*frame;
  if(input.jump&&player.y===0)player.vy=6.5;
  if(player.y>0||player.vy>0){player.vy-=20*frame;player.y=Math.max(0,player.y+player.vy*frame);if(player.y===0)player.vy=0;}
  // Deliberately never land inside a box: all collision footprints remain solid.
  if(isWalkable(player.x+dx,player.z))player.x+=dx;
  if(isWalkable(player.x,player.z+dz))player.z+=dz;
}
function switchWeapon(player:Player, weapon:Weapon) {
  if(player.weapon===weapon)return;
  player.magazines[player.weapon]={ammo:player.ammo,reserve:player.reserve};player.weapon=weapon;
  player.ammo=player.magazines[weapon].ammo;player.reserve=player.magazines[weapon].reserve;player.reloadUntil=0;
}
function beginReload(match:Match,player:Player) {
  if(player.health<=0||player.reloadUntil>0||player.ammo>=WEAPONS[player.weapon].magazine||player.reserve<=0)return;
  player.reloadUntil=match.time+WEAPONS[player.weapon].reload;event(match,"reload",player);
}
function finishRound(match:Match) {
  match.winner=match.scores.blue===match.scores.orange?"draw":match.scores.blue>match.scores.orange?"blue":"orange";
  match.winnerAt=match.time;event(match,"round",undefined,{text:match.winner==="draw"?"Round drawn":`${match.winner} wins`});
}
function shoot(match:Match,player:Player) {
  const gun=WEAPONS[player.weapon];
  if(player.health<=0||match.winner||player.reloadUntil>0||match.time-player.lastShotAt<gun.interval)return;
  if(player.ammo<=0){beginReload(match,player);return;}
  player.ammo--;player.lastShotAt=match.time;player.invulnerableUntil=0;
  const ox=player.x,oy=player.y+EYE_HEIGHT,oz=player.z;
  const dx=-Math.sin(player.yaw)*Math.cos(player.pitch),dy=Math.sin(player.pitch),dz=-Math.cos(player.yaw)*Math.cos(player.pitch);
  let range:number=gun.range;let victim:Player|undefined;let hitY=oy;
  for(const c of COLLIDERS)range=Math.min(range,rayBox(ox,oy,oz,dx,dy,dz,c));
  for(const target of match.players) {
    if(target.id===player.id||target.health<=0)continue;
    const box={x:target.x,z:target.z,w:.76,d:.76,h:1.8};
    const t=rayBox(ox,oy-target.y,oz,dx,dy,dz,box);
    if(t<range){range=t;victim=target;hitY=oy+dy*t-target.y;}
  }
  event(match,"shot",player,{endX:ox+dx*range,endY:oy+dy*range,endZ:oz+dz*range});
  if(!victim||victim.team===player.team||victim.invulnerableUntil>match.time)return;
  const headshot=hitY>1.38;
  victim.health=Math.max(0,victim.health-gun.damage*(headshot?2:1));
  event(match,"hit",player,{targetId:victim.id,x:victim.x,y:victim.y+1.2,z:victim.z,headshot});
  if(victim.health<=0){
    victim.deaths++;player.kills++;match.scores[player.team]++;victim.respawnAt=match.time+3000;victim.reloadUntil=0;
    victim.intent={...ZERO_INPUT};event(match,"kill",player,{targetId:victim.id,text:`${player.name} → ${victim.name}`,headshot});
    if(match.scores[player.team]>=TARGET_SCORE)finishRound(match);
  }
}
export function applyInput(match:Match,playerId:string,raw:Partial<Input>,now:number) {
  advanceMatch(match,now);
  const player=match.players.find(p=>p.id===playerId&&!p.bot);if(!player)return;
  const input=sanitizeInput(raw); if(input.seq<=player.lastSeq)return;
  player.lastSeq=input.seq;player.lastInputAt=match.time;player.intent=input;
  player.yaw=input.yaw;player.pitch=input.pitch;
  if(match.winner||player.health<=0)return;
  if(input.weapon)switchWeapon(player,input.weapon);
  if(input.reload)beginReload(match,player);
  if(input.shoot&&!input.sprint)shoot(match,player);
}
function clearPath(a:{x:number;z:number},b:{x:number;z:number},padding=PLAYER_RADIUS+.05) {
  const length=distance(a,b);if(length<.01)return true;
  const dx=(b.x-a.x)/length,dz=(b.z-a.z)/length;
  return !COLLIDERS.some(c=>rayBox(a.x,.6,a.z,dx,0,dz,c,padding)<length);
}
const waypointEdges=WAYPOINTS.map((a,i)=>WAYPOINTS.flatMap((b,j)=>i!==j&&distance(a,b)<22&&clearPath(a,b)?[j]:[]));
function navigationTarget(player:Player,target:{x:number;z:number}):number {
  // A tiny shared waypoint graph keeps bots out of building walls.
  const starts=WAYPOINTS.map((p,i)=>({i,d:distance(player,p)})).filter(v=>clearPath(player,WAYPOINTS[v.i])).sort((a,b)=>a.d-b.d).slice(0,3);
  if(!starts.length)return -1;
  const costs=WAYPOINTS.map(()=>Infinity),previous=WAYPOINTS.map(()=>-1),open=new Set<number>();
  for(const start of starts){costs[start.i]=start.d;open.add(start.i);}
  let goal=-1,bestScore=Infinity;
  while(open.size){
    let current=-1,score=Infinity;
    for(const index of open){const value=costs[index]+distance(WAYPOINTS[index],target);if(value<score){current=index;score=value;}}
    open.delete(current);
    const remaining=distance(WAYPOINTS[current],target);
    if(remaining<bestScore){bestScore=remaining;goal=current;}
    if(clearPath(WAYPOINTS[current],target)){goal=current;break;}
    for(const next of waypointEdges[current]){const cost=costs[current]+distance(WAYPOINTS[current],WAYPOINTS[next]);if(cost<costs[next]){costs[next]=cost;previous[next]=current;open.add(next);}}
  }
  if(goal<0)return starts[0].i;
  while(previous[goal]>=0)goal=previous[goal];
  if(distance(player,WAYPOINTS[goal])<1.1){
    const neighbor=waypointEdges[goal].filter(i=>clearPath(player,WAYPOINTS[i])).sort((a,b)=>distance(WAYPOINTS[a],target)-distance(WAYPOINTS[b],target))[0];
    if(neighbor!==undefined)return neighbor;
  }
  return goal;
}
function botInput(match:Match,p:Player):Input {
  const opponents=match.players.filter(t=>t.team!==p.team&&t.health>0).sort((a,b)=>distance(p,a)-distance(p,b));
  const target=opponents[0];if(!target)return {...ZERO_INPUT};
  const d=distance(p,target),visible=d<52&&clearPath(p,target,0);
  let yaw=p.yaw,pitch=0,forward=0,strafe=0,fire=false;
  if(visible){
    const aimX=target.x+Math.sin(match.time/700+p.id.length)*.45,aimZ=target.z+Math.cos(match.time/650)*.45;
    yaw=Math.atan2(-(aimX-p.x),-(aimZ-p.z));pitch=Math.atan2(target.y+1.05-(p.y+EYE_HEIGHT),d);
    forward=d>15?.7:d<6?-.25:0;strafe=Math.sin(match.time/1100+Number(p.id.slice(1)))>.1?.42:-.42;
    if(match.time>=p.nextBotShotAt){fire=true;p.nextBotShotAt=match.time+420+random(match)*300;}
  }else{
    if(match.time>=p.botDecisionAt||p.botTarget<0||distance(p,WAYPOINTS[p.botTarget]??p)<1.3){p.botTarget=navigationTarget(p,target);p.botDecisionAt=match.time+900;}
    const dest=clearPath(p,target)?target:WAYPOINTS[p.botTarget];
    if(dest){yaw=Math.atan2(-(dest.x-p.x),-(dest.z-p.z));forward=.74;}
  }
  p.yaw=yaw;p.pitch=pitch;
  return {forward,strafe,yaw,pitch,shoot:fire,reload:p.ammo===0,sprint:false,jump:false,seq:0};
}
function restartRound(match:Match) {
  match.round++;match.startedAt=match.time;match.endsAt=match.time+MATCH_DURATION;match.scores={blue:0,orange:0};match.winner=null;match.winnerAt=0;
  for(const p of match.players){p.kills=0;p.deaths=0;spawn(match,p);}
  event(match,"round",undefined,{text:`Round ${match.round}`});
}
export function advanceMatch(match:Match,now:number) {
  const destination=Math.max(match.time,finite(now,match.time));
  // Requests advance at most 400 ms of motion, even after a sleeping browser or server.
  const elapsed=Math.min(400,destination-match.time);
  let remaining=elapsed;match.time=destination-elapsed;
  while(remaining>.001){
    const delta=Math.min(remaining,1000/60);remaining-=delta;match.time+=delta;
    if(match.winner){if(match.time-match.winnerAt>=7000)restartRound(match);else continue;}
    if(match.time>=match.endsAt){finishRound(match);continue;}
    for(const p of match.players){
      if(p.health<=0){if(p.respawnAt<=match.time)spawn(match,p);else continue;}
      if(p.reloadUntil&&p.reloadUntil<=match.time){const count=Math.min(WEAPONS[p.weapon].magazine-p.ammo,p.reserve);p.ammo+=count;p.reserve-=count;p.reloadUntil=0;}
      const input=p.bot?botInput(match,p):match.time-p.lastInputAt<INPUT_EXPIRY?p.intent:{...ZERO_INPUT};
      movePlayer(match,p,input,delta/1000);
      if(input.reload)beginReload(match,p);
      if(input.shoot&&!input.sprint)shoot(match,p);
      if(match.winner)break;
    }
  }
  match.time=destination;
  if(!match.winner&&destination>=match.endsAt)finishRound(match);
  if(match.winner&&destination-match.winnerAt>=7000)restartRound(match);
}
/** No auth material is ever stored in the simulation or sent to another player. */
export function snapshot(match:Match,_playerId?:string):Match {
  void _playerId;
  return JSON.parse(JSON.stringify(match)) as Match;
}
