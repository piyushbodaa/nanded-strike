import * as THREE from 'three';
import { createWorld, preloadWorldAssets } from './world';
import { createActor, loadActorAsset, updateActor, disposeActor, type Actor } from './actors';
import { createWeaponView } from './weapon-view';
import { createCombatEffects } from './combat-effects';
import { LOCATIONS, DEFAULT_LOCATION_ID } from './locations';
import { createMatch, createBotMatch, setBotDifficulty as setMatchBotDifficulty, addPlayer, applyInput, advanceMatch, shiftMatchTime, movePlayer, playerEyeHeight, canBuy, WEAPONS, type Weapon, type MatchMode as GameMode, type PurchaseId, type GrenadeType as GrenadeKind } from './simulation';
import { COLLIDERS, MAP_BOUNDS, ROADS, SPAWN_YAWS } from './map';
import { getPlace, PLACES, PLACE_CATEGORIES } from './places';
import { placeViewpoint } from './place-layout';
import { DEFAULT_BOT_DIFFICULTY, normalizeBotDifficulty, type BotDifficulty } from './bot-difficulty';

type Match = ReturnType<typeof createMatch>;
type Player = Match['players'][number];
export type Mode = 'lobby' | 'solo' | 'online';
export type Settings = { sensitivity: number; volume: number; quality: 'high' | 'low' };
export type HUD = {
  now: number; location:string; exploration:boolean; botMatch:boolean; watching:boolean; botDifficulty:BotDifficulty;
  spectating:string; round:number; canBuy:boolean; aim:number; scoped:boolean; crouched:boolean; gameMode:GameMode; classic:Match['classic']|null; buyOpen:boolean; selectedGrenade:GrenadeKind;
  mode: Mode; paused: boolean; player: Player | null; players: Player[];
  scores: { blue: number; orange: number }; remaining: number; room: string;
  ping: number; winner: string | null; feed: { id: string; text: string }[];
  hit: boolean; hurt: boolean; connected: boolean; scoreboard: boolean;
};
export const emptyHUD: HUD = { botDifficulty:DEFAULT_BOT_DIFFICULTY,botMatch:false,watching:false,spectating:'',round:1,canBuy:false,aim:0,scoped:false,crouched:false,gameMode:'deathmatch',classic:null,buyOpen:false,selectedGrenade:'he',now:0, location:'Bhagya Nagar', exploration:false, mode:'lobby', paused:false, player:null, players:[], scores:{blue:0,orange:0}, remaining:300, room:'',ping:0,winner:null,feed:[],hit:false,hurt:false,connected:true,scoreboard:false };

class Sound {
  ctx: AudioContext | null = null;
  volume = .35;
  unlock() { try { this.ctx ??= new AudioContext(); void this.ctx.resume(); } catch {} }
  play(kind:'shot'|'melee'|'hit'|'reload'|'step', distant = false) {
    const ctx=this.ctx; if (!ctx || !this.volume) return;
    const t=ctx.currentTime, gain=ctx.createGain(); gain.connect(ctx.destination);
    const vol=this.volume*(distant?.06:kind==='melee'?.12:.22);
    gain.gain.setValueAtTime(vol,t); gain.gain.exponentialRampToValueAtTime(.001,t+(kind==='shot'?.14:kind==='melee'?.18:.07));
    if(kind==='shot'||kind==='melee') {
      const buffer=ctx.createBuffer(1,ctx.sampleRate*(kind==='melee'?.18:.14),ctx.sampleRate), data=buffer.getChannelData(0);
      for(let i=0;i<data.length;i++) data[i]=(Math.random()*2-1)*Math.exp(-i/(data.length*.22));
      const noise=ctx.createBufferSource(); noise.buffer=buffer;
      const filter=ctx.createBiquadFilter(); filter.type=kind==='melee'?'bandpass':'lowpass'; filter.frequency.value=kind==='melee'?1400:distant?650:2500;
      if(kind==='melee')filter.frequency.exponentialRampToValueAtTime(350,t+.18);
      noise.connect(filter);filter.connect(gain);noise.start(t);
    } else {
      const osc=ctx.createOscillator();osc.type=kind==='hit'?'sine':'triangle';
      osc.frequency.setValueAtTime(kind==='hit'?900:kind==='reload'?300:70,t);
      osc.frequency.exponentialRampToValueAtTime(kind==='hit'?1400:40,t+.07);
      osc.connect(gain);osc.start(t);osc.stop(t+.08);
    }
  }
  dispose(){void this.ctx?.close();}
}

export class GameClient {
  canvas:HTMLCanvasElement; renderer:THREE.WebGLRenderer; scene=new THREE.Scene(); camera=new THREE.PerspectiveCamera(74,1,.05,850);
  world:ReturnType<typeof createWorld>; weapon:THREE.Group; weaponView:ReturnType<typeof createWeaponView>;
  combatEffects:ReturnType<typeof createCombatEffects>;
  mode:Mode='lobby'; paused=false; match:Match|null=null; playerId=''; room=''; token=''; visitingPlaceId='';
  settings:Settings={sensitivity:1,volume:.35,quality:'high'}; sound=new Sound();
  keys=new Set<string>(); yaw=0; pitch=0; shooting=false; queuedShot=false; reloading=false; jumping=false; selectedWeapon:Weapon='rifle'; seq=0;
  watching=false; watchTargetId=''; spectatorIndex=0; spectating=''; spectatingId=''; lastOwnShotAudioAt=0;
  aimLevel=0; aimBlend=0; secondary=false; queuedSecondary=false; touchCrouch=false; interacting=false; buyOpen=false;
  previousWeapon:Weapon='pistol'; selectedGrenade:GrenadeKind='he'; buyQueue:PurchaseId[]=[]; pendingGrenade:GrenadeKind|undefined; lastWheel=0;
  simulationTimer:ReturnType<typeof setInterval>; lobbyDirty=true; frame=0; lastFrame=0; lastHUD=0; pollTimer:ReturnType<typeof setTimeout>|null=null; networkGeneration=0;
  ping=0; connected=true; seenEvents=new Set<string>(); feed:{id:string,text:string,at:number}[]=[]; hitUntil=0; hurtUntil=0; previousHealth=100;
  characters=new Map<string,Actor>(); particles:{mesh:THREE.Object3D,until:number}[]=[];
  lastStep=0; pausedAt=0; scoreboard=false;
  ignoreFirstLockedMovement=false;
  touch=typeof window!=='undefined' && matchMedia('(pointer: coarse)').matches;
  touchSprint=false; touchMove={forward:0,strafe:0}; touchLook:{id:number,x:number,y:number}|null=null;
  displayPosition=new THREE.Vector3(); predicted:Player|null=null; pendingController:AbortController|null=null;
  onHUD:(hud:HUD)=>void; onError:(message:string)=>void;
  cleanup:(()=>void)[]=[];
  static async preload(){await Promise.all([loadActorAsset(),preloadWorldAssets()]);}
  constructor(canvas:HTMLCanvasElement,onHUD:(hud:HUD)=>void,onError:(message:string)=>void) {
    this.canvas=canvas;this.onHUD=onHUD;this.onError=onError;
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});

    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1;
    this.camera.rotation.order='YXZ';this.scene.add(this.camera);this.world=createWorld(this.scene);this.combatEffects=createCombatEffects(this.scene);
    this.weaponView=createWeaponView(this.camera);this.weapon=this.weaponView.group;
    this.bind();this.resize();
    Object.defineProperty(window,'__NANDED_DEBUG__',{configurable:true,get:()=>({mode:this.mode,botMatch:this.match?.bots===true,botDifficulty:normalizeBotDifficulty(this.match?.botDifficulty),watching:this.watching,spectating:this.spectating,spectatingId:this.spectatingId,round:this.match?.round,scores:this.match?.scores,events:this.match?.events,visitingPlaceId:this.visitingPlaceId,world:this.world.stats,location:this.location,locationId:this.match?.locationId,exploration:this.match?.exploration??false,pixelRatio:this.renderer.getPixelRatio(),animations:[...this.characters.values()].map(a=>a.animationState),phase:this.paused?'paused':this.mode==='lobby'?'lobby':'playing',playerId:this.playerId,roomCode:this.room,selectedWeapon:this.selectedWeapon,weapon:this.me?.weapon,aim:this.aimLevel,aimBlend:this.aimBlend,fov:this.camera.fov,cameraY:this.camera.position.y,shooting:this.shooting,buyOpen:this.buyOpen,gameMode:this.match?.mode,classic:this.match?.classic,grenades:this.match?.grenades,smokes:this.match?.smokes,visibleWeapon:this.weapon.children.filter(child=>child.visible).map(child=>child.name),lastAttackAt:this.me?.lastShotAt,reloadUntil:this.me?.reloadUntil,localPlayer:this.me?{x:this.me.x,z:this.me.z,health:this.me.health,ammo:this.me.ammo,weapon:this.me.weapon,crouched:this.me.crouched,aiming:this.me.aiming,walking:this.me.walking,money:this.me.money,armor:this.me.armor,defuseKit:this.me.defuseKit,flashedUntil:this.me.flashedUntil,inventory:this.me.inventory,grenades:this.me.grenades,lastAttackSecondary:this.me.lastAttackSecondary}:null,players:this.match?.players.map(p=>({id:p.id,name:p.name,x:p.x,z:p.z,kills:p.kills,deaths:p.deaths,bot:p.bot,team:p.team,weapon:p.weapon,health:p.health,crouched:p.crouched,aiming:p.aiming,money:p.money})),yaw:this.yaw,pitch:this.pitch,touchSprint:this.touchSprint,ammo:this.me?.ammo,health:this.me?.health,renderer:this.renderer.info.render})});
    this.simulationTimer=setInterval(()=>this.tick(),1000/60);
    this.frame=requestAnimationFrame(this.animate);
  }
  get location(){const p=this.me,place=getPlace(this.visitingPlaceId);if(p&&place&&Math.hypot(p.x-place.x,p.z-place.z)<90)return place.name;if(p)return [...LOCATIONS].sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0].name;return LOCATIONS.find(l=>l.id===this.match?.locationId)?.name??LOCATIONS[0].name;}
  get me(){
    if(this.watching){const bots=this.match?.players.filter(p=>p.bot)??[],alive=bots.filter(p=>p.health>0),pool=alive.length?alive:bots;const selected=pool.find(p=>p.id===this.watchTargetId)??pool[this.spectatorIndex%Math.max(1,pool.length)]??null;this.watchTargetId=selected?.id??'';return selected;}
    return this.match?.players.find(p=>p.id===this.playerId)??null;
  }
  cycleSpectator(){
    if(this.watching){const bots=this.match?.players.filter(p=>p.bot)??[],alive=bots.filter(p=>p.health>0),pool=alive.length?alive:bots;this.spectatorIndex=(pool.findIndex(p=>p.id===this.watchTargetId)+1)%Math.max(1,pool.length);this.watchTargetId=pool[this.spectatorIndex]?.id??'';}
    else this.spectatorIndex++;
    this.resetControls();this.emitHUD();
  }
  private listen(target:EventTarget,event:string,handler:EventListener,options?:AddEventListenerOptions){target.addEventListener(event,handler,options);this.cleanup.push(()=>target.removeEventListener(event,handler,options));}
  private bind(){
    this.listen(window,'resize',()=>{this.resetControls();this.resize();});
    this.listen(window,'pagehide',()=>{if(this.mode==='online')this.leave();});
    this.listen(document,'pointerlockchange',()=>{if(this.mode!=='lobby'&&!this.touch&&!this.watching){this.ignoreFirstLockedMovement=document.pointerLockElement===this.canvas;if(!this.buyOpen)this.setPaused(document.pointerLockElement!==this.canvas);}});
    this.listen(document,'pointerlockerror',()=>{if(this.mode!=='lobby')this.setPaused(true);});
    this.listen(window,'blur',()=>{this.resetControls();if(this.mode!=='lobby')this.pause();});
    this.listen(document,'visibilitychange',()=>{if(document.hidden&&this.mode!=='lobby')this.pause();});
    this.listen(document,'mousemove',((e:MouseEvent)=>{if(document.pointerLockElement===this.canvas&&!this.paused&&!this.watching){
      // Chromium may report the cursor's recentering delta immediately after a
      // menu hands control back. It must not turn a selected landmark into sky.
      if(this.ignoreFirstLockedMovement){this.ignoreFirstLockedMovement=false;return;}
      this.yaw-=e.movementX*.002*this.settings.sensitivity*this.aimSensitivity;this.pitch=THREE.MathUtils.clamp(this.pitch-e.movementY*.002*this.settings.sensitivity*this.aimSensitivity,-1.45,1.45);
    }}) as EventListener);
    this.listen(window,'keydown',((e:KeyboardEvent)=>{
      if(this.mode==='lobby'||e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement||e.target instanceof HTMLTextAreaElement)return;
      if(e.code==='Escape'){if(this.buyOpen)this.toggleBuy(false);else this.pause();return;}
      if(e.code==='KeyB'&&!e.repeat&&!this.paused){this.toggleBuy();return;}
      if(this.paused||this.buyOpen)return;
      if(['Space','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','AltLeft','AltRight','ControlLeft','ControlRight'].includes(e.code))e.preventDefault();
      this.keys.add(e.code);
      if(e.code==='KeyR'&&!e.repeat)this.reload();
      if(e.code==='Space'&&!e.repeat)this.jumping=true;
      if(e.code==='Digit1')this.selectWeapon(this.ownedWeapons.find(w=>!['pistol','knife'].includes(w))??'pistol');
      if(e.code==='Digit2')this.selectWeapon('pistol');if(e.code==='Digit3')this.selectWeapon('knife');
      if(e.code==='KeyQ'&&!e.repeat)this.selectWeapon(this.previousWeapon);
      if(e.code==='KeyG'&&!e.repeat)this.throwGrenade();
      if(e.code==='Digit4'&&!e.repeat){const kinds:GrenadeKind[]=['he','flash','smoke'];this.selectGrenade(kinds[(kinds.indexOf(this.selectedGrenade)+1)%3]);}
      if(e.code==='Tab'){this.scoreboard=true;this.emitHUD();}
    }) as EventListener);
    this.listen(window,'keyup',((e:KeyboardEvent)=>{this.keys.delete(e.code);if(e.code==='Tab'){this.scoreboard=false;this.emitHUD();}}) as EventListener);
    this.listen(this.canvas,'mousedown',((e:MouseEvent)=>{
      if(this.mode==='lobby'||this.paused||this.buyOpen)return;
      if(this.watching||this.me&&this.me.health<=0){if(e.button===0)this.cycleSpectator();return;}
      if(e.button===0){this.shooting=true;this.queuedShot=true;}
      if(e.button===2){e.preventDefault();if(this.selectedWeapon==='knife'){this.secondary=true;this.queuedSecondary=true;}else this.toggleAim();}
    }) as EventListener);
    this.listen(window,'mouseup',((e:MouseEvent)=>{if(e.button===0)this.shooting=false;if(e.button===2)this.secondary=false;}) as EventListener);
    this.listen(this.canvas,'wheel',((e:WheelEvent)=>{
      if(this.mode==='lobby'||this.paused||this.buyOpen)return;e.preventDefault();
      const now=performance.now();if(now-this.lastWheel<150)return;this.lastWheel=now;
      const slots=this.ownedWeapons;this.selectWeapon(slots[(slots.indexOf(this.selectedWeapon)+(e.deltaY>0?1:-1)+slots.length)%slots.length]);
    }) as EventListener,{passive:false});
    this.listen(this.canvas,'contextmenu',e=>e.preventDefault());
    this.listen(this.canvas,'touchstart',((e:TouchEvent)=>{if(this.mode==='lobby'||this.paused||this.buyOpen||this.touchLook)return;if(this.watching||this.me&&this.me.health<=0){this.cycleSpectator();e.preventDefault();return;}const t=e.changedTouches[0];this.touchLook={id:t.identifier,x:t.clientX,y:t.clientY};e.preventDefault();}) as EventListener,{passive:false});
    this.listen(this.canvas,'touchmove',((e:TouchEvent)=>{if(!this.touchLook)return;const t=Array.from(e.changedTouches).find(t=>t.identifier===this.touchLook!.id);if(!t)return;this.yaw-=(t.clientX-this.touchLook.x)*.006*this.settings.sensitivity*this.aimSensitivity;this.pitch=THREE.MathUtils.clamp(this.pitch-(t.clientY-this.touchLook.y)*.006*this.settings.sensitivity*this.aimSensitivity,-1.45,1.45);this.touchLook={id:t.identifier,x:t.clientX,y:t.clientY};e.preventDefault();}) as EventListener,{passive:false});
    const releaseLook=((e:TouchEvent)=>{if(Array.from(e.changedTouches).some(t=>t.identifier===this.touchLook?.id))this.touchLook=null;}) as EventListener;
    this.listen(this.canvas,'touchend',releaseLook);this.listen(this.canvas,'touchcancel',releaseLook);
  }
  resize(){this.lobbyDirty=true;const w=window.innerWidth,h=window.innerHeight;this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,this.settings.quality==='high'?2:1.25,Math.sqrt(4_000_000/(w*h))));this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
  updateSettings(settings:Settings){this.settings=settings;this.sound.volume=settings.volume;this.renderer.shadowMap.enabled=settings.quality==='high';this.resize();}
  get aimSensitivity(){return Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2))/Math.tan(THREE.MathUtils.degToRad(37));}
  get ownedWeapons():Weapon[]{return this.me?.inventory??['rifle','pistol','knife'];}
  get controlsActive(){return this.mode!=='lobby'&&!this.watching&&!this.paused&&!this.buyOpen&&(this.me?.health??0)>0;}
  resetControls(){this.keys.clear();this.shooting=false;this.queuedShot=false;this.reloading=false;this.jumping=false;this.secondary=false;this.queuedSecondary=false;this.aimLevel=0;this.touchCrouch=false;this.interacting=false;this.touchMove={forward:0,strafe:0};this.touchSprint=false;this.touchLook=null;this.pendingGrenade=undefined;}
  toggleAim(){if(!this.controlsActive||this.me?.reloadUntil)return;if(this.selectedWeapon==='knife'){this.queuedSecondary=true;return;}const scoped=this.selectedWeapon==='rifle'||this.selectedWeapon==='sniper';this.aimLevel=(this.aimLevel+1)%(scoped?3:2);this.emitHUD();}
  toggleCrouch(){if(this.controlsActive){this.touchCrouch=!this.touchCrouch;this.emitHUD();}}
  reload(){if(this.controlsActive&&this.selectedWeapon!=='knife'){this.reloading=true;this.aimLevel=0;}}
  setInteracting(held:boolean){this.interacting=held&&this.controlsActive;}
  setInteract(held:boolean){this.setInteracting(held);}
  selectGrenade(kind:GrenadeKind){this.selectedGrenade=kind;this.emitHUD();}
  throwGrenade(){if(this.controlsActive){this.pendingGrenade=this.selectedGrenade;this.aimLevel=0;}}
  buy(item:PurchaseId){if((this.mode==='online'||this.match?.bots)&&!this.watching&&this.buyOpen&&this.buyQueue.length<8)this.buyQueue.push(item);}
  toggleBuy(open=!this.buyOpen){if(this.mode==='lobby'||this.watching||this.match?.mode!=='classic')return;this.resetControls();this.buyOpen=open;if(open){this.setPaused(false);if(document.pointerLockElement)document.exitPointerLock();}else this.resume();this.emitHUD();}
  selectWeapon(weapon:Weapon){if(this.watching||!this.ownedWeapons.includes(weapon))return;if(this.selectedWeapon!==weapon)this.previousWeapon=this.selectedWeapon;this.selectedWeapon=weapon;this.reloading=false;this.aimLevel=0;this.secondary=false;this.queuedSecondary=false;}

  startSolo(name:string,locationId=DEFAULT_LOCATION_ID,exploration=false){
    this.leave();const location=LOCATIONS.find(l=>l.id===locationId)??LOCATIONS[0],now=Date.now();
    this.match=createMatch(now,{locationId:location.id,start:location,exploration});const p=addPlayer(this.match,name||'Operator','blue');this.playerId=p.id;
    if(exploration){p.x=location.x;p.z=location.z;p.yaw=location.yaw;}
    this.mode='solo';this.setupPlayer();if(exploration)this.pitch=location.pitch??0;this.sound.unlock();this.resume();this.emitHUD();
  }
  startBots(name:string,locationId=DEFAULT_LOCATION_ID,gameMode:GameMode='classic',team:'blue'|'orange'|'spectator'='blue',difficulty:BotDifficulty=DEFAULT_BOT_DIFFICULTY){
    this.leave();const location=LOCATIONS.find(l=>l.id===locationId)??LOCATIONS[0];
    const result=createBotMatch(Date.now(),{name:name||'Operator',team,locationId:location.id,start:location,mode:gameMode,botDifficulty:normalizeBotDifficulty(difficulty)});
    this.match=result.match;this.playerId=result.playerId??'';this.watching=team==='spectator';
    this.mode='solo';this.setupPlayer();this.sound.unlock();this.resume();this.emitHUD();
  }
  setBotDifficulty(difficulty:BotDifficulty){
    if(this.mode!=='solo'||!this.match?.bots)return;
    setMatchBotDifficulty(this.match,normalizeBotDifficulty(difficulty));this.emitHUD();
  }
  visitPlace(placeId:string,name:string){
    if(this.mode==='online')return;
    const place=getPlace(placeId),view=placeViewpoint(placeId);
    if(!place||!view){this.onError('A safe approach to this place could not be found.');return;}
    this.startSolo(name,place.sectorId,true);
    const p=this.me;if(!p)return;
    p.x=view.x;p.z=view.z;p.yaw=view.yaw;p.pitch=view.pitch;p.intent.yaw=view.yaw;p.intent.pitch=view.pitch;
    this.setupPlayer();this.pitch=view.pitch;this.visitingPlaceId=place.id;this.emitHUD();
  }
  async startOnline(action:'create'|'join'|'quickjoin',name:string,room?:string,locationId=DEFAULT_LOCATION_ID,mode:GameMode='classic'){
    this.leave();const generation=++this.networkGeneration;
    const result=await this.request({action,name:name||'Operator',room,locationId,mode});if(generation!==this.networkGeneration)return;
    this.match=result.state;this.playerId=result.playerId;this.token=result.token;this.room=result.room;this.mode='online';this.setupPlayer();
    this.sound.unlock();this.setPaused(true);this.emitHUD();this.poll();
  }
  setupPlayer(){const p=this.me;if(!p)return;this.weaponView.resetDraw();this.yaw=p.yaw;this.pitch=0;this.resetControls();this.selectedWeapon=p.weapon;this.previousWeapon='knife';this.seq=0;this.predicted={...p};this.displayPosition.set(p.x,p.y+playerEyeHeight(p),p.z);this.previousHealth=p.health;this.seenEvents=new Set(this.match?.events.map(event=>String(event.id)));this.feed=[];this.connected=true;this.weapon.visible=true;}
  input(){const active=this.controlsActive;return {
    forward:active?this.touchMove.forward+Number(this.keys.has('KeyW')||this.keys.has('ArrowUp'))-Number(this.keys.has('KeyS')||this.keys.has('ArrowDown')):0,
    strafe:active?this.touchMove.strafe+Number(this.keys.has('KeyD')||this.keys.has('ArrowRight'))-Number(this.keys.has('KeyA')||this.keys.has('ArrowLeft')):0,
    yaw:this.yaw,pitch:this.pitch,shoot:active&&(this.shooting||this.queuedShot),reload:active&&this.reloading,
    sprint:active&&!(this.shooting||this.queuedShot)&&(this.keys.has('AltLeft')||this.keys.has('AltRight')||this.touchSprint),
    jump:active&&this.jumping,aim:active&&this.aimLevel>0&&!this.reloading,
    crouch:active&&(this.touchCrouch||this.keys.has('ControlLeft')||this.keys.has('ControlRight')),
    walk:active&&(this.keys.has('ShiftLeft')||this.keys.has('ShiftRight')),
    secondary:active&&(this.secondary||this.queuedSecondary),interact:active&&(this.interacting||this.keys.has('KeyE')),
    buy:this.buyQueue[0],grenade:active?this.pendingGrenade:undefined,weapon:this.selectedWeapon,seq:++this.seq};}
  clearQueuedInput(){this.reloading=false;this.jumping=false;this.queuedShot=false;this.queuedSecondary=false;this.pendingGrenade=undefined;this.buyQueue.shift();}
  async request(body:Record<string,unknown>){
    const response=await fetch('/api/game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(6000)});
    const data=await response.json() as {error?:string;state:Match;playerId:string;token:string;room:string};if(!response.ok)throw new Error(data.error||'The room could not be reached. Please try again.');return data;
  }
  async poll(){
    if(this.mode!=='online')return;const generation=this.networkGeneration,started=performance.now();
    try{
      const input=this.input();this.clearQueuedInput();
      const data=await this.request({action:'input',room:this.room,token:this.token,input});
      if(generation!==this.networkGeneration)return;
      const previous=this.me;this.match=data.state;this.ping=Math.round(performance.now()-started);this.connected=true;
      const p=this.me;
      if(p){
        if(!this.ownedWeapons.includes(this.selectedWeapon)||previous&&p.inventory.join(',')!==previous.inventory.join(','))this.selectWeapon(p.weapon);
        if(p.health<=0||previous&&previous.health<=0)this.resetControls();
        if(!this.predicted||!previous||p.health<=0||previous.health<=0||Math.hypot(p.x-this.predicted.x,p.z-this.predicted.z)>3)this.predicted={...p};
        else this.predicted={...p,x:THREE.MathUtils.lerp(this.predicted.x,p.x,.3),z:THREE.MathUtils.lerp(this.predicted.z,p.z,.3)};
      }
    }catch(error){if(generation!==this.networkGeneration)return;this.connected=false;if(error instanceof Error&&/expired|not found|invalid token|removed|full/i.test(error.message)){this.onError(error.message);this.leave();return;}}
    if(generation===this.networkGeneration&&this.mode==='online')this.pollTimer=setTimeout(()=>this.poll(),Math.max(20,125-(performance.now()-started)));
  }
  setPaused(value:boolean){
    this.resetControls();if(this.paused===value)return;this.paused=value;
    if(value)this.pausedAt=Date.now();
    else if(this.mode==='solo'&&this.match)shiftMatchTime(this.match,Math.max(0,Date.now()-this.pausedAt));
    this.emitHUD();
  }
  pause(){if(this.mode==='lobby')return;this.buyOpen=false;this.setPaused(true);if(document.pointerLockElement)document.exitPointerLock();}
  resume(){if(this.mode==='lobby')return;this.sound.unlock();if(this.touch||this.watching){this.setPaused(false);return;}const promise=this.canvas.requestPointerLock();if(promise&&typeof promise.catch==='function')promise.catch(()=>this.setPaused(true));}
  leave(){
    const oldRoom=this.room,oldToken=this.token;
    if(this.mode==='online'&&oldToken)void fetch('/api/game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'leave',room:oldRoom,token:oldToken}),keepalive:true}).catch(()=>{});
    this.resetControls();this.buyQueue=[];this.buyOpen=false;this.watching=false;this.watchTargetId='';this.spectatorIndex=0;this.spectating='';this.spectatingId='';this.aimBlend=0;this.camera.fov=74;this.camera.updateProjectionMatrix();
    this.networkGeneration++;if(this.pollTimer)clearTimeout(this.pollTimer);this.pollTimer=null;this.mode='lobby';this.visitingPlaceId='';this.lobbyDirty=true;this.paused=false;this.queuedShot=false;this.match=null;this.playerId='';this.room='';this.token='';this.keys.clear();this.shooting=false;this.touchMove={forward:0,strafe:0};this.touchSprint=false;this.touchLook=null;this.scoreboard=false;this.weapon.visible=false;
    for(const p of this.characters.values()){this.scene.remove(p.group);disposeActor(p);}this.characters.clear();
    for(const particle of this.particles){this.scene.remove(particle.mesh);this.disposeObject(particle.mesh);}this.particles=[];
    if(document.pointerLockElement===this.canvas)document.exitPointerLock();this.emitHUD();
  }
  updateCharacters(dt:number){
    if(!this.match)return;const ids=new Set(this.match.players.map(p=>p.id));
    for(const[id,actor]of this.characters){if(!ids.has(id)){this.scene.remove(actor.group);disposeActor(actor);this.characters.delete(id);}}
    for(const p of this.match.players){if(p.id===this.playerId)continue;
      let actor=this.characters.get(p.id);
      if(actor&&actor.group.userData.team!==p.team){this.scene.remove(actor.group);disposeActor(actor);this.characters.delete(p.id);actor=undefined;}
      if(!actor){actor=createActor(p.team);actor.group.userData.team=p.team;actor.group.position.set(p.x,p.y,p.z);this.scene.add(actor.group);this.characters.set(p.id,actor);}
      const speed=dt>0?Math.min(7.2,Math.hypot(actor.group.position.x-p.x,actor.group.position.z-p.z)/dt):0;
      const attackAge=p.lastAttackWeapon===p.weapon?this.match.time-p.lastShotAt:1000;
      updateActor(actor,{x:p.x,y:p.y,z:p.z,yaw:p.yaw,pitch:p.pitch,speed,shooting:attackAge<(p.weapon==='knife'?380:160),attackAge,dead:p.health<=0,reloading:p.reloadUntil>this.match.time,weapon:p.weapon,crouched:p.crouched,secondary:p.lastAttackSecondary},dt);actor.group.visible=p.id!==this.spectatingId;
    }
  }
  events(now:number){
    if(!this.match)return;
    for(const event of this.match.events){const id=String(event.id);if(this.seenEvents.has(id))continue;this.seenEvents.add(id);
      if(event.type==='shot'){
        const p=this.match.players.find(p=>p.id===event.playerId);if(!p)continue;
        if(p.id===this.playerId){if(event.time!==this.lastOwnShotAudioAt)this.sound.play('shot');this.lastOwnShotAudioAt=event.time;}
        else if(this.me&&Math.hypot(p.x-this.me.x,p.z-this.me.z)<28){this.sound.play('shot',true);const origin=new THREE.Vector3(event.x,event.y,event.z),end=new THREE.Vector3(event.endX??event.x,event.endY??event.y,event.endZ??event.z);const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([origin,end]),new THREE.LineBasicMaterial({color:'#ffce71',transparent:true,opacity:.45}));this.scene.add(line);this.particles.push({mesh:line,until:now+75});}
      }
      if(event.type==='explosion'){
        const blast=new THREE.Mesh(new THREE.SphereGeometry(1.2,12,8),new THREE.MeshBasicMaterial({color:'#ffc26d',transparent:true,opacity:.55,depthWrite:false}));blast.position.set(event.x,event.y,event.z);this.scene.add(blast);this.particles.push({mesh:blast,until:now+180});if(this.me&&Math.hypot(event.x-this.me.x,event.z-this.me.z)<70)this.sound.play('shot',true);
      }
      if(event.type==='melee'){
        const own=event.playerId===this.playerId;
        if(own||(this.me&&Math.hypot(event.x-this.me.x,event.z-this.me.z)<8))this.sound.play('melee',!own);
      }
      if(event.type==='respawn'&&event.playerId===this.playerId&&this.me){this.yaw=this.me.yaw;this.pitch=0;this.resetControls();this.selectedWeapon=this.me.weapon;}
      if((event.type==='notice'||event.type==='purchase'||event.type==='plant'||event.type==='defuse'||event.type==='bomb'||event.type==='round')&&event.text&&(!['notice','purchase'].includes(event.type)||event.playerId===this.playerId)){this.feed.push({id,text:event.text,at:now});}
      if(event.type==='reload'&&event.playerId===this.playerId)this.sound.play('reload');
      if(event.type==='hit'&&event.playerId===this.playerId){this.hitUntil=now+170;this.sound.play('hit');}
      if(event.type==='kill'){
        const killer=this.match.players.find(p=>p.id===event.playerId),victim=this.match.players.find(p=>p.id===event.targetId);
        this.feed.push({id,text:`${killer?.name||'Operator'}  ›  ${victim?.name||'Operator'}`,at:now});if(event.playerId===this.playerId){this.hitUntil=now+300;this.sound.play('hit');}
      }
    }
    if(this.seenEvents.size>500)this.seenEvents=new Set(this.match.events.map(e=>String(e.id)));
    this.feed=this.feed.filter(f=>now-f.at<5000).slice(-4);
    if(this.me&&this.me.health<this.previousHealth)this.hurtUntil=now+300;this.previousHealth=this.me?.health??100;
    for(let i=this.particles.length-1;i>=0;i--)if(this.particles[i].until<now){this.scene.remove(this.particles[i].mesh);this.disposeObject(this.particles[i].mesh);this.particles.splice(i,1);}
  }
  // Simulation remains responsive when GPU rendering misses a frame.
  tick(){
    if(this.mode!=='solo'||this.paused||!this.match||!this.me)return;
    const previousHealth=this.me.health,previousInventory=this.me.inventory.join(','),round=this.match.round,now=Date.now();
    if(this.watching){advanceMatch(this.match,now);return;}
    applyInput(this.match,this.playerId,this.input(),now);
    const p=this.me;
    if(p&&(!this.ownedWeapons.includes(this.selectedWeapon)||p.inventory.join(',')!==previousInventory))this.selectWeapon(p.weapon);
    if(p&&p.health>0&&(previousHealth<=0||round!==this.match.round)){
      this.yaw=p.yaw=(this.match.spawnYaws??SPAWN_YAWS)[p.team];this.pitch=p.pitch=0;
      p.intent.yaw=this.yaw;p.intent.pitch=0;this.resetControls();this.selectedWeapon=p.weapon;
    }
    this.clearQueuedInput();
  }
  animate=(t:number)=>{
    const dt=Math.min((t-this.lastFrame)/1000,.05)||.016;this.lastFrame=t;const now=Date.now();
    if(this.mode==='lobby'){
      const location=LOCATIONS[0];this.camera.position.set(location.x-55,62,location.z+70);this.camera.lookAt(location.x+25,0,location.z-5);this.weapon.visible=false;
    }else if(this.match&&this.me){
      const input=this.input();
      const p=this.me;
      if(p){
        if(this.mode==='online'&&this.predicted&&p.health>0&&!this.paused&&this.connected&&!this.match.winner){this.predicted.yaw=input.yaw;this.predicted.pitch=input.pitch;movePlayer(this.match,this.predicted,input,dt);}
        const teammates=this.match.mode==='classic'&&p.health<=0?this.match.players.filter(teammate=>teammate.id!==p.id&&teammate.team===p.team&&teammate.health>0):[];
        const spectator=this.watching?p:teammates.length?teammates[this.spectatorIndex%teammates.length]:null;this.spectating=spectator?.name??'';this.spectatingId=spectator?.id??'';
        const visual=spectator??(this.mode==='online'&&this.predicted?this.predicted:p);
        const target=new THREE.Vector3(visual.x,visual.y+playerEyeHeight(visual),visual.z);
        if(p.health<=0&&!spectator)target.y=.6;
        if(this.mode==='solo')this.displayPosition.copy(target);else this.displayPosition.lerp(target,1-Math.exp(-dt*22));this.camera.position.copy(this.displayPosition);
        this.camera.rotation.set(spectator?.pitch??this.pitch,spectator?.yaw??this.yaw,0,'YXZ');
        if(p.health<=0||p.reloadUntil>0)this.aimLevel=0;
        const aiming=this.controlsActive&&this.aimLevel>0&&p.weapon!=='knife'&&!p.reloadUntil;
        this.aimBlend=THREE.MathUtils.lerp(this.aimBlend,aiming?1:0,1-Math.exp(-dt*18));
        const scoped=p.weapon==='rifle'||p.weapon==='sniper';
        const zoom=scoped?(this.aimLevel===2?4:2):1.3;
        const aimedFov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(37))/zoom));
        this.camera.fov=THREE.MathUtils.lerp(74,aimedFov,this.aimBlend);this.camera.updateProjectionMatrix();
        const moving=!this.watching&&!this.paused&&(this.match.mode!=='classic'||this.match.classic?.phase==='live')&&(Math.abs(input.forward)+Math.abs(input.strafe)>0);
        const viewed=spectator??p;
        this.weaponView.update({weapon:viewed.weapon,time:this.match.time,shotAt:viewed.lastAttackWeapon===viewed.weapon?viewed.lastShotAt:0,reloadUntil:viewed.reloadUntil,reloadDuration:WEAPONS[viewed.weapon].reload,speed:moving?(input.sprint?7.2:4.8):0,sprint:moving&&input.sprint&&!input.aim&&!input.crouch&&!input.walk,alive:(spectator??p).health>0,aim:this.aimBlend,secondary:viewed.lastAttackSecondary},this.paused?0:dt);
        if(scoped&&this.aimBlend>.92)this.weapon.visible=false;
        if(moving&&!input.walk&&!input.crouch&&t-this.lastStep>360&&p.health>0){this.sound.play('step');this.lastStep=t;}
      }
      this.updateCharacters(this.paused?0:dt);this.events(now);
    }
    this.world.update(t/1000,this.camera.position);
    this.combatEffects.update(this.match,this.camera,now);
    if(t-this.lastHUD>90){this.emitHUD();this.lastHUD=t;}
    if(this.mode!=='lobby'||this.lobbyDirty){this.renderer.render(this.scene,this.camera);this.lobbyDirty=false;}this.frame=requestAnimationFrame(this.animate);
  };
  emitHUD(){const now=Date.now();this.onHUD({botMatch:this.match?.bots===true,botDifficulty:normalizeBotDifficulty(this.match?.botDifficulty),watching:this.watching,spectating:this.spectating,round:this.match?.round??1,canBuy:!this.watching&&!!this.match&&!!this.me&&canBuy(this.match,this.me),aim:this.aimLevel,scoped:this.aimBlend>.92&&(this.me?.weapon==='rifle'||this.me?.weapon==='sniper'),crouched:!!this.me?.crouched,gameMode:this.match?.mode??'deathmatch',classic:this.match?.classic??null,buyOpen:this.buyOpen,selectedGrenade:this.selectedGrenade,now,location:this.location,exploration:this.match?.exploration??false,mode:this.mode,paused:this.paused,player:this.me?{...this.me}:null,players:this.match?.players.map(p=>({...p}))??[],scores:this.match?.scores??{blue:0,orange:0},remaining:Math.max(0,Math.ceil(((this.match?.classic?.phaseEndsAt??this.match?.endsAt??now+300000)-(this.mode==='solo'&&this.paused?this.pausedAt:now))/1000)),room:this.room,ping:this.ping,winner:this.match?.winner??null,feed:this.feed.map(({id,text})=>({id,text})),hit:now<this.hitUntil,hurt:now<this.hurtUntil,connected:this.connected,scoreboard:this.scoreboard});}
  drawMinimap(canvas:HTMLCanvasElement,players:Player[]=[],selfId=''){
    const ctx=canvas.getContext('2d');if(!ctx)return;
    const w=canvas.width,h=canvas.height,me=players.find(p=>p.id===selfId);
    const scale=me?Math.min(w,h)/180:Math.min(w/(MAP_BOUNDS.maxX-MAP_BOUNDS.minX+90),h/(MAP_BOUNDS.maxZ-MAP_BOUNDS.minZ+90));
    const cx=me?.x??0,cz=me?.z??0,px=(x:number)=>(x-cx)*scale+w/2,pz=(z:number)=>(z-cz)*scale+h/2;
    ctx.fillStyle='#1b292c';ctx.fillRect(0,0,w,h);
    for(const road of ROADS){ctx.strokeStyle=['primary','secondary','tertiary'].includes(road.kind)?'#6c7875':'#455659';ctx.lineWidth=Math.max(.6,road.width*scale);ctx.lineJoin='round';ctx.beginPath();road.points.forEach((p,i)=>{if(i===0)ctx.moveTo(px(p.x),pz(p.z));else ctx.lineTo(px(p.x),pz(p.z));});ctx.stroke();}
    ctx.fillStyle='#889187';
    for(const c of COLLIDERS){if(px(c.x+c.w/2)<0||px(c.x-c.w/2)>w||pz(c.z+c.d/2)<0||pz(c.z-c.d/2)>h)continue;
      if(c.polygon){ctx.beginPath();c.polygon.forEach((p,i)=>i?ctx.lineTo(px(p.x),pz(p.z)):ctx.moveTo(px(p.x),pz(p.z)));ctx.closePath();ctx.fill();}
      else ctx.fillRect(px(c.x-c.w/2),pz(c.z-c.d/2),c.w*scale,c.d*scale);
    }
    for(const site of this.match?.classic?.sites??[]){const x=px(site.x),y=pz(site.z);ctx.strokeStyle='#ffd17b';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,Math.max(5,site.radius*scale),0,Math.PI*2);ctx.stroke();ctx.fillStyle='#ffd17b';ctx.font='bold 12px sans-serif';ctx.fillText(site.id,x+6,y-6);}
    const bomb=this.match?.classic?.bomb;if(bomb&&(bomb.status==='planted'||bomb.status==='dropped'&&me?.team==='orange')){ctx.fillStyle='#ff674c';ctx.fillRect(px(bomb.x)-3,pz(bomb.z)-3,6,6);}
    if(me)for(const place of PLACES){const x=px(place.x),z=pz(place.z);if(x<3||x>w-3||z<3||z>h-3)continue;ctx.fillStyle=PLACE_CATEGORIES.find(c=>c.id===place.category)!.color;ctx.beginPath();ctx.arc(x,z,place.id===this.visitingPlaceId?4:1.8,0,Math.PI*2);ctx.fill();if(place.id===this.visitingPlaceId){ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke();}}
    if(!me){ctx.font='bold 10px sans-serif';for(const location of LOCATIONS){ctx.fillStyle='#e9b56e';ctx.beginPath();ctx.arc(px(location.x),pz(location.z),3,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f7f3e9';ctx.fillText(location.name,Math.min(w-125,px(location.x)+6),pz(location.z)-5);}}
    for(const p of players){if(p.health<=0||!this.watching&&p.id!==selfId&&me&&p.team!==me.team)continue;
      ctx.fillStyle=p.id===selfId?'#fff':p.team==='blue'?'#70c4d5':'#e9a564';ctx.beginPath();ctx.arc(px(p.x),pz(p.z),p.id===selfId?5:3.5,0,Math.PI*2);ctx.fill();
      if(p.id===selfId){ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px(p.x),pz(p.z));ctx.lineTo(px(p.x-Math.sin(this.watching?p.yaw:this.yaw)*8),pz(p.z-Math.cos(this.watching?p.yaw:this.yaw)*8));ctx.stroke();}
    }
    ctx.fillStyle='#dce9e5';ctx.font='bold 11px sans-serif';ctx.fillText('N ↑',w-30,17);
  }
  drawPlaceMap(canvas:HTMLCanvasElement,placeId?:string){
    const ctx=canvas.getContext('2d');if(!ctx)return;
    const selected=getPlace(placeId),w=canvas.width,h=canvas.height;
    const scale=selected?Math.min(w/340,h/250):Math.min(w/(MAP_BOUNDS.maxX-MAP_BOUNDS.minX+100),h/(MAP_BOUNDS.maxZ-MAP_BOUNDS.minZ+100));
    const px=(x:number)=>(x-(selected?.x??0))*scale+w/2,pz=(z:number)=>(z-(selected?.z??0))*scale+h/2;
    ctx.fillStyle='#152b2b';ctx.fillRect(0,0,w,h);
    for(const road of ROADS){ctx.strokeStyle='#526963';ctx.lineWidth=Math.max(1,road.width*scale);ctx.lineJoin='round';ctx.beginPath();road.points.forEach((p,i)=>i?ctx.lineTo(px(p.x),pz(p.z)):ctx.moveTo(px(p.x),pz(p.z)));ctx.stroke();}
    ctx.fillStyle='#8a9380';
    for(const b of COLLIDERS){if(px(b.x+b.w/2)<0||px(b.x-b.w/2)>w||pz(b.z+b.d/2)<0||pz(b.z-b.d/2)>h)continue;
      if(b.polygon){ctx.beginPath();b.polygon.forEach((p,i)=>i?ctx.lineTo(px(p.x),pz(p.z)):ctx.moveTo(px(p.x),pz(p.z)));ctx.closePath();ctx.fill();}
      else ctx.fillRect(px(b.x-b.w/2),pz(b.z-b.d/2),b.w*scale,b.d*scale);
    }
    const visible=PLACES.filter(p=>px(p.x)>8&&px(p.x)<w-8&&pz(p.z)>8&&pz(p.z)<h-8);
    const occupied:{x:number;y:number;w:number;h:number}[]=[];
    const label=(value:string,x:number,y:number,important=false)=>{
      ctx.font=`${important?'bold ':''}${important?15:12}px sans-serif`;
      const text=value.length>39?value.slice(0,37)+'…':value,bw=Math.min(w-20,ctx.measureText(text).width+14),bh=important?27:23;
      const box={x:Math.max(5,Math.min(w-bw-5,x+9)),y:Math.max(5,Math.min(h-bh-28,y-29)),w:bw,h:bh};
      if(!important&&occupied.some(b=>box.x<b.x+b.w+5&&box.x+box.w+5>b.x&&box.y<b.y+b.h+5&&box.y+box.h+5>b.y))return;
      occupied.push(box);ctx.fillStyle=important?'#f3d77c':'#163435e8';ctx.fillRect(box.x,box.y,box.w,box.h);ctx.fillStyle=important?'#182e2d':'#f7f3e9';ctx.fillText(text,box.x+7,box.y+bh-8);
    };
    if(selected)label(selected.name,px(selected.x),pz(selected.z),true);
    for(const place of visible){const x=px(place.x),y=pz(place.z),active=selected?.id===place.id;
      ctx.fillStyle=PLACE_CATEGORIES.find(c=>c.id===place.category)!.color;ctx.beginPath();ctx.arc(x,y,active?7:selected?3.7:2.5,0,Math.PI*2);ctx.fill();
      if(active){ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.stroke();}
      else if(selected)label(place.name,x,y);
    }
    const view=selected&&placeViewpoint(selected.id);
    if(view){ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(px(view.x),pz(view.z),5,0,Math.PI*2);ctx.stroke();}
    const metres=selected?50:250,line=metres*scale;ctx.fillStyle='#102825dc';ctx.fillRect(10,h-34,line+20,25);ctx.strokeStyle='#fff3d1';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(20,h-17);ctx.lineTo(20+line,h-17);ctx.stroke();ctx.fillStyle='#fff3d1';ctx.font='11px sans-serif';ctx.fillText(`${metres} m`,25,h-21);
  }
  disposeObject(object:THREE.Object3D){object.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Line){o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m.dispose());}});}
  dispose(){this.leave();clearInterval(this.simulationTimer);cancelAnimationFrame(this.frame);this.cleanup.forEach(f=>f());this.world.dispose();this.combatEffects.dispose();this.weaponView.dispose();this.particles.forEach(p=>this.disposeObject(p.mesh));this.sound.dispose();this.renderer.dispose();delete (window as unknown as Record<string,unknown>).__NANDED_DEBUG__;}
}
