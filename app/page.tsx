'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { ArrowRight, ArrowUpRight, Check, ChevronDown, Copy, Crosshair, Footprints, Gamepad2, HelpCircle, MapPin, Maximize2, Pause, Play, RotateCcw, Settings2, Shield, Smartphone, Users, Volume2, X } from 'lucide-react';
import type { GameClient, HUD, Settings } from '../lib/client';
import type { Weapon } from '../lib/simulation';
import { DEFAULT_LOCATION_ID, LOCATIONS } from '../lib/locations';
import { browserDisplayPlatform, requestDisplayMode, rotateHint, toggleDisplayFullscreen, viewportOrientation, type DisplayMode } from '../lib/display-mode';

const initialHUD: HUD = { now:0, mode:'lobby', paused:false, player:null, players:[], scores:{blue:0,orange:0}, remaining:300, room:'', ping:0, winner:null, feed:[], hit:false, hurt:false, connected:true, scoreboard:false, location:'Bhagya Nagar', exploration:false };
const defaultSettings: Settings = { sensitivity:1, volume:.35, quality:'high' };
type Modal = 'multiplayer' | 'settings' | 'guide' | 'screen' | null;
const LOADOUT: {id:Weapon;key:string;label:string}[] = [{id:'rifle',key:'1',label:'Rifle'},{id:'pistol',key:'2',label:'Handgun'},{id:'knife',key:'3',label:'Knife'}];

function WeaponIcon({weapon}:{weapon:Weapon}) {
  return <svg viewBox="0 0 80 32" aria-hidden="true" focusable="false"><path fill="currentColor" d={weapon==='rifle'?'M3 9h17v4h12v-3h26v3h15v3h5v3H58v3H44l-3 8h-9l2-10h-7l-3 9h-7l2-11H8l-5 4zm36-3h10v4H39z':weapon==='pistol'?'M19 5h42v11H38l-5 14H19l6-16h-6zm18 12h11v7H35l2-4h7v-2h-8z':'M4 13h25v-4h5v4h37l7 4-17 5H34v4h-5v-5H4z'}/></svg>;
}

export default function Home() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const minimap = useRef<HTMLCanvasElement>(null);
  const previewMap = useRef<HTMLCanvasElement>(null);
  const engine = useRef<GameClient|null>(null);
  const modalPanel = useRef<HTMLElement>(null);
  const joystickThumb = useRef<HTMLSpanElement>(null);
  const joystickPointer = useRef<number|null>(null);
  const screenLocked = useRef(false);
  const screenWasFullscreen = useRef(false);
  const screenChoice = useRef<DisplayMode>('auto');
  const screenChanging = useRef(false);
  const [hud,setHUD] = useState<HUD>(initialHUD);
  const [ready,setReady] = useState(false);
  const [error,setError] = useState('');
  const [fatal,setFatal] = useState(false);
  const [modal,setModal] = useState<Modal>(null);
  const [busy,setBusy] = useState(false);
  const [room,setRoom] = useState('');
  const [onlineTab,setOnlineTab] = useState<'create'|'join'>('create');
  const [copied,setCopied] = useState(false);
  const [name,setName] = useState('Operator');
  const [settings,setSettings] = useState(defaultSettings);
  const [touch,setTouch] = useState(false);
  const [displayMode,setDisplayMode] = useState<DisplayMode>('auto');
  const [displayBusy,setDisplayBusy] = useState(false);
  const [displayMessage,setDisplayMessage] = useState('Choose a view. Where supported, Landscape and Portrait open full screen and rotate your display.');
  const [displayStatus,setDisplayStatus] = useState<{orientation:'portrait'|'landscape';fullscreen:boolean}>({orientation:'portrait',fullscreen:false});
  const [locationId,setLocationId] = useState(DEFAULT_LOCATION_ID);
  const selectedLocation = LOCATIONS.find(location=>location.id===locationId) ?? LOCATIONS[0];

  useEffect(()=>{
    let disposed=false;
    const initialize=async()=>{
      const {GameClient}=await import('../lib/client');
      await Promise.all([GameClient.preload(),document.fonts.load('700 92px "Noto Sans Devanagari"').catch(()=>{})]);
      if(disposed||!canvas.current)return;
      let nextSettings={...defaultSettings};
      let savedName='Operator';
      try {
        const saved=JSON.parse(localStorage.getItem('nanded-settings-v2')||'null');
        if(saved)nextSettings={sensitivity:Math.max(.3,Math.min(2.5,Number(saved.sensitivity)||1)),volume:Math.max(0,Math.min(1,Number(saved.volume)||0)),quality:saved.quality==='low'?'low':'high'};
        savedName=(localStorage.getItem('nanded-name')||'Operator').slice(0,18);
      }catch{}
      setSettings(nextSettings);setName(savedName);setTouch(matchMedia('(pointer:coarse)').matches);
      const params=new URLSearchParams(window.location.search);
      const startLocation=params.get('location');
      if(LOCATIONS.some(location=>location.id===startLocation))setLocationId(startLocation!);
      const invite=params.get('room');
      if(invite){setRoom(invite.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6));setOnlineTab('join');setModal('multiplayer');}
      const game=new GameClient(canvas.current,setHUD,setError);
      engine.current=game;game.updateSettings(nextSettings);setReady(true);
    };
    void initialize().catch(err=>{if(disposed)return;setFatal(true);setError('The 3D map could not start. Reload or enable hardware acceleration in a current browser.');console.error(err);});
    return()=>{disposed=true;engine.current?.dispose();engine.current=null;};
  },[]);

  useEffect(()=>{
    if(!ready)return;
    engine.current?.updateSettings(settings);
    try{localStorage.setItem('nanded-settings-v2',JSON.stringify(settings));}catch{}
  },[settings,ready]);
  useEffect(()=>{if(ready)try{localStorage.setItem('nanded-name',name);}catch{}},[name,ready]);
  useEffect(()=>{
    const syncDisplay=()=>{
      const fullscreen=!!document.fullscreenElement;
      setDisplayStatus({orientation:viewportOrientation(window.innerWidth,window.innerHeight),fullscreen});
      // Rotation/fullscreen can cancel active touches without pointerup. Clear both
      // movement and fire, while keeping the same client, player and room alive.
      joystickPointer.current=null;
      if(joystickThumb.current)joystickThumb.current.style.transform='translate(0px,0px)';
      const game=engine.current;
      if(game){game.touchMove={forward:0,strafe:0};game.touchSprint=false;game.touchLook=null;game.shooting=false;game.queuedShot=false;game.jumping=false;game.reloading=false;}
      if(screenWasFullscreen.current&&!fullscreen&&screenLocked.current){
        screenLocked.current=false;
        setDisplayMessage(`Full screen ended and the orientation lock was released. ${rotateHint(screenChoice.current)}`);
      }
      screenWasFullscreen.current=fullscreen;
    };
    syncDisplay();
    window.addEventListener('resize',syncDisplay);
    document.addEventListener('fullscreenchange',syncDisplay);
    window.screen.orientation?.addEventListener('change',syncDisplay);
    return()=>{window.removeEventListener('resize',syncDisplay);document.removeEventListener('fullscreenchange',syncDisplay);window.screen.orientation?.removeEventListener('change',syncDisplay);};
  },[]);
  useEffect(()=>{
    if(minimap.current)engine.current?.drawMinimap(minimap.current,hud.players,hud.player?.id);
  },[hud]);
  useEffect(()=>{
    if(ready&&hud.mode==='lobby'&&previewMap.current)engine.current?.drawMinimap(previewMap.current);
  },[ready,hud.mode]);
  useEffect(()=>{
    if(!modal)return;
    const previous=document.activeElement as HTMLElement|null;
    const panel=modalPanel.current;
    const focusable=()=>Array.from(panel?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,a[href],[tabindex="0"]')??[]);
    focusable()[0]?.focus();
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.stopPropagation();if(!busy&&!displayBusy){setModal(null);setError('');}return;}
      if(event.key!=='Tab')return;
      const elements=focusable();const first=elements[0],last=elements.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    };
    panel?.addEventListener('keydown',onKey);
    return()=>{panel?.removeEventListener('keydown',onKey);previous?.focus();};
  },[modal,busy,displayBusy]);

  const resetJoystick=()=>{
    joystickPointer.current=null;
    if(engine.current){engine.current.touchMove={forward:0,strafe:0};engine.current.touchSprint=false;}
    if(joystickThumb.current)joystickThumb.current.style.transform='translate(0px,0px)';
  };
  const resetTouchControls=()=>{
    resetJoystick();
    const game=engine.current;
    if(game){game.touchLook=null;game.shooting=false;game.queuedShot=false;game.jumping=false;game.reloading=false;}
  };
  const moveJoystick=(event:PointerEvent<HTMLButtonElement>)=>{
    if(joystickPointer.current!==event.pointerId)return;
    const rect=event.currentTarget.getBoundingClientRect();
    const radius=rect.width*.3;
    const dx=event.clientX-rect.left-rect.width/2,dz=event.clientY-rect.top-rect.height/2;
    const distance=Math.hypot(dx,dz),scale=distance>radius?radius/distance:1;
    const x=dx*scale,z=dz*scale;
    if(joystickThumb.current)joystickThumb.current.style.transform=`translate(${x}px,${z}px)`;
    if(engine.current){engine.current.touchMove=distance<radius*.12?{forward:0,strafe:0}:{forward:-z/radius,strafe:x/radius};engine.current.touchSprint=distance/radius>.9;}
  };
  const startSolo=()=>{resetJoystick();setError('');setModal(null);engine.current?.startSolo(name.trim()||'Operator',locationId,true);};
  const online=async(action:'create'|'join'|'quickjoin')=>{
    if(!engine.current||busy)return;setBusy(true);setError('');
    try{await engine.current.startOnline(action,name.trim()||'Operator',action==='join'?room:undefined,locationId);setModal(null);}
    catch(cause){setError(cause instanceof Error?cause.message:'Could not connect. Please try again.');}
    finally{setBusy(false);}
  };
  const roomDialog=(tab:'create'|'join')=>{setOnlineTab(tab);setError('');setModal('multiplayer');};
  const copyInvite=async()=>{
    const url=new URL(window.location.origin);url.searchParams.set('room',hud.room);
    try{await navigator.clipboard.writeText(url.toString());setCopied(true);setTimeout(()=>setCopied(false),2000);}
    catch{setError(`Invite code: ${hud.room}. Share this code so another player can join.`);}
  };
  const open=(which:Modal)=>{resetTouchControls();if(hud.mode!=='lobby')engine.current?.pause();setError('');setModal(which);};
  const close=()=>{if(busy||displayBusy)return;setModal(null);setError('');};
  const leave=()=>{resetJoystick();engine.current?.leave();setModal(null);};
  const pause=()=>{resetJoystick();engine.current?.pause();};
  const chooseDisplay=async(mode:DisplayMode)=>{
    if(screenChanging.current)return;
    screenChanging.current=true;setDisplayBusy(true);resetTouchControls();
    screenChoice.current=mode;setDisplayMode(mode);
    try {
      const result=await requestDisplayMode(mode,browserDisplayPlatform());
      screenLocked.current=result.locked;setDisplayMessage(result.message);
      setDisplayStatus({orientation:viewportOrientation(window.innerWidth,window.innerHeight),fullscreen:!!document.fullscreenElement});
    }finally{screenChanging.current=false;setDisplayBusy(false);}
  };
  const fullScreen=async()=>{
    if(screenChanging.current)return;
    screenChanging.current=true;setDisplayBusy(true);resetTouchControls();
    try {
      const message=await toggleDisplayFullscreen(browserDisplayPlatform());
      setDisplayMessage(message);
      if(modal!=='screen')setError(message);
      setDisplayStatus({orientation:viewportOrientation(window.innerWidth,window.innerHeight),fullscreen:!!document.fullscreenElement});
    }finally{screenChanging.current=false;setDisplayBusy(false);}
  };
  const formatTime=(seconds:number)=>`${Math.floor(seconds/60).toString().padStart(2,'0')}:${Math.floor(seconds%60).toString().padStart(2,'0')}`;
  const stopFire=()=>{if(engine.current)engine.current.shooting=false;};
  const player=hud.player;
  const humanCount=hud.players.filter(operator=>!operator.bot).length;
  const isOnline=hud.mode==='online';

  return <main className={`app ${hud.mode==='lobby'?'is-lobby':'is-playing'} ${touch?'is-touch':''} ${hud.hurt?'hurt':''}`}>
    <canvas ref={canvas} className="world-canvas" data-testid="game-canvas" aria-label="Interactive 3D map of Bhagya Nagar and nearby Nanded streets"/>
    {hud.mode==='lobby'&&<div className="lobby" data-testid="lobby">
      <div className="lobby-shade"/>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Counter Strike Nanded home"><Crosshair size={30}/><span className="brand-wordmark">COUNTER STRIKE <b>NANDED</b></span></Link>
        <span className="prototype-label">MULTIPLAYER PROTOTYPE</span>
        <nav aria-label="Game menu">
          <button className="nav-button" onClick={()=>open('guide')}><Gamepad2 size={18}/><span>CONTROLS & MAP</span></button>
          <button className="icon-button" onClick={()=>open('settings')} aria-label="Settings" data-testid="open-settings"><Settings2 size={21}/></button>
        </nav>
      </header>
      <div className="lobby-content">
        <section className="hero">
          <div className="eyebrow"><MapPin size={16}/> NANDED, MAHARASHTRA <span lang="mr">नांदेड</span></div>
          <h1>COUNTER STRIKE<br/><span>NANDED</span></h1>
          <p className="hero-description">Meet other players on Nanded’s mapped streets.<br/>Real opponents. No bots. Or explore at your own pace.</p>
          <div className="device-hint screen-launcher"><button className="screen-button lobby-screen-button" data-testid="open-screen-lobby" onClick={()=>open('screen')}><Smartphone size={19}/><span>SCREEN</span></button><span>{touch?`${displayStatus.orientation==='landscape'?'Landscape':'Portrait'} view · Switch your screen here`:'WASD to move · Mouse to aim · Click to fire'}</span></div>
          <div className="loadout-preview" aria-label="Every player starts with a rifle, handgun and knife">{LOADOUT.map(slot=><span key={slot.id}><WeaponIcon weapon={slot.id}/>{slot.label}</span>)}</div>
          <div className="start-panel">
            <div className="lobby-name"><label className="input-label" htmlFor="lobby-name">YOUR CALLSIGN</label><input id="lobby-name" maxLength={18} value={name} onChange={event=>setName(event.target.value)} placeholder="Operator" autoComplete="nickname"/></div>

            <div className="hero-buttons">
              <button className="primary-button" data-testid="play-online" disabled={!ready||busy} onClick={()=>void online('quickjoin')}><Users size={21}/><span>{busy?'CONNECTING…':'PLAY ONLINE'}<small>Public match · Bhagya Nagar</small></span><ArrowRight size={21}/></button>
              <button className="secondary-button" data-testid="explore-map" disabled={!ready||busy} onClick={startSolo}><Footprints size={21}/><span>EXPLORE MAP<small>Solo · No opponents</small></span><ArrowRight size={21}/></button>
            </div>
            <div className="room-actions"><button disabled={!ready||busy} onClick={()=>roomDialog('create')}>CREATE PRIVATE ROOM <ArrowUpRight size={14}/></button><button disabled={!ready||busy} onClick={()=>roomDialog('join')}>JOIN A ROOM <ArrowRight size={14}/></button></div>
            <label className="input-label location-label" htmlFor="start-location">EXPLORE / PRIVATE ROOM LOCATION</label>
            <div className="select-wrap"><MapPin size={19}/><select id="start-location" data-testid="start-location" value={locationId} onChange={event=>setLocationId(event.target.value)}>{LOCATIONS.map(location=><option key={location.id} value={location.id}>{location.name}</option>)}</select><ChevronDown size={18}/></div>
            <div className="landmark-shortcuts" role="group" aria-label="Visit a landmark"><span>VISIT A LANDMARK</span><div>{[{id:'iib',name:'IIB'},{id:'rcc',name:'RCC'},{id:'konale',name:'Konale'}].map(landmark=><button key={landmark.id} aria-pressed={locationId===landmark.id} onClick={()=>setLocationId(landmark.id)}>{landmark.name}<MapPin size={13}/></button>)}</div></div>
            <p className="ready-note"><i className={ready?'ready':''}/>{ready?'Ready to play in your browser':'Loading the Nanded map…'}</p>
          </div>
        </section>
        <aside className="map-card">
          <div className="map-card-heading"><span className="eyebrow">ON THE MAP</span><span>N ↑</span></div>
          <canvas ref={previewMap} width={500} height={340} aria-label="Mapped Nanded street layout"/>
          <div className="map-card-copy"><h2>{selectedLocation.name}</h2><p>{selectedLocation.description||'Start on a mapped public road and explore the neighbourhood.'}</p></div>
          <div className="map-facts"><span><b>{LOCATIONS.length}</b> STARTING AREAS</span><span>REAL STREET LAYOUT</span></div>
        </aside>
      </div>
      <footer className="lobby-footer"><span>Play together in Nanded. Real players only.</span><div className="footer-links"><a href="/map-reference.json" target="_blank" rel="noreferrer">MAP SOURCES & ATTRIBUTION <ArrowUpRight size={14}/></a><a href="https://github.com/piyushbodaa/nanded-strike" target="_blank" rel="noreferrer">SOURCE & CONTRIBUTE <ArrowUpRight size={14}/></a></div></footer>
    </div>}

    {hud.mode!=='lobby'&&<div className="game-hud">
      <div className="radar-wrap"><div className="radar-header"><MapPin size={13}/><span>{hud.location}</span><b>N ↑</b></div><canvas ref={minimap} width={360} height={360} aria-label="Minimap with your position and teammates"/></div>
      {hud.exploration?<div className="exploration-status"><Footprints size={19}/><div><b>MAP EXPLORATION</b><span>No enemies · Take your time</span></div></div>:<div className="match-status"><div className="score blue">{hud.scores.blue}</div><div className="match-clock"><span>FIRST TO 25</span><b>{formatTime(hud.remaining)}</b><small>{humanCount} {humanCount===1?'PLAYER':'PLAYERS'}</small></div><div className="score orange">{hud.scores.orange}</div></div>}
      <div className="session-tools"><span>{hud.exploration?'EXPLORE':hud.room==='NANDED'?'PUBLIC MATCH':'PRIVATE MATCH'}</span>{isOnline&&<button className="invite-button" data-testid="room-code" onClick={()=>void copyInvite()} aria-label={`Copy invite for room ${hud.room}`}><span>{hud.room}</span>{copied?<Check size={17}/>:<Copy size={17}/>}</button>}<button className="screen-button" data-testid="open-screen-game" aria-label="Screen orientation and full screen" onClick={()=>open('screen')}><Smartphone size={17}/><span>SCREEN</span></button><button onClick={pause} aria-label="Pause game"><Pause size={20}/></button></div>
      {isOnline&&<div className={`online-status ${!hud.connected?'is-reconnecting':''}`} data-testid="online-status"><i/>{!hud.connected?'RECONNECTING…':humanCount===1?'WAITING FOR OTHER PLAYERS':`${humanCount} REAL PLAYERS · ${hud.ping} MS`}</div>}
      {!hud.exploration&&<div className="kill-feed">{hud.feed.map(feed=><div key={feed.id}>{feed.text}</div>)}</div>}
      {!hud.paused&&player&&player.health>0&&!hud.winner&&<div className={`crosshair ${hud.hit?'hit-confirmed':''}`}><i/><i/><i/><i/><b/></div>}
      {hud.hit&&<div className="hit-marker">×</div>}
      <div className="player-status"><Shield size={21}/><b>{player?.health??100}</b><span>HEALTH</span>{!hud.exploration&&<span className="kd">{player?.kills??0}<small>K</small><i>/</i>{player?.deaths??0}<small>D</small></span>}</div>
      <div className={`weapon-status ${player?.weapon==='knife'?'is-melee':''}`} data-testid="weapon-status"><span className="weapon-type">{player?.weapon==='knife'?'KNIFE · MELEE':player?.weapon==='pistol'?'P12 · HANDGUN':'AR30 · RIFLE'}</span>{player?.weapon==='knife'?<div className="melee-readout"><WeaponIcon weapon="knife"/><span>CLOSE RANGE</span></div>:<div><b>{player?.ammo??30}</b><span>/ {player?.reserve??120}</span></div>}<small>{player?.weapon==='knife'?(touch?'HOLD SLASH TO ATTACK':'CLICK TO SLASH · NO AMMO'):player&&player.reloadUntil>hud.now?'RELOADING…':player?.ammo===0?'RELOAD YOUR WEAPON':touch?'DRAG THE VIEW TO AIM':'R TO RELOAD'}</small></div>
      <div className="weapon-loadout" role="group" aria-label="Weapon loadout">{LOADOUT.map(slot=><button key={slot.id} type="button" data-testid={`weapon-${slot.id}`} aria-label={`Equip ${slot.label.toLowerCase()}`} aria-pressed={(player?.weapon??'rifle')===slot.id} disabled={!player||player.health<=0||!!hud.winner} onClick={()=>engine.current?.selectWeapon(slot.id)}><kbd>{slot.key}</kbd><WeaponIcon weapon={slot.id}/><span>{slot.label}</span></button>)}</div>
      {!touch&&<div className="game-hints"><span><kbd>WASD</kbd> MOVE</span><span><kbd>R</kbd> RELOAD</span><span><kbd>SPACE</kbd> JUMP</span><span><kbd>ESC</kbd> MENU</span></div>}
      {touch&&!hud.paused&&<div className="touch-controls">
        <div className="joystick-wrap"><button className="movement-joystick" data-testid="movement-joystick" aria-label="Movement joystick" onPointerDown={event=>{if(joystickPointer.current!==null)return;joystickPointer.current=event.pointerId;event.currentTarget.setPointerCapture(event.pointerId);moveJoystick(event);}} onPointerMove={moveJoystick} onPointerUp={event=>{if(joystickPointer.current===event.pointerId)resetJoystick();}} onPointerCancel={event=>{if(joystickPointer.current===event.pointerId)resetJoystick();}} onLostPointerCapture={event=>{if(joystickPointer.current===event.pointerId)resetJoystick();}}><span className="joystick-axis"/><span ref={joystickThumb} className="joystick-thumb"><ChevronDown size={19}/></span></button><span className="touch-caption">MOVE · EDGE TO SPRINT</span></div>
        <div className="touch-actions">
          <button className="touch-reload" aria-label="Reload weapon" disabled={player?.weapon==='knife'} onClick={()=>{if(engine.current)engine.current.reloading=true;}}><RotateCcw size={20}/><small>RELOAD</small></button>
          <button className="touch-jump" aria-label="Jump" onClick={()=>{if(engine.current)engine.current.jumping=true;}}><ChevronDown size={24}/><small>JUMP</small></button>
          <button aria-label={player?.weapon==='knife'?'Slash knife':'Fire weapon'} data-testid="fire-button" className="touch-fire" onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);if(engine.current){engine.current.shooting=true;engine.current.queuedShot=true;}}} onPointerUp={stopFire} onPointerCancel={stopFire} onLostPointerCapture={stopFire}>{player?.weapon==='knife'?<WeaponIcon weapon="knife"/>:<Crosshair size={29}/>}<span>{player?.weapon==='knife'?'SLASH':'FIRE'}</span></button>
        </div>
      </div>}
      {player&&player.health<=0&&!hud.paused&&!hud.winner&&<div className="respawn-banner"><span>ELIMINATED</span><h2>BACK IN {Math.max(1,Math.ceil((player.respawnAt-hud.now)/1000))}</h2><p>Find cover. Try another angle.</p></div>}
      {!hud.exploration&&(hud.scoreboard||hud.winner)&&<div className="scoreboard" data-testid="scoreboard"><div className="scoreboard-title"><span>ONLINE MATCH</span><h2>{hud.winner?(hud.winner==='draw'?'DRAW':hud.winner==='blue'?'ALPHA WINS':'BRAVO WINS'):'SCOREBOARD'}</h2>{hud.winner&&<p>Next round starts automatically.</p>}</div><div className="scoreboard-columns"><span>OPERATOR</span><span>K</span><span>D</span></div>{[...hud.players].sort((a,b)=>b.kills-a.kills).map(operator=><div className={`scoreboard-row ${operator.id===player?.id?'is-me':''}`} key={operator.id}><span><i style={{background:operator.team==='blue'?'var(--blue)':'var(--orange)'}}/>{operator.name}<small>{operator.id===player?.id?'YOU':'PLAYER'}</small></span><b>{operator.kills}</b><span>{operator.deaths}</span></div>)}</div>}
      {hud.paused&&!modal&&<div className="overlay pause-overlay"><section className="pause-panel" data-testid="pause-menu" role="dialog" aria-label="Game paused"><div className="eyebrow"><Pause size={15}/>{isOnline?'MATCH MENU':'GAME PAUSED'}</div><h2>{isOnline?'READY TO PLAY?':'TAKE A BREATHER.'}</h2><p>{isOnline?`${humanCount} real ${humanCount===1?'player':'players'} in room ${hud.room}. The match keeps running while this menu is open.`:'Your map exploration is paused.'}</p>{isOnline&&<button className="secondary-button wide pause-invite" onClick={()=>void copyInvite()}><Copy size={18}/>{copied?'INVITE COPIED':'COPY INVITE LINK'}<b>{hud.room}</b></button>}<button className="primary-button wide" data-testid="resume-game" onClick={()=>engine.current?.resume()}><Play size={19}/>{isOnline?'ENTER MATCH':'RESUME'}<ArrowRight size={20}/></button><div className="pause-options"><button className="secondary-button" onClick={()=>open('settings')}><Settings2 size={18}/>SETTINGS</button><button className="secondary-button" data-testid="leave-game" onClick={leave}>{isOnline?'LEAVE MATCH':'BACK TO MENU'}<ArrowRight size={17}/></button></div><p className="pause-tip">{touch?'Left thumb moves. Drag to aim. Tap a loadout slot; hold FIRE or SLASH to attack.':'WASD to move · 1 Rifle · 2 Handgun · 3 Knife · Click to attack'}</p></section></div>}
    </div>}

    {modal&&<div className="overlay modal-overlay" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy&&!displayBusy)close();}}><section ref={modalPanel} className={`modal-panel ${modal==='guide'?'guide-panel':modal==='screen'?'screen-panel':''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" data-testid={modal==='settings'?'settings-panel':modal==='screen'?'screen-panel':undefined}>
      <button className="modal-close icon-button" onClick={close} disabled={busy||displayBusy} aria-label="Close dialog" data-testid={modal==='settings'?'close-settings':undefined}><X size={23}/></button>
      {modal==='screen'?<><div className="eyebrow"><Smartphone size={16}/> SCREEN</div><h2 id="modal-title">YOUR VIEW.</h2><p className="modal-intro">Choose portrait or landscape without leaving your game.</p><div className="screen-current" data-testid="screen-current"><span>NOW SHOWING</span><b>{displayStatus.orientation==='landscape'?'Landscape':'Portrait'}</b><small>{displayStatus.fullscreen?'Full screen':'Browser window'}</small></div><div className="screen-modes" role="group" aria-label="Screen orientation">{([{mode:'landscape',label:'Landscape',hint:'Wider view'},{mode:'portrait',label:'Portrait',hint:'Upright view'},{mode:'auto',label:'Auto rotate',hint:'Follow your phone'}] as const).map(choice=><button key={choice.mode} className={displayMode===choice.mode?'selected':''} aria-pressed={displayMode===choice.mode} disabled={displayBusy} data-testid={`screen-${choice.mode}`} onClick={()=>void chooseDisplay(choice.mode)}>{choice.mode==='auto'?<RotateCcw size={25}/>:<Smartphone size={25} className={choice.mode==='landscape'?'landscape-icon':''}/>}<b>{choice.label}</b><small>{choice.hint}</small>{displayMode===choice.mode&&<Check size={15} className="screen-choice-check"/>}</button>)}</div><p className="screen-message" role="status" aria-live="polite" data-testid="screen-message">{displayBusy?'Changing your screen…':displayMessage}</p><button className="secondary-button wide" data-testid="screen-fullscreen" disabled={displayBusy} onClick={()=>void fullScreen()}><Maximize2 size={18}/>{displayStatus.fullscreen?'LEAVE FULL SCREEN':'ENTER FULL SCREEN'}</button><button className="primary-button wide screen-done" disabled={displayBusy} onClick={()=>{close();if(hud.mode!=='lobby')engine.current?.resume();}}><Check size={18}/>{hud.mode==='lobby'?'DONE':'BACK TO GAME'}</button></>:modal==='multiplayer'?<><div className="eyebrow"><Users size={16}/> PRIVATE ROOMS</div><h2 id="modal-title">PLAY TOGETHER.</h2><p className="modal-intro">Invite friends on phones or laptops. Up to eight real players. No bots fill empty places.</p><div className="segmented-tabs room-tabs"><button className={onlineTab==='create'?'selected':''} onClick={()=>setOnlineTab('create')} disabled={busy}>CREATE ROOM</button><button className={onlineTab==='join'?'selected':''} onClick={()=>setOnlineTab('join')} disabled={busy}>JOIN ROOM</button></div><div className="setting"><label htmlFor="room-player-name">Your callsign</label><input id="room-player-name" data-testid="room-player-name" maxLength={18} value={name} onChange={event=>setName(event.target.value)} placeholder="Operator"/></div>{onlineTab==='create'?<><label className="input-label" htmlFor="private-location">MATCH START</label><div className="select-wrap"><MapPin size={19}/><select id="private-location" value={locationId} onChange={event=>setLocationId(event.target.value)}>{LOCATIONS.map(location=><option key={location.id} value={location.id}>{location.name}</option>)}</select><ChevronDown size={18}/></div></>:<div className="setting"><label htmlFor="room-input">Six-character room code</label><input id="room-input" data-testid="room-code-input" value={room} onChange={event=>setRoom(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'' ).slice(0,6))} placeholder="ABC234" className="code-input" maxLength={6}/></div>}<button className="primary-button wide" data-testid={onlineTab==='create'?'create-room':'join-room'} disabled={!ready||busy||(onlineTab==='join'&&room.length!==6)} onClick={()=>void online(onlineTab)}><Users size={19}/>{busy?'CONNECTING…':onlineTab==='create'?'CREATE & ENTER':'JOIN MATCH'}<ArrowRight size={20}/></button><p className="modal-footnote">Share the invite link after creating your room.</p></>:modal==='settings'?<><div className="eyebrow"><Settings2 size={16}/> SETTINGS</div><h2 id="modal-title">MAKE IT YOURS.</h2><div className="setting"><label htmlFor="player-name">Callsign</label><input id="player-name" data-testid="player-name" maxLength={18} value={name} onChange={event=>setName(event.target.value)} placeholder="Operator" autoComplete="nickname"/></div><div className="setting"><label htmlFor="sensitivity">Aim sensitivity <b>{settings.sensitivity.toFixed(1)}×</b></label><input id="sensitivity" type="range" min="0.3" max="2.5" step="0.1" value={settings.sensitivity} onChange={event=>setSettings({...settings,sensitivity:Number(event.target.value)})}/><div className="range-labels"><span>PRECISE</span><span>FAST</span></div></div><div className="setting"><label htmlFor="volume"><span><Volume2 size={16}/> Sound volume</span><b>{Math.round(settings.volume*100)}%</b></label><input id="volume" type="range" min="0" max="1" step="0.05" value={settings.volume} onChange={event=>setSettings({...settings,volume:Number(event.target.value)})}/></div><div className="setting"><label>Graphics</label><div className="segmented-tabs" role="group" aria-label="Graphics quality"><button aria-pressed={settings.quality==='high'} className={settings.quality==='high'?'selected':''} onClick={()=>setSettings({...settings,quality:'high'})}>SHARP<small>Full detail & shadows</small></button><button aria-pressed={settings.quality==='low'} className={settings.quality==='low'?'selected':''} onClick={()=>setSettings({...settings,quality:'low'})}>PERFORMANCE<small>Lighter on your device</small></button></div></div><button className="secondary-button wide" onClick={()=>open('screen')}><Smartphone size={18}/>SCREEN & ORIENTATION</button><p className="modal-footnote"><Check size={15}/> Settings are saved on this device.</p></>:<><div className="eyebrow"><Gamepad2 size={16}/> CONTROLS & MAP</div><h2 id="modal-title">FIND YOUR FEET.</h2><p className="modal-intro">Play online joins the shared public match in Bhagya Nagar. Create a private room to choose another starting area and invite friends. Rooms contain real players only: first to 25 eliminations wins, with five-minute rounds and automatic respawns. Explore has no opponents or time limit.</p><div className="controls-grid">{[['W A S D','Move'],['MOUSE','Aim'],['LEFT CLICK','Fire / slash'],['R','Reload'],['1 / 2 / 3','Rifle / handgun / knife'],['SHIFT','Sprint'],['SPACE','Jump'],['TAB','Scoreboard'],['ESC','Pause / menu']].map(([key,label])=><div key={key}><kbd>{key}</kbd><span>{label}</span></div>)}</div><p className="guide-note"><HelpCircle size={20}/>On a phone or tablet, use the left thumb joystick to move; push to its edge to sprint. Drag the open view to aim. Tap Rifle, Handgun or Knife in your loadout. Hold FIRE to shoot or SLASH for a close-range knife attack. Reload and jump have separate buttons.</p><div className="guide-map-note"><MapPin size={22}/><div><b>GROUNDED IN NANDED</b><p>Street positions and building footprints come from map datasets. Building heights, façades, street widths, and gameplay props are interpretations, not a photographic reconstruction.</p><a href="/map-reference.json" target="_blank" rel="noreferrer">Map sources & accuracy notes <ArrowUpRight size={14}/></a><p className="attribution">Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>. Building data: <a href="https://docs.overturemaps.org/attribution/" target="_blank" rel="noreferrer">Overture Maps</a> and <a href="https://sites.research.google/gr/open-buildings/" target="_blank" rel="noreferrer">Google Open Buildings</a>.</p></div></div></>}
      {error&&<div className="inline-error" role="alert">{error}</div>}
    </section></div>}
    {error&&!modal&&<div className={`toast ${fatal?'fatal-toast':''}`} role="alert"><span>{error}</span>{!fatal&&<button onClick={()=>setError('')} aria-label="Dismiss message"><X size={20}/></button>}</div>}
  </main>;
}
