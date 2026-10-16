import { COLLIDERS, SPAWNS, SPAWN_YAWS, MAP_BOUNDS, WAYPOINTS } from "./map";
import { LOCATIONS, DEFAULT_LOCATION_ID } from "./locations";
import SPAWN_LAYOUTS from "./spawn-layouts.json";
import { SpatialGrid } from "./spatial";
import { raySolid, touchesSolid } from "./geometry";
import { decideBot, type BotState } from "./bot-ai";

export type Team = "blue" | "orange";
export type MatchMode = "deathmatch" | "classic";
export type GameMode = MatchMode;
export type Weapon = "rifle" | "pistol" | "knife" | "smg" | "sniper" | "shotgun";
export type GrenadeType = "he" | "flash" | "smoke";
export type GrenadeKind = GrenadeType;
export interface BombSite { id: "A" | "B"; name: string; x: number; z: number; radius: number; }
export interface BombState {
  status: "carried" | "dropped" | "planted" | "defused" | "exploded";
  carrierId?: string; x: number; z: number; siteId?: "A" | "B"; explodeAt: number;
  action?: {type:"plant"|"defuse";playerId:string;startedAt:number;completesAt:number;x:number;z:number};
}
export interface ClassicState {
  phase: "waiting" | "freeze" | "live" | "over"; phaseEndsAt: number;
  roundWinner: Team | null; reason: string; sites: BombSite[]; bomb: BombState;
  lossStreak: Record<Team, number>; sidesSwitched: boolean;
}
export interface GrenadeProjectile {
  id: number; kind: GrenadeType; ownerId: string; team: Team;
  x: number; y: number; z: number; vx: number; vy: number; vz: number; explodeAt: number;
}
export interface SmokeCloud {id:number;x:number;y:number;z:number;radius:number;expiresAt:number;}
export interface Input {
  forward: number; strafe: number; yaw: number; pitch: number;
  shoot: boolean; reload: boolean; sprint: boolean; jump: boolean;
  aim?: boolean; crouch?: boolean; walk?: boolean; secondary?: boolean;
  buy?: PurchaseId; grenade?: GrenadeType; interact?: boolean;
  weapon?: Weapon; seq: number;
}
export type PlayerInput = Input;
export interface Player {
  id: string; name: string; team: Team; bot: boolean;
  x: number; y: number; z: number; yaw: number; pitch: number;
  health: number; ammo: number; reserve: number; weapon: Weapon;
  aiming: boolean; crouched: boolean; walking: boolean;
  money: number; armor: number; defuseKit: boolean; inventory: Weapon[];
  grenades: Record<GrenadeType, number>; flashedUntil: number;
  kills: number; deaths: number; respawnAt: number; reloadUntil: number;
  invulnerableUntil: number; lastShotAt: number; lastAttackWeapon?: Weapon; lastInputAt: number;
  lastAttackSecondary: boolean; attackRecoveryUntil: number; shotsInBurst: number;
  lastSeq: number; vy: number; intent: Input; magazines: Record<Weapon, { ammo: number; reserve: number }>;
  botTarget: number; botDecisionAt: number; nextBotShotAt: number;
  botState?: BotState;
}
/** Shot events contain muzzle position and endX/endY/endZ; hit/kill identify the victim. */
export interface GameEvent {
  id: number; type: "shot" | "melee" | "kill" | "hit" | "reload" | "respawn" | "round" | "notice" | "purchase" | "grenade" | "explosion" | "plant" | "defuse" | "bomb";
  playerId: string; targetId?: string; x: number; y: number; z: number;
  endX?: number; endY?: number; endZ?: number; text?: string; time: number; headshot?: boolean; weapon?: Weapon; secondary?: boolean;
}
export interface Match {
  players: Player[]; scores: Record<Team, number>; endsAt: number;
  mode: MatchMode; classic?: ClassicState; grenades: GrenadeProjectile[]; smokes: SmokeCloud[];
  winner: Team | "draw" | null; events: GameEvent[]; time: number;
  startedAt: number; round: number; winnerAt: number; nextId: number; eventId: number; seed: number;
  locationId?: string; exploration?: boolean; rulesVersion?: number; bots?: boolean;
  spawns?: Record<Team,{x:number;z:number}[]>; spawnYaws?: Record<Team,number>;
}
export const EYE_HEIGHT = 1.58;
export const CROUCH_EYE_HEIGHT = 1.02;
export function playerEyeHeight(player: Pick<Player, "crouched">): number {
  return player.crouched ? CROUCH_EYE_HEIGHT : EYE_HEIGHT;
}
export const PLAYER_RADIUS = 0.36;
export const MATCH_DURATION = 300_000;
export const TARGET_SCORE = 25;
// Tolerates a delayed mobile poll while still releasing abandoned controls promptly.
export const INPUT_EXPIRY = 650;
export const WEAPONS = {
  rifle: { name: "AR30", magazine: 30, reserve: 120, damage: 34, interval: 110, reload: 1900, range: 110 },
  pistol: { name: "P12", magazine: 12, reserve: 60, damage: 27, interval: 260, reload: 1250, range: 70 },
  knife: { name: "Knife", magazine: 0, reserve: 0, damage: 55, interval: 550, reload: 0, range: 2.2 },
  smg: { name: "SM30", magazine: 30, reserve: 120, damage: 24, interval: 80, reload: 2100, range: 75 },
  sniper: { name: "SR5", magazine: 5, reserve: 25, damage: 85, interval: 1400, reload: 2900, range: 350 },
  shotgun: { name: "SG8", magazine: 8, reserve: 32, damage: 11, interval: 850, reload: 2600, range: 38 },
} as const;
export const PURCHASES = {
  rifle:{name:"AR30 rifle",price:2700,kind:"weapon"},pistol:{name:"P12 handgun",price:400,kind:"weapon"},
  smg:{name:"SM30 submachine gun",price:1250,kind:"weapon"},sniper:{name:"SR5 sniper rifle",price:4750,kind:"weapon"},
  shotgun:{name:"SG8 shotgun",price:1800,kind:"weapon"},armor:{name:"Armor and helmet",price:1000,kind:"armor"},
  kit:{name:"Defuse kit",price:400,kind:"kit"},he:{name:"HE grenade",price:300,kind:"grenade"},
  flash:{name:"Flashbang",price:200,kind:"grenade"},smoke:{name:"Smoke grenade",price:300,kind:"grenade"},
} as const;
export type PurchaseId = keyof typeof PURCHASES;
export const CLASSIC_FREEZE_TIME=15_000,CLASSIC_ROUND_TIME=115_000,BOMB_TIME=40_000;
export const PLANT_TIME=3_000,DEFUSE_TIME=10_000,KIT_DEFUSE_TIME=5_000,CLASSIC_TARGET_SCORE=7;
export const KNIFE_SECONDARY = { damage: 75, interval: 900, range: 1.8 } as const;
const ZERO_INPUT: Input = { forward: 0, strafe: 0, yaw: 0, pitch: 0, shoot: false, reload: false, sprint: false, jump: false, aim: false, crouch: false, walk: false, secondary: false, interact:false, seq: -1 };
export const RULESET_VERSION = 7;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const distance = (a: {x:number;z:number}, b: {x:number;z:number}) => Math.hypot(a.x-b.x,a.z-b.z);
const finite = (v: unknown, fallback = 0) => typeof v === "number" && Number.isFinite(v) ? v : fallback;
const colliderGrid = new SpatialGrid(COLLIDERS);

export function sanitizeInput(value: Partial<Input> | null | undefined): Input {
  const i = value && typeof value === "object" ? value : {};
  return { forward: clamp(finite(i.forward), -1, 1), strafe: clamp(finite(i.strafe), -1, 1),
    yaw: finite(i.yaw) % (Math.PI*2), pitch: clamp(finite(i.pitch), -1.45, 1.45),
    shoot: i.shoot === true, reload: i.reload === true, sprint: i.sprint === true, jump: i.jump === true,
    aim: i.aim === true, crouch: i.crouch === true, walk: i.walk === true, secondary: i.secondary === true,
    weapon: typeof i.weapon==="string"&&Object.hasOwn(WEAPONS,i.weapon) ? i.weapon : undefined,
    buy:typeof i.buy==="string"&&Object.hasOwn(PURCHASES,i.buy)?i.buy:undefined,
    grenade:i.grenade==="he"||i.grenade==="flash"||i.grenade==="smoke"?i.grenade:undefined,interact:i.interact===true,
    seq: Number.isSafeInteger(i.seq) && finite(i.seq, -1) >= 0 ? i.seq! : -1 };
}
function random(match: Match) {
  let x = match.seed | 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  match.seed = x >>> 0; return match.seed / 4294967296;
}
function event(match: Match, type: GameEvent["type"], player: Player | undefined, extra: Partial<GameEvent> = {}) {
  match.events.push({ id: ++match.eventId, type, playerId: player?.id ?? "", x: player?.x ?? 0, y: (player?.y ?? 0)+(player ? playerEyeHeight(player) : EYE_HEIGHT), z: player?.z ?? 0, time: match.time, ...extra });
  if (match.events.length > 48) match.events.splice(0, match.events.length-48);
}
function magazines(): Player["magazines"] {
  return Object.fromEntries(Object.entries(WEAPONS).map(([key,weapon])=>[key,{ammo:weapon.magazine,reserve:weapon.reserve}])) as Player["magazines"];
}
function spawn(match: Match, player: Player) {
  const allOptions = (match.spawns??SPAWNS)[player.team];
  const friends = match.players.filter(p=>p.id!==player.id&&p.team===player.team&&p.health>0);
  const unoccupied = allOptions.filter(spot=>friends.every(friend=>distance(friend,spot)>=2));
  const options = unoccupied.length ? unoccupied : allOptions;
  let best = options[0]; let score = -Infinity;
  for (const spot of options) {
    const enemy = Math.min(80, ...match.players.filter(p => p.team !== player.team && p.health>0).map(p => distance(p, spot)));
    const friend = Math.min(5, ...match.players.filter(p => p.id !== player.id && p.team === player.team && p.health>0).map(p => distance(p, spot)));
    const s = enemy + friend*3 + random(match)*3;
    if (s > score) { best = spot; score = s; }
  }
  Object.assign(player, { x:best.x, z:best.z, y:0, vy:0, health:100, respawnAt:0, reloadUntil:0,
    invulnerableUntil:match.time+1300, magazines:magazines(), weapon:"rifle", ammo:30, reserve:120,
    yaw:(match.spawnYaws??SPAWN_YAWS)[player.team], pitch:0, intent:{...ZERO_INPUT}, botTarget:-1,
    botDecisionAt:0, nextBotShotAt:match.time+700, lastShotAt:0, lastAttackWeapon:undefined,
    lastAttackSecondary:false, attackRecoveryUntil:0,shotsInBurst:0, aiming:false, crouched:false, walking:false,flashedUntil:0,botState:undefined });
  event(match,"respawn",player);
}
function makePlayer(match: Match, name: string, team: Team, bot: boolean): Player {
  const player: Player = { id:`p${match.nextId++}`, name, team, bot, x:0,y:0,z:0,yaw:0,pitch:0,
    health:100,ammo:30,reserve:120,weapon:"rifle",aiming:false,crouched:false,walking:false,kills:0,deaths:0,respawnAt:0,reloadUntil:0,
    lastAttackSecondary:false,attackRecoveryUntil:0,shotsInBurst:0,money:800,armor:0,defuseKit:false,inventory:Object.keys(WEAPONS) as Weapon[],grenades:{he:0,flash:0,smoke:0},flashedUntil:0,
    invulnerableUntil:0,lastShotAt:0,lastInputAt:match.time,lastSeq:-1,vy:0,intent:{...ZERO_INPUT},magazines:magazines(),
    botTarget:-1,botDecisionAt:0,nextBotShotAt:0 };
  match.players.push(player); spawn(match,player);
  if(match.mode==="classic"){
    resetClassicEquipment(player);player.invulnerableUntil=0;
    if(match.classic?.phase==="live"||match.classic?.phase==="over"){player.health=0;player.respawnAt=0;event(match,"notice",player,{text:"You will join at the start of the next round."});}
    else if(match.classic?.phase==="waiting"&&hasBothTeams(match))startClassicRound(match);
  }
  return player;
}
export interface MatchOptions {locationId?:string;start?:{x:number;z:number;yaw:number};exploration?:boolean;mode?:MatchMode;bots?:boolean;}
function sectorSpawns(locationId:string) {
  const layout=SPAWN_LAYOUTS[locationId as keyof typeof SPAWN_LAYOUTS]??SPAWN_LAYOUTS[DEFAULT_LOCATION_ID];
  return {spawns:{blue:layout.spawns.blue.map(p=>({...p})),orange:layout.spawns.orange.map(p=>({...p}))},spawnYaws:{...layout.spawnYaws}};
}
export function createMatch(now: number, options:MatchOptions={}): Match {
  const time = finite(now, Date.now());
  const location=LOCATIONS.find(l=>l.id===options.locationId)??(options.start?[...LOCATIONS].sort((a,b)=>distance(a,options.start!)-distance(b,options.start!))[0]:LOCATIONS.find(l=>l.id===DEFAULT_LOCATION_ID)!);
  const match:Match={players:[],scores:{blue:0,orange:0},endsAt:time+MATCH_DURATION,winner:null,events:[],time,
    mode:options.exploration?"deathmatch":options.mode??"deathmatch",grenades:[],smokes:[],
    bots:options.bots===true&&!options.exploration,
    startedAt:time,round:1,winnerAt:0,nextId:1,eventId:0,seed:(time>>>0)||12345,
    rulesVersion:RULESET_VERSION,locationId:location.id,exploration:options.exploration??false,...sectorSpawns(location.id)};
  if(match.mode==="classic")match.classic=createClassicState(match);
  return match;
}
/** Legacy/network rooms remain human-only; bots require an explicit local match opt-in. */
export function sanitizeMatch(match:Match):void {
  const allowBots=match.bots===true&&!match.exploration;
  const disallowedBots=!allowBots&&match.players.some(player=>player.bot);
  if(!disallowedBots&&match.rulesVersion===RULESET_VERSION)return;
  match.players=match.players.filter(player=>allowBots||!player.bot);
  const location=LOCATIONS.find(l=>l.id===match.locationId)??LOCATIONS.find(l=>l.id===DEFAULT_LOCATION_ID)!;
  Object.assign(match,sectorSpawns(location.id),{locationId:location.id,rulesVersion:RULESET_VERSION,
    mode:match.exploration?"deathmatch":match.mode??"deathmatch",bots:allowBots,grenades:[],smokes:[],round:1,
    scores:{blue:0,orange:0},winner:null,winnerAt:0,startedAt:match.time,endsAt:match.time+MATCH_DURATION,events:[]});
  match.classic=match.mode==="classic"?createClassicState(match):undefined;
  for(const player of match.players){
    Object.assign(player,{kills:0,deaths:0,money:800,armor:0,defuseKit:false,inventory:Object.keys(WEAPONS),grenades:{he:0,flash:0,smoke:0}});
    spawn(match,player);if(match.mode==="classic")resetClassicEquipment(player);
  }
  if(match.mode==="classic"&&hasBothTeams(match))startClassicRound(match);
}
export function addPlayer(match: Match, name: string, requestedTeam?: Team): Player {
  sanitizeMatch(match);
  if (match.players.length >= 8) throw new Error("This room is full. Try another room.");
  const blue = match.players.filter(p=>p.team==="blue").length;
  const orange = match.players.filter(p=>p.team==="orange").length;
  let team: Team = requestedTeam === "blue" || requestedTeam === "orange" ? requestedTeam : blue <= orange ? "blue" : "orange";
  if ((team === "blue" ? blue : orange) >= 4) team = team === "blue" ? "orange" : "blue";
  const safeName = String(name ?? "").replace(/[\u0000-\u001f\u007f<>]/g,"").trim().slice(0,18)||"PLAYER";
  return makePlayer(match,safeName,team,false);
}
export function addBot(match:Match,name:string,team:Team):Player {
  if(match.bots!==true||match.exploration)throw new Error("Bots are available only in an explicitly enabled local bot match.");
  sanitizeMatch(match);
  if(team!=="blue"&&team!=="orange")throw new Error("Choose a valid bot team.");
  if(match.players.length>=8||match.players.filter(player=>player.team===team).length>=4)throw new Error("This bot team is full.");
  const safeName=String(name??"").replace(/[\u0000-\u001f\u007f<>]/g,"").trim().slice(0,18)||"BOT";
  return makePlayer(match,safeName,team,true);
}
export function fillBotTeams(match:Match):void {
  if(match.bots!==true||match.exploration)throw new Error("Enable a local bot match before filling teams.");
  for(const team of ["blue","orange"] as const){
    let count=match.players.filter(player=>player.team===team).length;
    const names=['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot','Golf','Hotel'];
    while(count<4){addBot(match,`BOT ${names[match.players.filter(player=>player.bot).length]}`,team);count++;}
  }
}
export function createBotMatch(now:number,options:MatchOptions&{name?:string;team?:Team|"spectator"}={}):{match:Match;playerId:string|null} {
  const match=createMatch(now,{...options,mode:options.mode??"classic",bots:true,exploration:false});
  const player=options.team==="spectator"?undefined:addPlayer(match,options.name??"PLAYER",options.team??"blue");
  fillBotTeams(match);return {match,playerId:player?.id??null};
}
export function removePlayer(match: Match, playerId: string) {
  sanitizeMatch(match);
  const departing=match.players.find(player=>player.id===playerId);
  if(departing)dropBomb(match,departing);
  match.players = match.players.filter(p=>p.id!==playerId);
}

/** Collider coordinates are centers; their vertical slabs stop shots. */
const rayBox=raySolid;
export function isWalkable(x:number,z:number,y=0) {
  if(x<MAP_BOUNDS.minX+PLAYER_RADIUS||x>MAP_BOUNDS.maxX-PLAYER_RADIUS||z<MAP_BOUNDS.minZ+PLAYER_RADIUS||z>MAP_BOUNDS.maxZ-PLAYER_RADIUS)return false;
  return !colliderGrid.around(x,z,PLAYER_RADIUS).some(c=>y<c.h-.04&&touchesSolid(x,z,c,PLAYER_RADIUS));
}
function hasBothTeams(match:Match) {
  return match.players.some(player=>player.team==="blue")&&match.players.some(player=>player.team==="orange");
}
function createClassicState(match:Match):ClassicState {
  const defenders=(match.spawns??SPAWNS).blue[0],attackers=(match.spawns??SPAWNS).orange[0];
  const candidates=WAYPOINTS.filter(point=>distance(point,defenders)<160&&isWalkable(point.x,point.z));
  const a=[...candidates].sort((p,q)=>Math.abs(distance(p,defenders)-30)-Math.abs(distance(q,defenders)-30))[0]??defenders;
  const b=[...candidates].filter(point=>distance(point,a)>50).sort((p,q)=>
    (Math.abs(distance(p,defenders)-65)+distance(p,attackers)*.12)-(Math.abs(distance(q,defenders)-65)+distance(q,attackers)*.12))[0]??attackers;
  return {phase:"waiting",phaseEndsAt:0,roundWinner:null,reason:"Waiting for a player on each team",lossStreak:{blue:0,orange:0},sidesSwitched:false,
    sites:[{id:"A",name:"Site A",x:a.x,z:a.z,radius:5},{id:"B",name:"Site B",x:b.x,z:b.z,radius:5}],
    bomb:{status:"dropped",x:attackers.x,z:attackers.z,explodeAt:0}};
}
function resetClassicEquipment(player:Player) {
  player.inventory=["pistol","knife"];player.weapon="pistol";player.magazines=magazines();
  player.ammo=WEAPONS.pistol.magazine;player.reserve=WEAPONS.pistol.reserve;
  player.armor=0;player.defuseKit=false;player.grenades={he:0,flash:0,smoke:0};
}
function startClassicRound(match:Match) {
  const state=match.classic;if(!state)return;
  if(!hasBothTeams(match)){state.phase="waiting";state.phaseEndsAt=0;state.reason="Waiting for a player on each team";return;}
  if(match.round===7&&!state.sidesSwitched){
    for(const player of match.players){player.team=player.team==="blue"?"orange":"blue";player.money=800;resetClassicEquipment(player);}
    match.scores={blue:match.scores.orange,orange:match.scores.blue};state.lossStreak={blue:0,orange:0};
    state.sidesSwitched=true;
  }
  for(const player of match.players){
    const survived=player.health>0,weapon=player.weapon;
    spawn(match,player);player.invulnerableUntil=0;
    if(!survived)resetClassicEquipment(player);
    else{
      player.weapon=player.inventory.includes(weapon)?weapon:"pistol";
      player.ammo=player.magazines[player.weapon].ammo;player.reserve=player.magazines[player.weapon].reserve;
    }
  }
  const carrier=match.players.find(player=>player.team==="orange")!;
  state.bomb={status:"carried",carrierId:carrier.id,x:carrier.x,z:carrier.z,explodeAt:0};
  state.phase="freeze";state.phaseEndsAt=match.time+CLASSIC_FREEZE_TIME;state.roundWinner=null;
  state.reason=match.round===7?"Sides switched · buy equipment":"Buy equipment before the round starts";
  match.endsAt=state.phaseEndsAt;match.grenades=[];match.smokes=[];
  event(match,"round",undefined,{text:`Round ${match.round} · ${state.reason}`});
}
function restartClassicMatch(match:Match) {
  match.round=1;match.scores={blue:0,orange:0};match.winner=null;match.winnerAt=0;match.startedAt=match.time;
  match.classic=createClassicState(match);
  for(const player of match.players){player.money=800;player.kills=0;player.deaths=0;player.health=0;resetClassicEquipment(player);}
  startClassicRound(match);
}
function awardMoney(player:Player,amount:number) {player.money=clamp(player.money+amount,0,16_000);}
function finishClassicRound(match:Match,winner:Team,reason:string) {
  const state=match.classic;if(!state||state.phase!=="live")return;
  state.phase="over";state.phaseEndsAt=match.time+5000;state.roundWinner=winner;state.reason=reason;
  const loser:Team=winner==="blue"?"orange":"blue";
  state.lossStreak[winner]=0;state.lossStreak[loser]++;
  const lossReward=Math.min(3400,1400+(state.lossStreak[loser]-1)*500);
  for(const player of match.players){
    awardMoney(player,player.team===winner?3250:lossReward);
    player.intent={...ZERO_INPUT};updateStance(player,ZERO_INPUT);
  }
  match.scores[winner]++;match.endsAt=state.phaseEndsAt;
  if(match.scores[winner]>=CLASSIC_TARGET_SCORE){match.winner=winner;match.winnerAt=match.time;}
  event(match,"round",undefined,{text:`${winner==="blue"?"Defenders":"Attackers"} win · ${reason}`});
}
export function canBuy(match:Match,player:Player):boolean {
  return match.mode==="classic"&&match.classic?.phase==="freeze"&&player.health>0&&!match.winner&&
    (match.spawns??SPAWNS)[player.team].some(point=>distance(point,player)<=25);
}
function purchase(match:Match,player:Player,id:PurchaseId) {
  const item=PURCHASES[id];let rejection="";
  if(!canBuy(match,player))rejection="Buy during freeze time, alive and in your spawn zone.";
  else if(player.money<item.price)rejection=`You need $${item.price} for ${item.name}.`;
  else if(item.kind==="weapon"&&player.inventory.includes(id as Weapon))rejection="You already own this weapon.";
  else if(id==="armor"&&player.armor>=100)rejection="Your armor is full.";
  else if(id==="kit"&&(player.team!=="blue"||player.defuseKit))rejection=player.team!=="blue"?"Only defenders can buy a defuse kit.":"You already have a defuse kit.";
  else if(item.kind==="grenade"){
    const kind=id as GrenadeType,limit=kind==="flash"?2:1;
    if(player.grenades[kind]>=limit||Object.values(player.grenades).reduce((a,b)=>a+b,0)>=4)rejection="Grenade inventory is full.";
  }
  if(rejection){event(match,"notice",player,{text:rejection});return;}
  awardMoney(player,-item.price);
  if(item.kind==="weapon"){
    const weapon=id as Weapon;
    if(weapon!=="pistol")player.inventory=player.inventory.filter(slot=>slot==="pistol"||slot==="knife");
    player.inventory.push(weapon);switchWeapon(player,weapon);player.ammo=WEAPONS[weapon].magazine;player.reserve=WEAPONS[weapon].reserve;
    player.magazines[weapon]={ammo:player.ammo,reserve:player.reserve};
  }else if(id==="armor")player.armor=100;
  else if(id==="kit")player.defuseKit=true;
  else player.grenades[id as GrenadeType]++;
  event(match,"purchase",player,{text:`Bought ${item.name} · $${item.price}`});
}
function dropBomb(match:Match,player:Player) {
  const bomb=match.classic?.bomb;if(!bomb||bomb.status!=="carried"||bomb.carrierId!==player.id)return;
  bomb.status="dropped";bomb.x=player.x;bomb.z=player.z;delete bomb.carrierId;delete bomb.action;
  event(match,"bomb",player,{text:"Bomb dropped"});
}
function updateBomb(match:Match) {
  const state=match.classic;if(!state||state.phase!=="live")return;
  const bomb=state.bomb,carrier=match.players.find(player=>player.id===bomb.carrierId);
  if(bomb.status==="carried"&&carrier){bomb.x=carrier.x;bomb.z=carrier.z;if(carrier.health<=0)dropBomb(match,carrier);}
  const holding=(player:Player)=>player.health>0&&player.intent.interact===true&&match.time-player.lastInputAt<INPUT_EXPIRY;
  if(bomb.status==="dropped"){
    const collector=match.players.find(player=>player.team==="orange"&&holding(player)&&distance(player,bomb)<=1.8&&unobstructed(player.x,player.y+playerEyeHeight(player),player.z,bomb.x,.2,bomb.z));
    if(collector){bomb.status="carried";bomb.carrierId=collector.id;event(match,"bomb",collector,{text:"Bomb picked up"});}
  }
  if(bomb.action){
    const action=bomb.action,player=match.players.find(candidate=>candidate.id===action.playerId);
    const valid=player&&holding(player)&&player.reloadUntil===0&&distance(player,action)<.45&&player.y===0&&!player.intent.shoot&&!player.intent.secondary&&
      (action.type==="plant"?bomb.status==="carried"&&bomb.carrierId===player.id&&action.completesAt<=state.phaseEndsAt&&state.sites.some(site=>distance(player,site)<=site.radius):
        bomb.status==="planted"&&player.team==="blue"&&distance(player,bomb)<=3&&unobstructed(player.x,player.y+playerEyeHeight(player),player.z,bomb.x,.2,bomb.z));
    if(!valid)delete bomb.action;
    else if(match.time>=action.completesAt){
      if(action.type==="plant"){
        bomb.status="planted";bomb.x=player.x;bomb.z=player.z;bomb.explodeAt=action.completesAt+BOMB_TIME;
        bomb.siteId=state.sites.find(site=>distance(player,site)<=site.radius)!.id;delete bomb.carrierId;delete bomb.action;
        awardMoney(player,300);event(match,"plant",player,{text:`Bomb planted at Site ${bomb.siteId}`});
        state.phaseEndsAt=bomb.explodeAt;match.endsAt=bomb.explodeAt;
      }else if(action.completesAt<=bomb.explodeAt){
        bomb.status="defused";delete bomb.action;awardMoney(player,300);
        event(match,"defuse",player,{text:"Bomb defused"});finishClassicRound(match,"blue","Bomb defused");
      }
    }
  }
  if(!bomb.action&&state.phase==="live"){
    const actor=match.players.find(player=>holding(player)&&player.reloadUntil===0&&player.y===0&&!player.intent.shoot&&!player.intent.secondary&&
      (bomb.status==="carried"?player.id===bomb.carrierId&&player.team==="orange"&&match.time+PLANT_TIME<=state.phaseEndsAt&&state.sites.some(site=>distance(player,site)<=site.radius):
        bomb.status==="planted"&&player.team==="blue"&&distance(player,bomb)<=3&&unobstructed(player.x,player.y+playerEyeHeight(player),player.z,bomb.x,.2,bomb.z)));
    if(actor){
      const type=bomb.status==="carried"?"plant":"defuse",duration=type==="plant"?PLANT_TIME:actor.defuseKit?KIT_DEFUSE_TIME:DEFUSE_TIME;
      bomb.action={type,playerId:actor.id,startedAt:match.time,completesAt:match.time+duration,x:actor.x,z:actor.z};
    }
  }
}
function tickClassicState(match:Match) {
  const state=match.classic;if(!state)return;
  if(match.winner){if(match.time-match.winnerAt>=7000)restartClassicMatch(match);return;}
  if(state.phase==="waiting"){if(hasBothTeams(match))startClassicRound(match);return;}
  if(state.phase==="freeze"){
    if(!hasBothTeams(match)){state.phase="waiting";state.reason="Waiting for a player on each team";return;}
    if(match.time>=state.phaseEndsAt){state.phase="live";state.phaseEndsAt+=CLASSIC_ROUND_TIME;state.reason="Plant or defend the bomb sites";match.endsAt=state.phaseEndsAt;event(match,"round",undefined,{text:"Round live"});tickClassicState(match);}
    return;
  }
  if(state.phase==="over"){if(match.time>=state.phaseEndsAt){match.round++;startClassicRound(match);}return;}
  updateBomb(match);
  if(state.phase!=="live")return;
  if(state.bomb.status==="planted"&&match.time>=state.bomb.explodeAt){
    const bomb=state.bomb;bomb.status="exploded";delete bomb.action;
    event(match,"explosion",undefined,{x:bomb.x,y:.4,z:bomb.z,text:"Bomb exploded"});
    for(const player of match.players)if(player.health>0&&distance(player,bomb)<22)damagePlayer(match,player,undefined,Math.max(0,200*(1-distance(player,bomb)/22)),false,false);
    finishClassicRound(match,"orange","Bomb exploded");return;
  }
  if(!match.players.some(player=>player.team==="blue"&&player.health>0))finishClassicRound(match,"orange","Defenders eliminated");
  else if(state.bomb.status!=="planted"&&!match.players.some(player=>player.team==="orange"&&player.health>0))finishClassicRound(match,"blue","Attackers eliminated");
  else if(state.bomb.status!=="planted"&&match.time>=state.phaseEndsAt)finishClassicRound(match,"blue","Time expired");
}
function unobstructed(ax:number,ay:number,az:number,bx:number,by:number,bz:number) {
  const length=Math.hypot(bx-ax,by-ay,bz-az);if(length<.01)return true;
  const dx=(bx-ax)/length,dy=(by-ay)/length,dz=(bz-az)/length;
  return !colliderGrid.along(ax,az,dx,dz,length).some(collider=>raySolid(ax,ay,az,dx,dy,dz,collider)<length-.05);
}
function damagePlayer(match:Match,victim:Player,attacker:Player|undefined,rawDamage:number,headshot:boolean,allowArmor=true,killReward?:number) {
  if(victim.health<=0||victim.invulnerableUntil>match.time||attacker?.team===victim.team)return;
  let damage=rawDamage;
  if(allowArmor&&victim.armor>0){const absorbed=Math.min(victim.armor,damage*.4);victim.armor=Math.max(0,victim.armor-absorbed);damage-=absorbed;}
  victim.health=Math.max(0,Math.round((victim.health-damage)*100)/100);
  event(match,"hit",attacker,{targetId:victim.id,x:victim.x,y:victim.y+(victim.crouched?.9:1.2),z:victim.z,headshot});
  if(victim.health>0)return;
  victim.deaths++;victim.respawnAt=match.mode==="classic"?0:match.time+3000;victim.reloadUntil=0;
  victim.intent={...ZERO_INPUT};updateStance(victim,ZERO_INPUT);dropBomb(match,victim);
  if(attacker){
    attacker.kills++;
    if(match.mode==="classic")awardMoney(attacker,killReward??(attacker.weapon==="knife"?1500:attacker.weapon==="shotgun"?900:attacker.weapon==="smg"?600:attacker.weapon==="sniper"?100:300));
    else match.scores[attacker.team]++;
  }
  event(match,"kill",attacker,{targetId:victim.id,text:`${attacker?.name??"Bomb"} → ${victim.name}`,headshot});
  if(match.mode!=="classic"&&attacker&&match.scores[attacker.team]>=TARGET_SCORE)finishRound(match);
}
function throwGrenade(match:Match,player:Player,kind:GrenadeType) {
  if(match.winner||player.health<=0||(match.mode==="classic"&&match.classic?.phase!=="live"))return;
  if(player.grenades[kind]<=0){event(match,"notice",player,{text:`No ${PURCHASES[kind].name} available. Buy one during freeze time.`});return;}
  if(player.reloadUntil>0||match.time<player.attackRecoveryUntil)return;
  player.grenades[kind]--;player.aiming=false;player.intent.aim=false;player.attackRecoveryUntil=match.time+600;player.invulnerableUntil=0;
  const pitch=clamp(player.pitch+.12,-1.2,1.3),speed=14;
  const grenade:GrenadeProjectile={id:++match.eventId,kind,ownerId:player.id,team:player.team,x:player.x,y:player.y+playerEyeHeight(player),z:player.z,
    vx:-Math.sin(player.yaw)*Math.cos(pitch)*speed,vy:Math.sin(pitch)*speed+2,vz:-Math.cos(player.yaw)*Math.cos(pitch)*speed,explodeAt:match.time+1600};
  match.grenades.push(grenade);event(match,"grenade",player,{text:kind});
}
function detonateGrenade(match:Match,grenade:GrenadeProjectile) {
  const owner=match.players.find(player=>player.id===grenade.ownerId);
  event(match,"explosion",owner,{x:grenade.x,y:grenade.y,z:grenade.z,text:grenade.kind});
  if(grenade.kind==="smoke"){
    match.smokes.push({id:grenade.id,x:grenade.x,y:Math.max(1.8,grenade.y+1.4),z:grenade.z,radius:6,expiresAt:match.time+18_000});return;
  }
  for(const player of match.players){
    if(player.health<=0)continue;
    const eye=player.y+playerEyeHeight(player),range=Math.hypot(player.x-grenade.x,eye-grenade.y,player.z-grenade.z);
    const maxRange=grenade.kind==="he"?8:14;
    if(range>=maxRange||!unobstructed(grenade.x,Math.max(.2,grenade.y),grenade.z,player.x,eye,player.z))continue;
    if(grenade.kind==="he"){
      // Team protection applies to HE just as it does to bullets and knives.
      if(player.team===grenade.team)continue;
      damagePlayer(match,player,owner,85*(1-range/maxRange),false,true,300);
    }else{
      const horizontal=Math.hypot(grenade.x-player.x,grenade.z-player.z)||1;
      const facing=(-Math.sin(player.yaw)*(grenade.x-player.x)-Math.cos(player.yaw)*(grenade.z-player.z))/horizontal;
      const duration=(facing>.25?4000:1400)*(1-range/maxRange);
      player.flashedUntil=Math.max(player.flashedUntil,match.time+duration);
    }
  }
}
function tickGrenades(match:Match,dt:number) {
  for(const grenade of match.grenades){
    grenade.vy-=12*dt;
    const nx=grenade.x+grenade.vx*dt,nz=grenade.z+grenade.vz*dt;
    if(isWalkable(nx,grenade.z,grenade.y))grenade.x=nx;else grenade.vx*=-.45;
    if(isWalkable(grenade.x,nz,grenade.y))grenade.z=nz;else grenade.vz*=-.45;
    const previousY=grenade.y;grenade.y+=grenade.vy*dt;
    const roof=colliderGrid.around(grenade.x,grenade.z,.1).filter(collider=>touchesSolid(grenade.x,grenade.z,collider,.1)&&previousY>=collider.h+.1&&grenade.y<collider.h+.12)
      .reduce((height,collider)=>Math.max(height,collider.h),0);
    const floor=roof+.12;
    if(grenade.y<floor){grenade.y=floor;grenade.vy=Math.abs(grenade.vy)*.35;grenade.vx*=.8;grenade.vz*=.8;}
    if(match.time>=grenade.explodeAt)detonateGrenade(match,grenade);
  }
  match.grenades=match.grenades.filter(grenade=>grenade.explodeAt>match.time);
  match.smokes=match.smokes.filter(smoke=>smoke.expiresAt>match.time);
}
function updateStance(player:Player,input:Input) {
  const alive=player.health>0;
  player.crouched=alive&&input.crouch===true;
  player.walking=alive&&input.walk===true;
  player.aiming=alive&&input.aim===true&&player.weapon!=="knife"&&player.reloadUntil===0;
}
function sprinting(player:Player,input:Input) {
  return input.sprint&&!player.aiming&&!player.crouched&&!player.walking;
}
export function movePlayer(match:Match, player:Player, input:Input, dt:number) {
  updateStance(player,input);
  if(player.health<=0||(match.mode==="classic"&&match.classic?.phase!=="live"))return;
  const frame=clamp(finite(dt),0,.05);
  let f=finite(input.forward),s=finite(input.strafe); const magnitude=Math.hypot(f,s); if(magnitude>1){f/=magnitude;s/=magnitude;}
  const speed=player.crouched?2:player.walking?2.4:player.aiming?2.5:sprinting(player,input)&&!input.shoot&&!input.secondary?7.2:4.8;
  const dx=(-Math.sin(player.yaw)*f+Math.cos(player.yaw)*s)*speed*frame;
  const dz=(-Math.cos(player.yaw)*f-Math.sin(player.yaw)*s)*speed*frame;
  if(input.jump&&player.y===0)player.vy=6.5;
  if(player.y>0||player.vy>0){player.vy-=20*frame;player.y=Math.max(0,player.y+player.vy*frame);if(player.y===0)player.vy=0;}
  // Deliberately never land inside a box: all collision footprints remain solid.
  if(isWalkable(player.x+dx,player.z))player.x+=dx;
  if(isWalkable(player.x,player.z+dz))player.z+=dz;
}
function switchWeapon(player:Player, weapon:Weapon) {
  if(player.weapon===weapon||!player.inventory.includes(weapon))return;
  player.magazines[player.weapon]={ammo:player.ammo,reserve:player.reserve};player.weapon=weapon;
  player.ammo=player.magazines[weapon].ammo;player.reserve=player.magazines[weapon].reserve;player.reloadUntil=0;
  player.aiming=false;player.intent.aim=false;
}
function beginReload(match:Match,player:Player) {
  if(player.weapon==="knife"||player.health<=0||player.reloadUntil>0||player.ammo>=WEAPONS[player.weapon].magazine||player.reserve<=0)return;
  player.reloadUntil=match.time+WEAPONS[player.weapon].reload;player.aiming=false;player.intent.aim=false;event(match,"reload",player);
}
function finishRound(match:Match) {
  match.winner=match.scores.blue===match.scores.orange?"draw":match.scores.blue>match.scores.orange?"blue":"orange";
  match.winnerAt=match.time;event(match,"round",undefined,{text:match.winner==="draw"?"Round drawn":`${match.winner} wins`});
}
function shoot(match:Match,player:Player,secondary=false) {
  const gun=WEAPONS[player.weapon];
  const melee=player.weapon==="knife";
  const attack=melee&&secondary?KNIFE_SECONDARY:gun;
  // Switching slots must not bypass the recovery time of the previous attack.
  if(player.health<=0||match.winner||(match.mode==="classic"&&match.classic?.phase!=="live")||player.reloadUntil>0||match.time<player.attackRecoveryUntil||
    (player.lastAttackWeapon&&match.time-player.lastShotAt<attack.interval))return;
  if(!melee&&player.ammo<=0){beginReload(match,player);return;}
  if(!melee)player.ammo--;
  player.shotsInBurst=!melee&&player.lastAttackWeapon===player.weapon&&match.time-player.lastShotAt<400?Math.min(20,player.shotsInBurst+1):0;
  player.lastShotAt=match.time;player.lastAttackWeapon=player.weapon;player.lastAttackSecondary=melee&&secondary;
  player.attackRecoveryUntil=match.time+attack.interval;player.invulnerableUntil=0;
  const ox=player.x,oy=player.y+playerEyeHeight(player),oz=player.z;
  const pellets=player.weapon==="shotgun"?8:1;
  const moving=Math.hypot(player.intent.forward,player.intent.strafe)>.05;
  const spread=melee?0:player.weapon==="shotgun"?.055:match.mode==="classic"?
    (player.weapon==="sniper"?(player.aiming?.0005:.045):player.aiming?.0015:.004)*(player.crouched?.6:1)*(moving?3:1):0;
  const recoil=match.mode==="classic"&&!melee?Math.min(.045,player.shotsInBurst*.002)*(player.aiming?.7:1)*(player.crouched?.65:1):0;
  for(let pellet=0;pellet<pellets;pellet++){
    const yaw=player.yaw+Math.sin(player.shotsInBurst*1.7)*recoil*.45+(spread?(random(match)-.5)*spread*2:0),pitch=player.pitch+recoil+(spread?(random(match)-.5)*spread*2:0);
    const dx=-Math.sin(yaw)*Math.cos(pitch),dy=Math.sin(pitch),dz=-Math.cos(yaw)*Math.cos(pitch);
    let range:number=attack.range;let victim:Player|undefined;let hitY=oy;
    for(const c of colliderGrid.along(ox,oz,dx,dz,range))range=Math.min(range,rayBox(ox,oy,oz,dx,dy,dz,c));
    for(const target of match.players) {
      if(target.id===player.id||target.health<=0)continue;
      const box={x:target.x,z:target.z,w:.76,d:.76,h:target.crouched?1.24:1.8};
      const t=rayBox(ox,oy-target.y,oz,dx,dy,dz,box);
      if(t<range){range=t;victim=target;hitY=oy+dy*t-target.y;}
    }
    event(match,melee?"melee":"shot",player,{weapon:player.weapon,secondary:melee&&secondary,endX:ox+dx*range,endY:oy+dy*range,endZ:oz+dz*range});
    if(victim)damagePlayer(match,victim,player,attack.damage*(!melee&&hitY>playerEyeHeight(victim)-.2?2:1),!melee&&hitY>playerEyeHeight(victim)-.2,!melee);
  }
}
export function applyInput(match:Match,playerId:string,raw:Partial<Input>,now:number) {
  advanceMatch(match,now);
  const player=match.players.find(p=>p.id===playerId&&!p.bot);if(!player)return;
  executeInput(match,player,raw);
}
function executeInput(match:Match,player:Player,raw:Partial<Input>) {
  const input=sanitizeInput(raw); if(input.seq<=player.lastSeq)return;
  const weaponChanged=input.weapon!==undefined&&input.weapon!==player.weapon&&player.inventory.includes(input.weapon);
  player.lastSeq=input.seq;player.lastInputAt=match.time;player.intent=input;
  player.yaw=input.yaw;player.pitch=input.pitch;
  if(input.buy){
    if(match.mode==="classic")purchase(match,player,input.buy);
    else event(match,"notice",player,{text:"The buy menu is available in classic matches."});
  }
  if(match.winner||player.health<=0){updateStance(player,ZERO_INPUT);return;}
  if(input.weapon&&!input.buy){
    if(player.inventory.includes(input.weapon))switchWeapon(player,input.weapon);
    else event(match,"notice",player,{text:"Buy this weapon during freeze time first."});
  }
  if(match.classic?.bomb.action?.playerId===player.id&&(input.reload||input.grenade||weaponChanged)){
    delete match.classic.bomb.action;player.intent.interact=false;
  }
  if(input.reload)beginReload(match,player);
  updateStance(player,input);
  if(input.grenade)throwGrenade(match,player,input.grenade);
  if(!sprinting(player,input)&&(input.shoot||(input.secondary&&player.weapon==="knife")))shoot(match,player,input.secondary===true&&player.weapon==="knife");
  if(match.mode==="classic")tickClassicState(match);
}
function botCanSee(match:Match,player:Player,target:Player):boolean {
  const ay=player.y+playerEyeHeight(player),by=target.y+(target.crouched?.7:1.06);
  if(!unobstructed(player.x,ay,player.z,target.x,by,target.z))return false;
  const dx=target.x-player.x,dy=by-ay,dz=target.z-player.z,lengthSquared=dx*dx+dy*dy+dz*dz||1;
  return !match.smokes.some(smoke=>{
    const t=clamp(((smoke.x-player.x)*dx+(smoke.y-ay)*dy+(smoke.z-player.z)*dz)/lengthSquared,0,1);
    return Math.hypot(player.x+dx*t-smoke.x,ay+dy*t-smoke.y,player.z+dz*t-smoke.z)<smoke.radius;
  });
}
function updateBot(match:Match,player:Player) {
  if(match.bots!==true||!player.bot||match.time<player.botDecisionAt)return;
  const input=decideBot(match,player,{random:()=>random(match),canSee:target=>botCanSee(match,player,target),canBuy:canBuy(match,player),eyeHeight:playerEyeHeight,weapons:WEAPONS});
  player.botDecisionAt=match.time+200+random(match)*35;
  executeInput(match,player,input);
}
function restartRound(match:Match) {
  match.round++;match.startedAt=match.time;match.endsAt=match.time+MATCH_DURATION;match.scores={blue:0,orange:0};match.winner=null;match.winnerAt=0;
  for(const p of match.players){p.kills=0;p.deaths=0;spawn(match,p);}
  event(match,"round",undefined,{text:`Round ${match.round}`});
}
export function advanceMatch(match:Match,now:number) {
  sanitizeMatch(match);
  const destination=Math.max(match.time,finite(now,match.time));
  // Requests advance at most 400 ms of motion, even after a sleeping browser or server.
  const elapsed=Math.min(400,destination-match.time);
  let remaining=elapsed;match.time=destination-elapsed;
  while(remaining>.001){
    const delta=Math.min(remaining,1000/60);remaining-=delta;match.time+=delta;
    if(match.mode==="classic")tickClassicState(match);
    else{
      if(match.winner){if(match.time-match.winnerAt>=7000)restartRound(match);else continue;}
      if(!match.exploration&&match.time>=match.endsAt){finishRound(match);continue;}
    }
    for(const p of match.players){
      if(p.health<=0){if(match.mode!=="classic"&&p.respawnAt<=match.time)spawn(match,p);else continue;}
      if(p.reloadUntil&&p.reloadUntil<=match.time){const count=Math.min(WEAPONS[p.weapon].magazine-p.ammo,p.reserve);p.ammo+=count;p.reserve-=count;p.reloadUntil=0;}
      if(p.bot)updateBot(match,p);
      const input=match.time-p.lastInputAt<INPUT_EXPIRY?p.intent:{...ZERO_INPUT};
      movePlayer(match,p,input,delta/1000);
      if(input.reload)beginReload(match,p);
      if(!sprinting(p,input)&&(input.shoot||(input.secondary&&p.weapon==="knife")))shoot(match,p,input.secondary===true&&p.weapon==="knife");
      if(match.winner)break;
    }
    if(match.mode!=="classic"||match.classic?.phase==="live")tickGrenades(match,delta/1000);
    if(match.mode==="classic")tickClassicState(match);
  }
  match.time=destination;
  if(match.mode==="classic")tickClassicState(match);
  else{
    if(!match.exploration&&!match.winner&&destination>=match.endsAt)finishRound(match);
    if(match.winner&&destination-match.winnerAt>=7000)restartRound(match);
  }
}
/** Pause local play without consuming bomb, reload, utility, reaction or round timers. */
export function shiftMatchTime(match:Match,elapsedMs:number):void {
  const delay=Math.max(0,finite(elapsedMs));if(!delay)return;
  match.time+=delay;match.startedAt+=delay;match.endsAt+=delay;if(match.winnerAt)match.winnerAt+=delay;
  for(const item of match.events)item.time+=delay;
  for(const player of match.players){
    for(const key of ['respawnAt','reloadUntil','invulnerableUntil','lastShotAt','lastInputAt','botDecisionAt','nextBotShotAt','attackRecoveryUntil','flashedUntil'] as const){
      if(player[key])player[key]+=delay;
    }
    if(player.botState)for(const key of ['plannedAt','lastProgressAt','seenAt','lastSeenAt','burstUntil','nextUtilityAt'] as const){
      if(player.botState[key])player.botState[key]+=delay;
    }
  }
  for(const grenade of match.grenades)grenade.explodeAt+=delay;
  for(const smoke of match.smokes)smoke.expiresAt+=delay;
  if(match.classic){
    if(match.classic.phaseEndsAt)match.classic.phaseEndsAt+=delay;
    if(match.classic.bomb.explodeAt)match.classic.bomb.explodeAt+=delay;
    if(match.classic.bomb.action){match.classic.bomb.action.startedAt+=delay;match.classic.bomb.action.completesAt+=delay;}
  }
}
/** No auth material is ever stored in the simulation or sent to another player. */
export function snapshot(match:Match,_playerId?:string):Match {
  void _playerId;
  sanitizeMatch(match);
  return JSON.parse(JSON.stringify(match)) as Match;
}
