import * as THREE from 'three';
import { createWorld, preloadWorldAssets } from './world';
import { createActor, loadActorAsset, updateActor, disposeActor, type Actor } from './actors';
import { createWeaponView } from './weapon-view';
import { LOCATIONS, DEFAULT_LOCATION_ID } from './locations';
import { createMatch, addPlayer, applyInput, movePlayer, EYE_HEIGHT, WEAPONS, type Weapon } from './simulation';
import { COLLIDERS, MAP_BOUNDS, ROADS, SPAWN_YAWS } from './map';

type Match = ReturnType<typeof createMatch>;
type Player = Match['players'][number];
export type Mode = 'lobby' | 'solo' | 'online';
export type Settings = { sensitivity: number; volume: number; quality: 'high' | 'low' };
export type HUD = {
  now: number; location:string; exploration:boolean;
  mode: Mode; paused: boolean; player: Player | null; players: Player[];
  scores: { blue: number; orange: number }; remaining: number; room: string;
  ping: number; winner: string | null; feed: { id: string; text: string }[];
  hit: boolean; hurt: boolean; connected: boolean; scoreboard: boolean;
};
export const emptyHUD: HUD = { now:0, location:'Bhagya Nagar', exploration:false, mode:'lobby', paused:false, player:null, players:[], scores:{blue:0,orange:0}, remaining:300, room:'',ping:0,winner:null,feed:[],hit:false,hurt:false,connected:true,scoreboard:false };

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
  mode:Mode='lobby'; paused=false; match:Match|null=null; playerId=''; room=''; token='';
  settings:Settings={sensitivity:1,volume:.35,quality:'high'}; sound=new Sound();
  keys=new Set<string>(); yaw=0; pitch=0; shooting=false; queuedShot=false; reloading=false; jumping=false; selectedWeapon:Weapon='rifle'; seq=0;
  simulationTimer:ReturnType<typeof setInterval>; lobbyDirty=true; frame=0; lastFrame=0; lastHUD=0; pollTimer:ReturnType<typeof setTimeout>|null=null; networkGeneration=0;
  ping=0; connected=true; seenEvents=new Set<string>(); feed:{id:string,text:string,at:number}[]=[]; hitUntil=0; hurtUntil=0; previousHealth=100;
  characters=new Map<string,Actor>(); particles:{mesh:THREE.Object3D,until:number}[]=[];
  lastStep=0; pausedAt=0; scoreboard=false;
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
    this.camera.rotation.order='YXZ';this.scene.add(this.camera);this.world=createWorld(this.scene);
    this.weaponView=createWeaponView(this.camera);this.weapon=this.weaponView.group;
    this.bind();this.resize();
    Object.defineProperty(window,'__NANDED_DEBUG__',{configurable:true,get:()=>({mode:this.mode,location:this.location,locationId:this.match?.locationId,exploration:this.match?.exploration??false,pixelRatio:this.renderer.getPixelRatio(),animations:[...this.characters.values()].map(a=>a.animationState),phase:this.paused?'paused':this.mode==='lobby'?'lobby':'playing',playerId:this.playerId,roomCode:this.room,selectedWeapon:this.selectedWeapon,weapon:this.me?.weapon,visibleWeapon:this.weapon.children.filter(child=>child.visible&&['AR30 rifle','P12 handgun','Combat knife'].includes(child.name)).map(child=>child.name),lastAttackAt:this.me?.lastShotAt,reloadUntil:this.me?.reloadUntil,localPlayer:this.me?{x:this.me.x,z:this.me.z,health:this.me.health,ammo:this.me.ammo,weapon:this.me.weapon}:null,players:this.match?.players.map(p=>({id:p.id,x:p.x,z:p.z,bot:p.bot,team:p.team,weapon:p.weapon})),yaw:this.yaw,pitch:this.pitch,touchSprint:this.touchSprint,ammo:this.me?.ammo,health:this.me?.health,renderer:this.renderer.info.render})});
    this.simulationTimer=setInterval(()=>this.tick(),1000/60);
    this.frame=requestAnimationFrame(this.animate);
  }
  get location(){const p=this.me;if(p)return [...LOCATIONS].sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0].name;return LOCATIONS.find(l=>l.id===this.match?.locationId)?.name??LOCATIONS[0].name;}
  get me(){return this.match?.players.find(p=>p.id===this.playerId)??null;}
  private listen(target:EventTarget,event:string,handler:EventListener,options?:AddEventListenerOptions){target.addEventListener(event,handler,options);this.cleanup.push(()=>target.removeEventListener(event,handler,options));}
  private bind(){
    this.listen(window,'resize',()=>this.resize());
    this.listen(window,'pagehide',()=>{if(this.mode==='online')this.leave();});
    this.listen(document,'pointerlockchange',()=>{if(this.mode!=='lobby'&&!this.touch){this.setPaused(document.pointerLockElement!==this.canvas);}});
    this.listen(document,'pointerlockerror',()=>{if(this.mode!=='lobby')this.setPaused(true);});
    this.listen(window,'blur',()=>{this.keys.clear();this.shooting=false;if(this.mode!=='lobby')this.pause();});
    this.listen(document,'visibilitychange',()=>{if(document.hidden&&this.mode!=='lobby')this.pause();});
    this.listen(document,'mousemove',((e:MouseEvent)=>{if(document.pointerLockElement===this.canvas&&!this.paused){this.yaw-=e.movementX*.002*this.settings.sensitivity;this.pitch=THREE.MathUtils.clamp(this.pitch-e.movementY*.002*this.settings.sensitivity,-1.45,1.45);}}) as EventListener);
    this.listen(window,'keydown',((e:KeyboardEvent)=>{
      if(this.mode==='lobby'||e.target instanceof HTMLInputElement)return;
      if(['Space','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
      if(e.code==='Escape'){this.pause();return;}
      if(this.paused)return;this.keys.add(e.code);if(e.code==='KeyR')this.reloading=true;
      if(e.code==='Space')this.jumping=true;
      if(e.code==='Digit1')this.selectWeapon('rifle');if(e.code==='Digit2')this.selectWeapon('pistol');if(e.code==='Digit3')this.selectWeapon('knife');
      if(e.code==='Tab'){this.scoreboard=true;this.emitHUD();}
    }) as EventListener);
    this.listen(window,'keyup',((e:KeyboardEvent)=>{this.keys.delete(e.code);if(e.code==='Tab'){this.scoreboard=false;this.emitHUD();}}) as EventListener);
    this.listen(this.canvas,'mousedown',((e:MouseEvent)=>{if(e.button===0&&this.mode!=='lobby'&&!this.paused){this.shooting=true;this.queuedShot=true;}}) as EventListener);
    this.listen(window,'mouseup',()=>{this.shooting=false;});
    this.listen(this.canvas,'contextmenu',e=>e.preventDefault());
    this.listen(this.canvas,'touchstart',((e:TouchEvent)=>{if(this.mode==='lobby'||this.paused||this.touchLook)return;const t=e.changedTouches[0];this.touchLook={id:t.identifier,x:t.clientX,y:t.clientY};e.preventDefault();}) as EventListener,{passive:false});
    this.listen(this.canvas,'touchmove',((e:TouchEvent)=>{if(!this.touchLook)return;const t=Array.from(e.changedTouches).find(t=>t.identifier===this.touchLook!.id);if(!t)return;this.yaw-=(t.clientX-this.touchLook.x)*.006*this.settings.sensitivity;this.pitch=THREE.MathUtils.clamp(this.pitch-(t.clientY-this.touchLook.y)*.006*this.settings.sensitivity,-1.45,1.45);this.touchLook={id:t.identifier,x:t.clientX,y:t.clientY};e.preventDefault();}) as EventListener,{passive:false});
    const releaseLook=((e:TouchEvent)=>{if(Array.from(e.changedTouches).some(t=>t.identifier===this.touchLook?.id))this.touchLook=null;}) as EventListener;
    this.listen(this.canvas,'touchend',releaseLook);this.listen(this.canvas,'touchcancel',releaseLook);
  }
  resize(){this.lobbyDirty=true;const w=window.innerWidth,h=window.innerHeight;this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,this.settings.quality==='high'?2:1.25,Math.sqrt(4_000_000/(w*h))));this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
  updateSettings(settings:Settings){this.settings=settings;this.sound.volume=settings.volume;this.renderer.shadowMap.enabled=settings.quality==='high';this.resize();}
  selectWeapon(weapon:Weapon){this.selectedWeapon=weapon;this.reloading=false;}
  startSolo(name:string,locationId=DEFAULT_LOCATION_ID,exploration=false){
    this.leave();const location=LOCATIONS.find(l=>l.id===locationId)??LOCATIONS[0],now=Date.now();
    this.match=createMatch(now,{locationId:location.id,start:location,exploration});const p=addPlayer(this.match,name||'Operator','blue');this.playerId=p.id;
    if(exploration){p.x=location.x;p.z=location.z;p.yaw=location.yaw;}
    this.mode='solo';this.setupPlayer();if(exploration)this.pitch=location.pitch??0;this.sound.unlock();this.resume();this.emitHUD();
  }
  async startOnline(action:'create'|'join'|'quickjoin',name:string,room?:string,locationId=DEFAULT_LOCATION_ID){
    this.leave();const generation=++this.networkGeneration;
    const result=await this.request({action,name:name||'Operator',room,locationId});if(generation!==this.networkGeneration)return;
    this.match=result.state;this.playerId=result.playerId;this.token=result.token;this.room=result.room;this.mode='online';this.setupPlayer();
    this.sound.unlock();this.setPaused(true);this.emitHUD();this.poll();
  }
  setupPlayer(){const p=this.me;if(!p)return;this.yaw=p.yaw;this.pitch=0;this.selectedWeapon='rifle';this.seq=0;this.predicted={...p};this.displayPosition.set(p.x,p.y+EYE_HEIGHT,p.z);this.previousHealth=p.health;this.seenEvents=new Set(this.match?.events.map(event=>String(event.id)));this.feed=[];this.connected=true;this.weapon.visible=true;}
  input(){return {forward:this.paused?0:this.touchMove.forward+Number(this.keys.has('KeyW')||this.keys.has('ArrowUp'))-Number(this.keys.has('KeyS')||this.keys.has('ArrowDown')),strafe:this.paused?0:this.touchMove.strafe+Number(this.keys.has('KeyD')||this.keys.has('ArrowRight'))-Number(this.keys.has('KeyA')||this.keys.has('ArrowLeft')),yaw:this.yaw,pitch:this.pitch,shoot:!this.paused&&(this.shooting||this.queuedShot),reload:!this.paused&&this.reloading,sprint:!this.paused&&!(this.shooting||this.queuedShot)&&(this.keys.has('ShiftLeft')||this.keys.has('ShiftRight')||this.touchSprint),jump:!this.paused&&this.jumping,weapon:this.selectedWeapon,seq:++this.seq};}
  async request(body:Record<string,unknown>){
    const response=await fetch('/api/game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(6000)});
    const data=await response.json() as {error?:string;state:Match;playerId:string;token:string;room:string};if(!response.ok)throw new Error(data.error||'The room could not be reached. Please try again.');return data;
  }
  async poll(){
    if(this.mode!=='online')return;const generation=this.networkGeneration,started=performance.now();
    try{
      const input=this.input();this.reloading=false;this.jumping=false;this.queuedShot=false;
      const data=await this.request({action:'input',room:this.room,token:this.token,input});
      if(generation!==this.networkGeneration)return;
      const previous=this.me;this.match=data.state;this.ping=Math.round(performance.now()-started);this.connected=true;
      const p=this.me;
      if(p){
        if(!this.predicted||!previous||p.health<=0||previous.health<=0||Math.hypot(p.x-this.predicted.x,p.z-this.predicted.z)>3)this.predicted={...p};
        else this.predicted={...p,x:THREE.MathUtils.lerp(this.predicted.x,p.x,.3),z:THREE.MathUtils.lerp(this.predicted.z,p.z,.3)};
      }
    }catch(error){if(generation!==this.networkGeneration)return;this.connected=false;if(error instanceof Error&&/expired|not found|invalid token|removed|full/i.test(error.message)){this.onError(error.message);this.leave();return;}}
    if(generation===this.networkGeneration&&this.mode==='online')this.pollTimer=setTimeout(()=>this.poll(),Math.max(20,125-(performance.now()-started)));
  }
  setPaused(value:boolean){if(this.paused===value)return;this.paused=value;this.keys.clear();this.shooting=false;this.queuedShot=false;this.reloading=false;this.jumping=false;this.touchMove={forward:0,strafe:0};this.touchSprint=false;this.touchLook=null;if(value)this.pausedAt=Date.now();else if(this.mode==='solo'&&this.match){const delay=Date.now()-this.pausedAt;this.match.endsAt+=delay;this.match.startedAt+=delay;if(this.match.winnerAt)this.match.winnerAt+=delay;this.match.time=Date.now();for(const p of this.match.players){if(p.respawnAt)p.respawnAt+=delay;if(p.reloadUntil)p.reloadUntil+=delay;p.invulnerableUntil+=delay;p.lastShotAt+=delay;p.lastInputAt+=delay;p.botDecisionAt+=delay;p.nextBotShotAt+=delay;}}this.emitHUD();}
  pause(){if(this.mode==='lobby')return;this.setPaused(true);if(document.pointerLockElement)document.exitPointerLock();}
  resume(){if(this.mode==='lobby')return;this.sound.unlock();if(this.touch){this.setPaused(false);return;}const promise=this.canvas.requestPointerLock();if(promise&&typeof promise.catch==='function')promise.catch(()=>this.setPaused(true));}
  leave(){
    const oldRoom=this.room,oldToken=this.token;
    if(this.mode==='online'&&oldToken)void fetch('/api/game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'leave',room:oldRoom,token:oldToken}),keepalive:true}).catch(()=>{});
    this.networkGeneration++;if(this.pollTimer)clearTimeout(this.pollTimer);this.pollTimer=null;this.mode='lobby';this.lobbyDirty=true;this.paused=false;this.queuedShot=false;this.match=null;this.playerId='';this.room='';this.token='';this.keys.clear();this.shooting=false;this.touchMove={forward:0,strafe:0};this.touchSprint=false;this.touchLook=null;this.scoreboard=false;this.weapon.visible=false;
    for(const p of this.characters.values()){this.scene.remove(p.group);disposeActor(p);}this.characters.clear();
    for(const particle of this.particles){this.scene.remove(particle.mesh);this.disposeObject(particle.mesh);}this.particles=[];
    if(document.pointerLockElement===this.canvas)document.exitPointerLock();this.emitHUD();
  }
  updateCharacters(dt:number){
    if(!this.match)return;const ids=new Set(this.match.players.map(p=>p.id));
    for(const[id,actor]of this.characters){if(!ids.has(id)){this.scene.remove(actor.group);disposeActor(actor);this.characters.delete(id);}}
    for(const p of this.match.players){if(p.id===this.playerId)continue;
      let actor=this.characters.get(p.id);
      if(!actor){actor=createActor(p.team);actor.group.position.set(p.x,p.y,p.z);this.scene.add(actor.group);this.characters.set(p.id,actor);}
      const speed=dt>0?Math.min(7.2,Math.hypot(actor.group.position.x-p.x,actor.group.position.z-p.z)/dt):0;
      const attackAge=p.lastAttackWeapon===p.weapon?this.match.time-p.lastShotAt:1000;
      updateActor(actor,{x:p.x,y:p.y,z:p.z,yaw:p.yaw,pitch:p.pitch,speed,shooting:attackAge<(p.weapon==='knife'?380:160),attackAge,dead:p.health<=0,reloading:p.reloadUntil>this.match.time,weapon:p.weapon},dt);
    }
  }
  events(now:number){
    if(!this.match)return;
    for(const event of this.match.events){const id=String(event.id);if(this.seenEvents.has(id))continue;this.seenEvents.add(id);
      if(event.type==='shot'){
        const p=this.match.players.find(p=>p.id===event.playerId);if(!p)continue;
        if(p.id===this.playerId){this.sound.play('shot');}
        else if(this.me&&Math.hypot(p.x-this.me.x,p.z-this.me.z)<28){this.sound.play('shot',true);const origin=new THREE.Vector3(event.x,event.y,event.z),end=new THREE.Vector3(event.endX??event.x,event.endY??event.y,event.endZ??event.z);const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([origin,end]),new THREE.LineBasicMaterial({color:'#ffce71',transparent:true,opacity:.45}));this.scene.add(line);this.particles.push({mesh:line,until:now+75});}
      }
      if(event.type==='melee'){
        const own=event.playerId===this.playerId;
        if(own||(this.me&&Math.hypot(event.x-this.me.x,event.z-this.me.z)<8))this.sound.play('melee',!own);
      }
      if(event.type==='respawn'&&event.playerId===this.playerId&&this.me){this.yaw=this.me.yaw;this.pitch=0;this.selectedWeapon='rifle';}
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
    const previousHealth=this.me.health,round=this.match.round,now=Date.now();
    applyInput(this.match,this.playerId,this.input(),now);
    const p=this.me;
    if(p&&p.health>0&&(previousHealth<=0||round!==this.match.round)){
      this.yaw=p.yaw=(this.match.spawnYaws??SPAWN_YAWS)[p.team];this.pitch=p.pitch=0;
      p.intent.yaw=this.yaw;p.intent.pitch=0;this.selectedWeapon='rifle';
    }
    this.reloading=false;this.jumping=false;this.queuedShot=false;
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
        const visual=this.mode==='online'&&this.predicted?this.predicted:p;
        const target=new THREE.Vector3(visual.x,visual.y+EYE_HEIGHT,visual.z);
        if(p.health<=0)target.y=.6;
        if(this.mode==='solo')this.displayPosition.copy(target);else this.displayPosition.lerp(target,1-Math.exp(-dt*22));this.camera.position.copy(this.displayPosition);
        this.camera.rotation.set(this.pitch,this.yaw,0,'YXZ');
        const moving=!this.paused&&(Math.abs(input.forward)+Math.abs(input.strafe)>0);
        this.weaponView.update({weapon:p.weapon,time:this.match.time,shotAt:p.lastAttackWeapon===p.weapon?p.lastShotAt:0,reloadUntil:p.reloadUntil,reloadDuration:WEAPONS[p.weapon].reload,speed:moving?(input.sprint?7.2:4.8):0,sprint:moving&&input.sprint,alive:p.health>0},this.paused?0:dt);
        if(moving&&t-this.lastStep>360&&p.health>0){this.sound.play('step');this.lastStep=t;}
      }
      this.updateCharacters(this.paused?0:dt);this.events(now);
    }
    this.world.update(t/1000,this.camera.position);
    if(t-this.lastHUD>90){this.emitHUD();this.lastHUD=t;}
    if(this.mode!=='lobby'||this.lobbyDirty){this.renderer.render(this.scene,this.camera);this.lobbyDirty=false;}this.frame=requestAnimationFrame(this.animate);
  };
  emitHUD(){const now=Date.now();this.onHUD({now,location:this.location,exploration:this.match?.exploration??false,mode:this.mode,paused:this.paused,player:this.me?{...this.me}:null,players:this.match?.players.map(p=>({...p}))??[],scores:this.match?.scores??{blue:0,orange:0},remaining:Math.max(0,Math.ceil(((this.match?.endsAt??now+300000)-(this.mode==='solo'&&this.paused?this.pausedAt:now))/1000)),room:this.room,ping:this.ping,winner:this.match?.winner??null,feed:this.feed.map(({id,text})=>({id,text})),hit:now<this.hitUntil,hurt:now<this.hurtUntil,connected:this.connected,scoreboard:this.scoreboard});}
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
    if(!me){ctx.font='bold 10px sans-serif';for(const location of LOCATIONS){ctx.fillStyle='#e9b56e';ctx.beginPath();ctx.arc(px(location.x),pz(location.z),3,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f7f3e9';ctx.fillText(location.name,Math.min(w-125,px(location.x)+6),pz(location.z)-5);}}
    for(const p of players){if(p.health<=0||p.id!==selfId&&me&&p.team!==me.team)continue;
      ctx.fillStyle=p.id===selfId?'#fff':'#70c4d5';ctx.beginPath();ctx.arc(px(p.x),pz(p.z),p.id===selfId?5:3.5,0,Math.PI*2);ctx.fill();
      if(p.id===selfId){ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px(p.x),pz(p.z));ctx.lineTo(px(p.x-Math.sin(this.yaw)*8),pz(p.z-Math.cos(this.yaw)*8));ctx.stroke();}
    }
    ctx.fillStyle='#dce9e5';ctx.font='bold 11px sans-serif';ctx.fillText('N ↑',w-30,17);
  }
  disposeObject(object:THREE.Object3D){object.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Line){o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m.dispose());}});}
  dispose(){this.leave();clearInterval(this.simulationTimer);cancelAnimationFrame(this.frame);this.cleanup.forEach(f=>f());this.world.dispose();this.weaponView.dispose();this.particles.forEach(p=>this.disposeObject(p.mesh));this.sound.dispose();this.renderer.dispose();delete (window as unknown as Record<string,unknown>).__NANDED_DEBUG__;}
}
