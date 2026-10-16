'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Check, Copy, Crosshair, Gamepad2, HelpCircle, MapPin, Maximize2, Pause, Radio, Settings2, Shield, Users, Volume2, X } from 'lucide-react';
import type { GameClient, HUD, Settings } from '../lib/client';

const initialHUD:HUD={now:0,mode:'lobby',paused:false,player:null,players:[],scores:{blue:0,orange:0},remaining:300,room:'',ping:0,winner:null,feed:[],hit:false,hurt:false,connected:true,scoreboard:false};
const defaultSettings:Settings={sensitivity:1,volume:.35,quality:'high'};
type Modal='multiplayer'|'settings'|'guide'|'arsenal'|null;

export default function Home(){
  const canvas=useRef<HTMLCanvasElement>(null), minimap=useRef<HTMLCanvasElement>(null), previewMap=useRef<HTMLCanvasElement>(null), engine=useRef<GameClient|null>(null);
  const [hud,setHUD]=useState<HUD>(initialHUD),[ready,setReady]=useState(false),[error,setError]=useState(''),[fatal,setFatal]=useState(false),[modal,setModal]=useState<Modal>(null),[busy,setBusy]=useState(false);
  const [name,setName]=useState('Operator'),[room,setRoom]=useState(''),[settings,setSettings]=useState(defaultSettings),[copied,setCopied]=useState(false),[touch,setTouch]=useState(false);
  const [onlineTab,setOnlineTab]=useState<'create'|'join'>('create');
  const settingsRef=useRef(defaultSettings);
  useEffect(()=>{
    let disposed=false;
    const initialize=async()=>{
      const {GameClient}=await import('../lib/client');
      await document.fonts.load('700 92px "Noto Sans Devanagari"').catch(()=>{});
      if(disposed||!canvas.current)return;
      const isTouch=matchMedia('(pointer:coarse)').matches;
      let nextSettings:Settings={...defaultSettings,quality:isTouch?'low':'high'};
      let savedName='Operator';
      try {
        const saved=JSON.parse(localStorage.getItem('nanded-settings')||'null');
        if(saved)nextSettings={sensitivity:Math.max(.3,Math.min(2.5,Number(saved.sensitivity)||1)),volume:Math.max(0,Math.min(1,Number(saved.volume)||0)),quality:saved.quality==='low'?'low':'high'};
        savedName=localStorage.getItem('nanded-name')||'Operator';
      }catch{}
      settingsRef.current=nextSettings;setSettings(nextSettings);setName(savedName);setTouch(isTouch);
      const code=new URLSearchParams(window.location.search).get('room');
      if(code){setRoom(code.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6));setOnlineTab('join');setModal('multiplayer');}
      const game=new GameClient(canvas.current,setHUD,setError);engine.current=game;game.updateSettings(nextSettings);setReady(true);
    };
    void initialize().catch(err=>{if(disposed)return;setFatal(true);setError('The 3D arena could not start. Reload or enable hardware acceleration in a current browser.');console.error(err);});
    return()=>{disposed=true;engine.current?.dispose();engine.current=null;};
  },[]);
  useEffect(()=>{if(!ready)return;settingsRef.current=settings;engine.current?.updateSettings(settings);try{localStorage.setItem('nanded-settings',JSON.stringify(settings));}catch{}},[settings,ready]);
  useEffect(()=>{if(!ready)return;try{localStorage.setItem('nanded-name',name);}catch{}},[name,ready]);
  useEffect(()=>{if(minimap.current)engine.current?.drawMinimap(minimap.current,hud.players,hud.player?.id);if(previewMap.current)engine.current?.drawMinimap(previewMap.current);},[hud,modal]);
  const startSolo=()=>{setError('');setModal(null);engine.current?.startSolo(name);};
  const online=async()=>{if(!engine.current)return;setBusy(true);setError('');try{await engine.current.startOnline(onlineTab,name,room);setModal(null);}catch(e){setError(e instanceof Error?e.message:'Could not connect to the room.');}finally{setBusy(false);}};
  const copyRoom=async()=>{const url=new URL(window.location.href);url.searchParams.set('room',hud.room);try{await navigator.clipboard.writeText(url.toString());setCopied(true);setTimeout(()=>setCopied(false),2000);}catch{setError(`Room code: ${hud.room}. Share this code with your friends.`);}};
  const open=(which:Modal)=>{if(hud.mode!=='lobby')engine.current?.pause();setError('');setModal(which);};
  const close=()=>{setModal(null);setError('');};
  const leave=()=>{engine.current?.leave();setModal(null);};
  const fullScreen=()=>{if(!document.documentElement.requestFullscreen){setError('Use your browser in landscape for a wider view. Full screen is unavailable on this device.');return;}if(!document.fullscreenElement)void document.documentElement.requestFullscreen().catch(()=>setError('Full screen is unavailable in this browser window.'));else void document.exitFullscreen();};
  const formatTime=(s:number)=>`${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;
  const player=hud.player;
  return <main className={`app ${hud.mode==='lobby'?'is-lobby':'is-playing'} ${hud.hurt?'hurt':''}`}>
    <canvas ref={canvas} className="world-canvas" data-testid="game-canvas" aria-label="Interactive 3D Bhagya Nagar arena"/>
    <div className="scene-grain"/>
    {hud.mode==='lobby'&&<div className="lobby" data-testid="lobby">
      <div className="lobby-shade"/>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Nanded Strike home"><span className="brand-mark"><Crosshair size={28}/></span><span>NANDED<span className="brand-secondary">STRIKE</span></span><span className="brand-divider"/><span className="brand-edition">TACTICAL<br/>MULTIPLAYER</span></Link>
        <nav aria-label="Main navigation"><button className="nav-link active" onClick={()=>setModal(null)}>PLAY <span>01</span></button><button className="nav-link" onClick={()=>open('arsenal')}>ARSENAL <span>02</span></button><button className="nav-link" onClick={()=>open('guide')}>FIELD GUIDE <span>03</span></button></nav>
        <div className="header-actions"><span className="edition"><i/> BROWSER EDITION</span><button className="icon-button" onClick={()=>open('settings')} aria-label="Settings" data-testid="open-settings"><Settings2 size={19}/></button></div>
      </header>
      <section className="hero">
        <div className="eyebrow"><span className="tiny-line"/> MAHARASHTRA, INDIA <span className="eyebrow-dot">/</span> नांदेड</div>
        <h1>NANDED<br/><span>STRIKE<span className="title-dot">.</span></span></h1>
        <p className="hero-tagline">Familiar streets. A whole new battleground.</p>
        <p className="hero-description">Bhagya Nagar main road. Familiar turns.<br/>Squad up on home ground.</p>
        <div className="hero-buttons"><button className="primary-button" disabled={!ready||busy} onClick={()=>open('multiplayer')}><Users size={19}/><span>PLAY WITH FRIENDS</span><ArrowUpRight size={21}/></button><button className="practice-button" data-testid="start-solo" disabled={!ready||busy} onClick={startSolo}><Crosshair size={19}/><span>SOLO PRACTICE</span><ArrowRight size={18}/></button></div>
        <div className="play-notes"><span><i/>{ready?'READY WHEN YOU ARE':'PREPARING THE ARENA'}</span><span>No download. Just drop in.</span></div>
      </section>
      <aside className="map-card">
        <div className="map-card-top"><span className="tag">BHAGYA NAGAR UPDATE</span><span className="map-index">MAP / 001</span></div>
        <div className="map-card-body"><div><div className="map-label"><MapPin size={13}/> NANDED · INDIA</div><h2>BHAGYA<br/>NAGAR</h2><p>Main road. Residential lanes.<br/>A new kind of home advantage.</p></div><div className="map-blueprint"><canvas ref={previewMap} width={200} height={200} aria-label="Bhagya Nagar street layout"/><span>N ↑</span></div></div>
        <div className="map-card-footer"><span><span className="map-dot"/> TEAM DEATHMATCH</span><span>2–8 PLAYERS <Users size={12}/></span></div>
      </aside>
      <footer className="lobby-footer"><span className="footer-left"><span className="version">ALPHA 02</span><span>BUILT FOR THE BROWSER. ROOTED IN NANDED.</span></span><button onClick={()=>open('guide')}><Gamepad2 size={16}/> LEARN THE CONTROLS <ArrowUpRight size={13}/></button><span className="footer-right"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">STREETS © OPENSTREETMAP</a><span>© 2026 NANDED STRIKE</span></span></footer>
    </div>}

    {hud.mode!=='lobby'&&<div className="game-hud">
      <div className="radar-wrap"><div className="radar-header"><span>BHAGYA NAGAR</span><span>N ↑</span></div><canvas ref={minimap} width={180} height={180} aria-label="Minimap with friendly player positions"/><div className="team-label" style={{color:player?.team==='blue'?'var(--blue)':'var(--orange)'}}><Shield size={12}/>{player?.team==='blue'?'ALPHA SQUAD':'BRAVO SQUAD'}</div></div>
      <div className="match-status"><div className="score blue">{hud.scores.blue}</div><div className="match-clock"><span>FIRST TO 25</span><b>{formatTime(hud.remaining)}</b><small>TEAM DEATHMATCH</small></div><div className="score orange">{hud.scores.orange}</div></div>
      <div className="session-tools"><span className="connection-status"><i className={hud.connected?'':'offline'}/>{hud.mode==='solo'?'SOLO PRACTICE':hud.connected?`${hud.ping} MS`:'RECONNECTING…'}</span>{hud.room&&<button data-testid="room-code" onClick={copyRoom}><span>ROOM</span> {hud.room} {copied?<Check size={13}/>:<Copy size={13}/>}</button>}<button onClick={()=>engine.current?.pause()} aria-label="Pause game"><Pause size={16}/></button></div>
      <div className="kill-feed">{hud.feed.map(f=><div key={f.id}>{f.text}</div>)}</div>
      {!hud.paused&&player&&player.health>0&&!hud.winner&&<div className={`crosshair ${hud.hit?'hit-confirmed':''}`}><i/><i/><i/><i/><b/></div>}
      {hud.hit&&<div className="hit-marker">×</div>}
      <div className="player-status"><span className="health-icon">+</span><b>{player?.health??100}</b><div><span>HEALTH</span><div className="health-track"><i style={{width:`${player?.health??100}%`}}/></div></div><span className="kd">{player?.kills??0}<small> K </small><i>/</i>{player?.deaths??0}<small> D</small></span></div>
      <div className="weapon-status"><div className="weapon-type">{player?.weapon==='pistol'?'SIDEARM / P12':'ASSAULT RIFLE / AR30'}</div><div><b>{player?.ammo??30}</b><span>/ {player?.reserve??120}</span></div><small>{player&&player.reloadUntil>hud.now?'RELOADING…':player?.ammo===0?(touch?'TAP R TO RELOAD':'PRESS R TO RELOAD'):(touch?'DRAG TO AIM · TAP TO FIRE':'1  RIFLE     2  SIDEARM')}</small></div>
      {!touch&&<div className="game-hints"><kbd>W A S D</kbd> MOVE <span>·</span> <kbd>R</kbd> RELOAD <span>·</span> <kbd>TAB</kbd> SCORE <span>·</span> <kbd>ESC</kbd> MENU</div>}
      {touch&&!hud.paused&&<div className="touch-controls"><div className="touch-pad">{[['↑',1,0],['←',0,-1],['↓',-1,0],['→',0,1]].map(([label,f,s])=><button key={String(label)} aria-label={`Move ${label}`} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);if(engine.current)engine.current.touchMove={forward:Number(f),strafe:Number(s)};}} onPointerUp={()=>{if(engine.current)engine.current.touchMove={forward:0,strafe:0};}} onPointerCancel={()=>{if(engine.current)engine.current.touchMove={forward:0,strafe:0};}}>{label}</button>)}</div><div className="touch-actions"><button aria-label="Switch weapon" onClick={()=>{if(engine.current)engine.current.selectedWeapon=engine.current.selectedWeapon==='rifle'?'pistol':'rifle';}}>1/2</button><button aria-label="Reload weapon" onClick={()=>{if(engine.current)engine.current.reloading=true;}}>R</button><button aria-label="Jump" onClick={()=>{if(engine.current)engine.current.jumping=true;}}>↑</button><button aria-label="Fire weapon" className="touch-fire" onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);if(engine.current){engine.current.shooting=true;engine.current.queuedShot=true;}}} onPointerUp={()=>{if(engine.current)engine.current.shooting=false;}} onPointerCancel={()=>{if(engine.current)engine.current.shooting=false;}}><Crosshair size={28}/></button></div></div>}
      {player&&player.health<=0&&!hud.paused&&!hud.winner&&<div className="respawn-banner"><span>YOU WERE ELIMINATED</span><h2>BACK IN {Math.max(1,Math.ceil((player.respawnAt-hud.now)/1000))}</h2><p>Regroup. Find another angle.</p></div>}
      {(hud.scoreboard||hud.winner)&&<div className="scoreboard" data-testid="scoreboard"><div className="scoreboard-title"><span>MATCH REPORT</span><h2>{hud.winner?(hud.winner==='draw'?'DRAW':hud.winner==='blue'?'ALPHA SQUAD WINS':'BRAVO SQUAD WINS'):'BHAGYA NAGAR'}</h2>{hud.winner&&<p>Next round starts automatically.</p>}</div><div className="scoreboard-columns"><span>OPERATOR</span><span>K</span><span>D</span></div>{[...hud.players].sort((a,b)=>b.kills-a.kills).map(p=><div className={`scoreboard-row ${p.id===player?.id?'is-me':''}`} key={p.id}><span><i style={{background:p.team==='blue'?'var(--blue)':'var(--orange)'}}/>{p.name}{p.id===player?.id&&<small>YOU</small>}{p.bot&&<small>BOT</small>}</span><b>{p.kills}</b><span>{p.deaths}</span></div>)}</div>}
      {hud.paused&&!modal&&<div className="overlay pause-overlay"><div className="pause-panel" data-testid="pause-menu"><div className="eyebrow"><span className="tiny-line"/>{hud.mode==='online'?'YOUR SQUAD IS WAITING':'TAKE A BREATHER'}</div><h2>{hud.mode==='online'?'READY TO DROP?':'ON YOUR MARK.'}</h2><p>{hud.mode==='online'?'Your match stays live while this menu is open.':'Your practice match is paused.'}</p>{hud.room&&<button className="room-invite" onClick={copyRoom}><Radio size={16}/><span>INVITE CODE <b>{hud.room}</b></span>{copied?<Check size={17}/>:<Copy size={17}/>}</button>}<button className="primary-button wide" data-testid="resume-game" onClick={()=>engine.current?.resume()}><Crosshair size={19}/>ENTER ARENA<ArrowRight size={20}/></button><div className="pause-options"><button onClick={()=>open('settings')}><Settings2 size={16}/>SETTINGS</button><button data-testid="leave-game" onClick={leave}>LEAVE MATCH<ArrowUpRight size={15}/></button></div><div className="pause-tip">{touch?'Drag the right side to aim. Use the buttons to move and fire.':'WASD to move · Mouse to aim · Click to fire'}</div></div></div>}
    </div>}

    {modal&&<div className="overlay modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)close();}}><section className={`modal-panel ${modal==='guide'?'guide-panel':''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" data-testid={modal==='settings'?'settings-panel':undefined}><button className="modal-close icon-button" onClick={close} disabled={busy} aria-label="Close dialog" data-testid={modal==='settings'?'close-settings':undefined}><X size={21}/></button>
      {modal==='multiplayer'&&<><div className="eyebrow"><Users size={15}/> BETTER WITH YOUR SQUAD</div><h2 id="modal-title">MAKE IT A MATCH.</h2><p className="modal-intro">One room. Phones and laptops playing together.<br/>Share an invite link or code. Bots fill empty spots.</p><label className="input-label" htmlFor="player-name">YOUR CALLSIGN</label><input id="player-name" data-testid="player-name" maxLength={18} value={name} onChange={e=>setName(e.target.value)} placeholder="Enter a callsign" autoComplete="nickname"/><div className="segmented-tabs"><button className={onlineTab==='create'?'selected':''} onClick={()=>setOnlineTab('create')}>CREATE ROOM</button><button className={onlineTab==='join'?'selected':''} onClick={()=>setOnlineTab('join')}>JOIN ROOM</button></div>{onlineTab==='join'?<><label className="input-label" htmlFor="room-input">SIX-CHARACTER ROOM CODE</label><input id="room-input" data-testid="room-code-input" value={room} onChange={e=>setRoom(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6))} placeholder="ABC123" className="code-input" maxLength={6}/></>:<div className="match-preview"><div className="match-preview-icon"><Crosshair size={27}/></div><div><b>BHAGYA NAGAR</b><span>Team deathmatch · First to 25 · 5 minutes</span></div><span className="tag">8 MAX</span></div>}<button className="primary-button wide" data-testid={onlineTab==='create'?'create-room':'join-room'} disabled={!ready||busy||(onlineTab==='join'&&room.length!==6)||!name.trim()} onClick={online}><Users size={18}/>{busy?'CONNECTING…':onlineTab==='create'?'CREATE & ENTER':'JOIN MATCH'}<ArrowRight size={20}/></button><p className="modal-footnote"><Shield size={12}/> Friendly fire off. Teams are balanced automatically.</p></>}
      {modal==='settings'&&<><div className="eyebrow"><Settings2 size={15}/> DIAL IT IN</div><h2 id="modal-title">YOUR SETUP.</h2><p className="modal-intro">Small adjustments. Better instincts.</p><div className="setting"><label htmlFor="sensitivity">Aim sensitivity <b>{settings.sensitivity.toFixed(1)}×</b></label><input id="sensitivity" type="range" min="0.3" max="2.5" step="0.1" value={settings.sensitivity} onChange={e=>setSettings({...settings,sensitivity:Number(e.target.value)})}/><div className="range-labels"><span>PRECISE</span><span>FAST</span></div></div><div className="setting"><label htmlFor="volume"><span><Volume2 size={15}/> Sound volume</span><b>{Math.round(settings.volume*100)}%</b></label><input id="volume" type="range" min="0" max="1" step="0.05" value={settings.volume} onChange={e=>setSettings({...settings,volume:Number(e.target.value)})}/></div><div className="setting"><label>Graphics quality</label><div className="segmented-tabs"><button className={settings.quality==='high'?'selected':''} onClick={()=>setSettings({...settings,quality:'high'})}>HIGH · SHADOWS ON</button><button className={settings.quality==='low'?'selected':''} onClick={()=>setSettings({...settings,quality:'low'})}>LOW · FASTER PLAY</button></div></div><button className="secondary-button wide" onClick={fullScreen}><Maximize2 size={16}/>TOGGLE FULL SCREEN</button><p className="modal-footnote"><Check size={13}/> Settings are saved on this device.</p></>}
      {modal==='guide'&&<><div className="eyebrow"><Gamepad2 size={16}/> KNOW YOUR GROUND</div><h2 id="modal-title">THE FIELD GUIDE.</h2><p className="modal-intro">Two squads. Your neighbourhood. First to 25 eliminations wins.<br/>Five-minute matches with automatic respawns.</p><div className="controls-grid">{[['W A S D','Move'],['MOUSE','Aim'],['LEFT CLICK','Fire'],['R','Reload'],['1 / 2','Rifle / sidearm'],['SHIFT','Sprint'],['SPACE','Jump'],['TAB','Scoreboard'],['ESC','Pause / menu']].map(([key,label])=><div key={key}><kbd>{key}</kbd><span>{label}</span></div>)}</div><p className="guide-note"><HelpCircle size={17}/>On a touch screen, use the movement pad, drag the arena to aim, and tap the crosshair to fire.</p><div className="guide-map-note"><MapPin size={19}/><div><b>BHAGYA NAGAR. YOUR HOME GROUND.</b><p>Roads follow OpenStreetMap street geometry near Bhagya Nagar Kaman, Nanded. Building appearances, street widths, and cover are stylized for gameplay.</p><a href="https://www.openstreetmap.org/#map=18/19.17735/77.30950" target="_blank" rel="noreferrer">View the real Bhagya Nagar <ArrowUpRight size={12}/></a></div></div></>}
      {modal==='arsenal'&&<><div className="eyebrow"><Crosshair size={16}/> PICK YOUR APPROACH</div><h2 id="modal-title">THE ESSENTIALS.</h2><p className="modal-intro">Every operator starts with the same kit.<br/>Your positioning makes the difference.</p><div className="arsenal-card"><div className="weapon-silhouette rifle-silhouette"><i/><i/><i/><i/><i/></div><div className="arsenal-title"><h3>AR30</h3><span>PRIMARY / KEY 1</span></div><p>Automatic rifle. Control the lane and make every burst count.</p><div className="weapon-stats"><span>MAGAZINE <b>30</b></span><span>ROLE <b>ALL-ROUNDER</b></span></div></div><div className="arsenal-card sidearm-card"><div className="arsenal-title"><h3>P12</h3><span>SIDEARM / KEY 2</span></div><p>A compact backup when your rifle runs dry.</p><div className="weapon-stats"><span>MAGAZINE <b>12</b></span><span>ROLE <b>QUICK BACKUP</b></span></div></div><p className="modal-footnote">Press R to reload. Ammo resets each time you respawn.</p></>}
      {error&&<div className="inline-error" role="alert">{error}</div>}
    </section></div>}
    {error&&!modal&&<div className={`toast ${fatal?'fatal-toast':''}`} role="alert"><span>{error}</span>{!fatal&&<button onClick={()=>setError('')} aria-label="Dismiss message"><X size={16}/></button>}</div>}
  </main>;
}
