import * as THREE from 'three';
import { createWorld } from './world';
import { createMatch, addPlayer, advanceMatch, applyInput, movePlayer, EYE_HEIGHT } from './simulation';
import { COLLIDERS, MAP_BOUNDS } from './map';

type Match = ReturnType<typeof createMatch>;
type Player = Match['players'][number];
export type Mode = 'lobby' | 'solo' | 'online';
export type Settings = { sensitivity: number; volume: number; quality: 'high' | 'low' };
export type HUD = {
  mode: Mode; paused: boolean; player: Player | null; players: Player[];
  scores: { blue: number; orange: number }; remaining: number; room: string;
  ping: number; winner: string | null; feed: { id: string; text: string }[];
  hit: boolean; hurt: boolean; connected: boolean; scoreboard: boolean;
};
export const emptyHUD: HUD = { mode:'lobby', paused:false, player:null, players:[], scores:{blue:0,orange:0}, remaining:300, room:'',ping:0,winner:null,feed:[],hit:false,hurt:false,connected:true,scoreboard:false };

class Sound {
  ctx: AudioContext | null = null;
  volume = .35;
  unlock() { try { this.ctx ??= new AudioContext(); void this.ctx.resume(); } catch {} }
  play(kind:'shot'|'hit'|'reload'|'step', distant = false) {
    const ctx=this.ctx; if (!ctx || !this.volume) return;
    const t=ctx.currentTime, gain=ctx.createGain(); gain.connect(ctx.destination);
    const vol=this.volume*(distant?.06:.22);
    gain.gain.setValueAtTime(vol,t); gain.gain.exponentialRampToValueAtTime(.001,t+(kind==='shot'?.14:.07));
    if(kind==='shot') {
      const buffer=ctx.createBuffer(1,ctx.sampleRate*.14,ctx.sampleRate), data=buffer.getChannelData(0);
      for(let i=0;i<data.length;i++) data[i]=(Math.random()*2-1)*Math.exp(-i/(data.length*.22));
      const noise=ctx.createBufferSource(); noise.buffer=buffer;
      const filter=ctx.createBiquadFilter(); filter.type='lowpass'; filter.frequency.value=distant?650:2500;
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
  canvas:HTMLCanvasElement; renderer:THREE.WebGLRenderer; scene=new THREE.Scene(); camera=new THREE.PerspectiveCamera(74,1,.05,220);
  world:ReturnType<typeof createWorld>; weapon=new THREE.Group(); muzzle:THREE.Mesh;
  mode:Mode='lobby'; paused=false; match:Match|null=null; playerId=''; room=''; token='';
  settings:Settings={sensitivity:1,volume:.35,quality:'high'}; sound=new Sound();
  keys=new Set<string>(); yaw=0; pitch=0; shooting=false; queuedShot=false; reloading=false; jumping=false; selectedWeapon:'rifle'|'pistol'='rifle'; seq=0;
  frame=0; lastFrame=0; lastHUD=0; pollTimer:ReturnType<typeof setTimeout>|null=null; networkGeneration=0;
  ping=0; connected=true; seenEvents=new Set<string>(); feed:{id:string,text:string,at:number}[]=[]; hitUntil=0; hurtUntil=0; previousHealth=100;
  characters=new Map<string,THREE.Group>(); particles:{mesh:THREE.Object3D,until:number}[]=[];
  recoil=0; nextLocalShot=0; gunBob=0; lastStep=0; pausedAt=0; scoreboard=false;
  touch=typeof window!=='undefined' && matchMedia('(pointer: coarse)').matches;
  touchMove={forward:0,strafe:0}; touchLook:{id:number,x:number,y:number}|null=null;
  displayPosition=new THREE.Vector3(); predicted:Player|null=null; pendingController:AbortController|null=null;
  onHUD:(hud:HUD)=>void; onError:(message:string)=>void;
  cleanup:(()=>void)[]=[];
  constructor(canvas:HTMLCanvasElement,onHUD:(hud:HUD)=>void,onError:(message:string)=>void) {
    this.canvas=canvas;this.onHUD=onHUD;this.onError=onError;
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.15;
    this.camera.rotation.order='YXZ';this.scene.add(this.camera);this.world=createWorld(this.scene);
    this.muzzle=this.buildWeapon();
    this.bind();this.resize();
    Object.defineProperty(window,'__NANDED_DEBUG__',{configurable:true,get:()=>({mode:this.mode,phase:this.paused?'paused':this.mode==='lobby'?'lobby':'playing',playerId:this.playerId,roomCode:this.room,localPlayer:this.me?{x:this.me.x,z:this.me.z,health:this.me.health,ammo:this.me.ammo}:null,players:this.match?.players.map(p=>({id:p.id,x:p.x,z:p.z,bot:p.bot,team:p.team})),ammo:this.me?.ammo,health:this.me?.health,renderer:this.renderer.info.render})});
    this.frame=requestAnimationFrame(this.animate);
  }
  get me(){return this.match?.players.find(p=>p.id===this.playerId)??null;}
  private listen(target:EventTarget,event:string,handler:EventListener,options?:AddEventListenerOptions){target.addEventListener(event,handler,options);this.cleanup.push(()=>target.removeEventListener(event,handler,options));}
  private bind(){
    this.listen(window,'resize',()=>this.resize());
    this.listen(document,'pointerlockchange',()=>{if(this.mode!=='lobby'&&!this.touch){this.setPaused(document.pointerLockElement!==this.canvas);}});
    this.listen(document,'pointerlockerror',()=>{if(this.mode!=='lobby')this.setPaused(true);});
    this.listen(window,'blur',()=>{this.keys.clear();this.shooting=false;if(this.mode!=='lobby')this.pause();});
    this.listen(document,'visibilitychange',()=>{if(document.hidden&&this.mode!=='lobby')this.pause();});
    this.listen(document,'mousemove',((e:MouseEvent)=>{if(document.pointerLockElement===this.canvas&&!this.paused){this.yaw-=e.movementX*.002*this.settings.sensitivity;this.pitch=THREE.MathUtils.clamp(this.pitch-e.movementY*.002*this.settings.sensitivity,-1.45,1.45);}}) as EventListener);
    this.listen(window,'keydown',((e:KeyboardEvent)=>{
      if(this.mode==='lobby'||e.target instanceof HTMLInputElement)return;
      if(['Space','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
      if(e.code==='Escape'){this.pause();return;}
      this.keys.add(e.code);if(e.code==='KeyR')this.reloading=true;
      if(e.code==='Space')this.jumping=true;
      if(e.code==='Digit1')this.selectedWeapon='rifle';if(e.code==='Digit2')this.selectedWeapon='pistol';
      if(e.code==='Tab'){this.scoreboard=true;this.emitHUD();}
    }) as EventListener);
    this.listen(window,'keyup',((e:KeyboardEvent)=>{this.keys.delete(e.code);if(e.code==='Tab'){this.scoreboard=false;this.emitHUD();}}) as EventListener);
    this.listen(this.canvas,'mousedown',((e:MouseEvent)=>{if(e.button===0&&this.mode!=='lobby'&&!this.paused){this.shooting=true;this.queuedShot=true;}}) as EventListener);
    this.listen(window,'mouseup',()=>{this.shooting=false;});
    this.listen(this.canvas,'contextmenu',e=>e.preventDefault());
    this.listen(this.canvas,'touchstart',((e:TouchEvent)=>{if(this.mode==='lobby'||this.paused)return;const t=e.changedTouches[0];this.touchLook={id:t.identifier,x:t.clientX,y:t.clientY};e.preventDefault();}) as EventListener,{passive:false});
    this.listen(this.canvas,'touchmove',((e:TouchEvent)=>{if(!this.touchLook)return;const t=Array.from(e.changedTouches).find(t=>t.identifier===this.touchLook!.id);if(!t)return;this.yaw-=(t.clientX-this.touchLook.x)*.006*this.settings.sensitivity;this.pitch=THREE.MathUtils.clamp(this.pitch-(t.clientY-this.touchLook.y)*.006*this.settings.sensitivity,-1.45,1.45);this.touchLook={id:t.identifier,x:t.clientX,y:t.clientY};e.preventDefault();}) as EventListener,{passive:false});
    this.listen(this.canvas,'touchend',()=>{this.touchLook=null;});
  }
  resize(){const w=window.innerWidth,h=window.innerHeight;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
  updateSettings(settings:Settings){this.settings=settings;this.sound.volume=settings.volume;this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,settings.quality==='high'?1.5:1));this.renderer.shadowMap.enabled=settings.quality==='high';this.resize();}
  startSolo(name:string){
    this.leave();const now=Date.now();this.match=createMatch(now);const p=addPlayer(this.match,name||'Operator','blue');this.playerId=p.id;
    this.mode='solo';this.setupPlayer();this.sound.unlock();this.resume();this.emitHUD();
  }
  async startOnline(action:'create'|'join',name:string,room?:string){
    this.leave();const generation=++this.networkGeneration;
    const result=await this.request({action,name:name||'Operator',room});if(generation!==this.networkGeneration)return;
    this.match=result.state;this.playerId=result.playerId;this.token=result.token;this.room=result.room;this.mode='online';this.setupPlayer();
    this.sound.unlock();this.setPaused(true);this.emitHUD();this.poll();
  }
  setupPlayer(){const p=this.me;if(!p)return;this.yaw=p.yaw;this.pitch=0;this.selectedWeapon='rifle';this.seq=0;this.predicted={...p};this.displayPosition.set(p.x,p.y+EYE_HEIGHT,p.z);this.previousHealth=p.health;this.seenEvents.clear();this.feed=[];this.connected=true;this.weapon.visible=true;}
  input(){return {forward:this.paused?0:this.touchMove.forward+Number(this.keys.has('KeyW')||this.keys.has('ArrowUp'))-Number(this.keys.has('KeyS')||this.keys.has('ArrowDown')),strafe:this.paused?0:this.touchMove.strafe+Number(this.keys.has('KeyD')||this.keys.has('ArrowRight'))-Number(this.keys.has('KeyA')||this.keys.has('ArrowLeft')),yaw:this.yaw,pitch:this.pitch,shoot:!this.paused&&(this.shooting||this.queuedShot),reload:!this.paused&&this.reloading,sprint:this.keys.has('ShiftLeft'),jump:!this.paused&&this.jumping,weapon:this.selectedWeapon,seq:++this.seq};}
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
  setPaused(value:boolean){if(this.paused===value)return;this.paused=value;this.keys.clear();this.shooting=false;this.queuedShot=false;this.touchMove={forward:0,strafe:0};if(value)this.pausedAt=Date.now();else if(this.mode==='solo'&&this.match){const delay=Date.now()-this.pausedAt;this.match.endsAt+=delay;this.match.startedAt+=delay;if(this.match.winnerAt)this.match.winnerAt+=delay;this.match.time=Date.now();for(const p of this.match.players){if(p.respawnAt)p.respawnAt+=delay;if(p.reloadUntil)p.reloadUntil+=delay;p.invulnerableUntil+=delay;p.lastShotAt+=delay;p.lastInputAt+=delay;p.botDecisionAt+=delay;p.nextBotShotAt+=delay;}}this.emitHUD();}
  pause(){if(this.mode==='lobby')return;this.setPaused(true);if(document.pointerLockElement)document.exitPointerLock();}
  resume(){if(this.mode==='lobby')return;this.sound.unlock();if(this.touch){this.setPaused(false);return;}const promise=this.canvas.requestPointerLock();if(promise&&typeof promise.catch==='function')promise.catch(()=>this.setPaused(true));}
  leave(){
    const oldRoom=this.room,oldToken=this.token;
    if(this.mode==='online'&&oldToken)void fetch('/api/game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'leave',room:oldRoom,token:oldToken}),keepalive:true}).catch(()=>{});
    this.networkGeneration++;if(this.pollTimer)clearTimeout(this.pollTimer);this.pollTimer=null;this.mode='lobby';this.paused=false;this.queuedShot=false;this.match=null;this.playerId='';this.room='';this.token='';this.keys.clear();this.shooting=false;this.touchMove={forward:0,strafe:0};this.scoreboard=false;this.weapon.visible=false;
    for(const p of this.characters.values()){this.scene.remove(p);this.disposeObject(p);}this.characters.clear();
    if(document.pointerLockElement===this.canvas)document.exitPointerLock();this.emitHUD();
  }
  buildWeapon(){
    const steel=new THREE.MeshStandardMaterial({color:'#252c29',roughness:.45,metalness:.72});const dark=new THREE.MeshStandardMaterial({color:'#111714',roughness:.75});const wood=new THREE.MeshStandardMaterial({color:'#b77c43',roughness:.65});const glove=new THREE.MeshStandardMaterial({color:'#68705a'});
    const box=(w:number,h:number,d:number,x:number,y:number,z:number,m:THREE.Material)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);this.weapon.add(mesh);return mesh;};
    box(.14,.16,.5,0,0,-.12,steel);box(.12,.15,.31,0,-.015,.25,wood);box(.1,.13,.4,0,0,-.51,wood);box(.06,.065,.3,0,.03,-.85,steel);box(.07,.17,.1,0,-.14,.03,dark);box(.085,.25,.12,0,-.19,-.12,steel);box(.035,.08,.05,0,.09,-.91,steel);box(.045,.045,.08,0,.1,-.06,steel);
    for(let i=0;i<5;i++)box(.125,.012,.025,0,.073,-.38-i*.055,steel);
    box(.12,.13,.16,.025,-.13,.09,glove);box(.14,.15,.28,-.06,-.13,-.46,glove);
    box(.13,.14,.4,.04,-.18,.34,dark);box(.13,.14,.38,-.14,-.23,-.24,dark).rotation.x=-.55;
    const flash=new THREE.Mesh(new THREE.ConeGeometry(.075,.22,5),new THREE.MeshBasicMaterial({color:'#ffdc75',transparent:true,opacity:.95}));flash.rotation.x=-Math.PI/2;flash.position.set(0,.03,-1.05);this.weapon.add(flash);flash.visible=false;
    this.weapon.position.set(.28,-.27,-.48);this.weapon.rotation.y=-.025;this.camera.add(this.weapon);this.weapon.visible=false;return flash;
  }
  makeCharacter(p:Player){
    const group=new THREE.Group();const uniform=new THREE.MeshStandardMaterial({color:p.team==='blue'?'#486d78':'#a97447',roughness:.9});const armor=new THREE.MeshStandardMaterial({color:'#29352e',roughness:.8});const skin=new THREE.MeshStandardMaterial({color:'#b99b78'});
    const add=(w:number,h:number,d:number,x:number,y:number,z:number,m:THREE.Material)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);mesh.castShadow=true;group.add(mesh);return mesh;};
    const left=add(.19,.72,.22,-.13,.39,0,uniform),right=add(.19,.72,.22,.13,.39,0,uniform);
    add(.52,.55,.31,0,1.04,0,uniform);add(.43,.4,.12,0,1.06,-.2,armor);add(.34,.32,.27,0,1.55,0,skin);add(.38,.17,.34,0,1.72,.005,armor);add(.35,.11,.1,0,1.57,-.14,armor);
    add(.18,.45,.2,-.34,1.11,-.1,uniform).rotation.x=-.55;add(.18,.38,.2,.31,1.13,-.15,uniform).rotation.x=-.95;
    add(.09,.1,.64,.2,1.24,-.43,armor);add(.065,.065,.3,.2,1.24,-.86,armor);add(.12,.14,.2,0,1.02,.24,armor);
    group.userData={left,right,lastX:p.x,lastZ:p.z};group.position.set(p.x,p.y,p.z);this.scene.add(group);this.characters.set(p.id,group);return group;
  }
  updateCharacters(dt:number,t:number){
    if(!this.match)return;const ids=new Set(this.match.players.map(p=>p.id));
    for(const[id,group]of this.characters){if(!ids.has(id)){this.scene.remove(group);this.disposeObject(group);this.characters.delete(id);}}
    for(const p of this.match.players){if(p.id===this.playerId)continue;const g=this.characters.get(p.id)||this.makeCharacter(p);g.visible=p.health>0;
      const distance=Math.hypot(g.position.x-p.x,g.position.z-p.z);g.position.lerp(new THREE.Vector3(p.x,p.y,p.z),1-Math.exp(-dt*14));
      g.rotation.y=p.yaw;const stride=distance>.025?Math.sin(t*9)*.35:0;g.userData.left.rotation.x=stride;g.userData.right.rotation.x=-stride;
    }
  }
  events(now:number){
    if(!this.match)return;
    for(const event of this.match.events){const id=String(event.id);if(this.seenEvents.has(id))continue;this.seenEvents.add(id);
      if(event.type==='shot'){
        const p=this.match.players.find(p=>p.id===event.playerId);if(!p)continue;
        if(p.id===this.playerId){this.recoil=.065;this.muzzle.visible=true;this.nextLocalShot=performance.now()+48;this.sound.play('shot');}
        else if(this.me&&Math.hypot(p.x-this.me.x,p.z-this.me.z)<28){this.sound.play('shot',true);const origin=new THREE.Vector3(event.x,event.y,event.z),end=new THREE.Vector3(event.endX??event.x,event.endY??event.y,event.endZ??event.z);const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([origin,end]),new THREE.LineBasicMaterial({color:'#ffce71',transparent:true,opacity:.45}));this.scene.add(line);this.particles.push({mesh:line,until:now+75});}
      }
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
  animate=(t:number)=>{
    const dt=Math.min((t-this.lastFrame)/1000,.05)||.016;this.lastFrame=t;const now=Date.now();
    this.world.update(t/1000);
    if(this.mode==='lobby'){
      const angle=t*.000017;this.camera.position.set(28+Math.sin(angle)*2,19,35+Math.cos(angle)*2);this.camera.lookAt(-1,1,-3);this.weapon.visible=false;
    }else if(this.match&&this.me){
      const input=this.input();
      if(this.mode==='solo'&&!this.paused){applyInput(this.match,this.playerId,input,now);advanceMatch(this.match,now);this.reloading=false;this.jumping=false;this.queuedShot=false;}
      const p=this.me;
      if(p){
        if(this.mode==='online'&&this.predicted&&p.health>0&&!this.paused&&this.connected&&!this.match.winner){this.predicted.yaw=input.yaw;this.predicted.pitch=input.pitch;movePlayer(this.match,this.predicted,input,dt);}
        const visual=this.mode==='online'&&this.predicted?this.predicted:p;
        const target=new THREE.Vector3(visual.x,visual.y+EYE_HEIGHT,visual.z);
        if(p.health<=0)target.y=.6;
        this.displayPosition.lerp(target,1-Math.exp(-dt*22));this.camera.position.copy(this.displayPosition);
        this.camera.rotation.set(this.pitch,this.yaw,0,'YXZ');
        const moving=!this.paused&&(Math.abs(input.forward)+Math.abs(input.strafe)>0);
        this.gunBob+=dt*(moving?11:2);this.recoil=Math.max(0,this.recoil-dt*.5);
        const reload=p.reloadUntil>this.match.time;
        this.weapon.visible=p.health>0;this.weapon.position.set(.28+Math.sin(this.gunBob)*.008,-.27+Math.cos(this.gunBob*2)*(moving?.012:.003)-(reload?.16:0),-.48+this.recoil);
        this.weapon.rotation.z=reload?-.45:0;this.weapon.scale.setScalar(p.weapon==='pistol'?.75:1);this.muzzle.visible=t<this.nextLocalShot;
        if(moving&&t-this.lastStep>360&&p.health>0){this.sound.play('step');this.lastStep=t;}
      }
      this.updateCharacters(dt,t/1000);this.events(now);
    }
    if(t-this.lastHUD>90){this.emitHUD();this.lastHUD=t;}
    this.renderer.render(this.scene,this.camera);this.frame=requestAnimationFrame(this.animate);
  };
  emitHUD(){const now=Date.now();this.onHUD({mode:this.mode,paused:this.paused,player:this.me?{...this.me}:null,players:this.match?.players.map(p=>({...p}))??[],scores:this.match?.scores??{blue:0,orange:0},remaining:Math.max(0,Math.ceil(((this.match?.endsAt??now+300000)-(this.mode==='solo'&&this.paused?this.pausedAt:now))/1000)),room:this.room,ping:this.ping,winner:this.match?.winner??null,feed:this.feed.map(({id,text})=>({id,text})),hit:now<this.hitUntil,hurt:now<this.hurtUntil,connected:this.connected,scoreboard:this.scoreboard});}
  drawMinimap(canvas:HTMLCanvasElement,players:Player[]=[],selfId=''){
    const ctx=canvas.getContext('2d');if(!ctx)return;const size=canvas.width;ctx.clearRect(0,0,size,size);const scale=size/70,offset=size/2;
    ctx.fillStyle='#252e2b';ctx.fillRect(0,0,size,size);ctx.strokeStyle='#35403a';ctx.lineWidth=.5;for(let i=0;i<size;i+=size/7){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,size);ctx.moveTo(0,i);ctx.lineTo(size,i);ctx.stroke();}
    ctx.fillStyle='#3b6265';ctx.fillRect((MAP_BOUNDS.maxX+1)*scale+offset,0,size,size);
    ctx.fillStyle='#707263';ctx.strokeStyle='#999681';for(const c of COLLIDERS){const x=(c.x-c.w/2)*scale+offset,z=(c.z-c.d/2)*scale+offset;ctx.fillRect(x,z,c.w*scale,c.d*scale);ctx.strokeRect(x,z,c.w*scale,c.d*scale);}
    const me=players.find(p=>p.id===selfId);
    for(const p of players){if(p.health<=0||p.id!==selfId&&me&&p.team!==me.team)continue;ctx.fillStyle=p.id===selfId?'#ffffff':p.team==='blue'?'#70bbc5':'#e9ad66';ctx.beginPath();ctx.arc(p.x*scale+offset,p.z*scale+offset,p.id===selfId?3.5:2.5,0,Math.PI*2);ctx.fill();if(p.id===selfId){ctx.strokeStyle='#fff';ctx.beginPath();ctx.moveTo(p.x*scale+offset,p.z*scale+offset);ctx.lineTo((p.x-Math.sin(this.yaw)*5)*scale+offset,(p.z-Math.cos(this.yaw)*5)*scale+offset);ctx.stroke();}}
  }
  disposeObject(object:THREE.Object3D){object.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Line){o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m.dispose());}});}
  dispose(){this.leave();cancelAnimationFrame(this.frame);this.cleanup.forEach(f=>f());this.world.dispose();this.disposeObject(this.weapon);this.particles.forEach(p=>this.disposeObject(p.mesh));this.sound.dispose();this.renderer.dispose();delete (window as unknown as Record<string,unknown>).__NANDED_DEBUG__;}
}
