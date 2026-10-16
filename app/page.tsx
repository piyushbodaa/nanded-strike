'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { ArrowRight, ArrowUpRight, Bomb, Bot, Check, ChevronDown, Copy, Crosshair, Eye, Footprints, Gamepad2, HelpCircle, MapPin, Maximize2, Pause, Play, RotateCcw, Search, Settings2, Shield, ShoppingBag, Smartphone, Users, Volume2, X } from 'lucide-react';
import type { GameClient, HUD, Settings } from '../lib/client';
import { WEAPONS, PURCHASES, CLASSIC_TARGET_SCORE, type Weapon, type MatchMode as GameMode, type GrenadeType as GrenadeKind, type PurchaseId } from '../lib/simulation';
import { DEFAULT_LOCATION_ID, LOCATIONS } from '../lib/locations';
import { PLACES, PLACE_CATEGORIES, PLACE_SECTORS, getPlace, placeSearchText } from '../lib/places';
import { browserDisplayPlatform, requestDisplayMode, rotateHint, toggleDisplayFullscreen, viewportOrientation, type DisplayMode } from '../lib/display-mode';
import { BOT_DIFFICULTY_OPTIONS, DEFAULT_BOT_DIFFICULTY, normalizeBotDifficulty, type BotDifficulty } from '../lib/bot-difficulty';

const initialHUD: HUD = { now:0, mode:'lobby', paused:false, player:null, players:[], scores:{blue:0,orange:0}, remaining:300, room:'', ping:0, winner:null, feed:[], hit:false, hurt:false, connected:true, scoreboard:false, location:'Bhagya Nagar', exploration:false, aim:0, scoped:false, crouched:false, gameMode:'classic', classic:null, buyOpen:false, selectedGrenade:'he', round:1, canBuy:false, spectating:'',botMatch:false,watching:false,botDifficulty:DEFAULT_BOT_DIFFICULTY };
const defaultSettings: Settings = { sensitivity:1, volume:.35, quality:'high' };
type Modal = 'multiplayer' | 'settings' | 'guide' | 'screen' | 'places' | null;
const WEAPON_LABELS:Record<Weapon,string>={rifle:'Rifle',pistol:'Handgun',knife:'Knife',smg:'SMG',sniper:'Sniper',shotgun:'Shotgun'};
const UTILITIES:{id:GrenadeKind;label:string;short:string}[]=[{id:'he',label:'HE grenade',short:'HE'},{id:'flash',label:'Flashbang',short:'FLASH'},{id:'smoke',label:'Smoke grenade',short:'SMOKE'}];
const BOT_DIFFICULTY_STORAGE_KEY='nanded-bot-difficulty-v1';
const STARTUP_PHASES=[
  {id:'client',label:'Opening the game'},
  {id:'assets',label:'Loading Nanded and your squad'},
  {id:'scene',label:'Preparing the streets'},
] as const;
type StartupPhase=(typeof STARTUP_PHASES)[number]['id'];

function StartupLoading({phase,onSkip}:{phase:StartupPhase;onSkip:()=>void}) {
  const current=STARTUP_PHASES.findIndex(item=>item.id===phase);
  return <section className="startup-loading" data-testid="startup-loading" aria-label="Counter Strike Nanded loading">
    <div className="startup-grid" aria-hidden="true"/>
    <div className="startup-frame">
      <div className="startup-kicker"><span>FIELD BRIEFING</span><span>BHAGYA NAGAR · NANDED</span></div>
      <div className="startup-emblem" aria-hidden="true"><i/><Crosshair size={70}/><b>N</b></div>
      <h2>COUNTER STRIKE<span>NANDED</span></h2>
      <p className="startup-tagline">Know the streets. Back your team.</p>
      <div className="startup-progress" role="status" aria-live="polite"><span className="startup-phase" data-testid="startup-phase">{STARTUP_PHASES[current].label}</span><div className="startup-steps" aria-hidden="true">{STARTUP_PHASES.map((item,index)=><i key={item.id} className={index<current?'complete':index===current?'current':''}/>)}</div></div>
      <div className="startup-footer"><span>LOCAL STREETS · ORIGINAL GAME</span><button type="button" data-testid="skip-startup" onClick={onSkip}>SKIP INTRO <ArrowRight size={17}/></button></div>
    </div>
  </section>;
}

function MatchBriefing({phase,eyebrow,title,detail,muted}:{phase:string;eyebrow:string;title:string;detail:string;muted:boolean}) {
  const [armed,setArmed]=useState(false);
  useEffect(()=>{
    if(muted||armed)return;
    let secondFrame=0;
    // Let the initial world render complete before starting the brief visible cue.
    const firstFrame=requestAnimationFrame(()=>{secondFrame=requestAnimationFrame(()=>setArmed(true));});
    return()=>{cancelAnimationFrame(firstFrame);cancelAnimationFrame(secondFrame);};
  },[muted,armed]);
  return <div className={`match-briefing ${armed?'is-armed':''} ${phase==='over'?'round-result':''} ${muted?'briefing-muted':''}`} data-testid="match-entry" data-phase={phase} aria-hidden="true"><div className="briefing-rule"/><span>{eyebrow}</span><h2>{title}</h2><p>{detail}</p><div className="briefing-rule"/></div>;
}

function DifficultyChoice({value,onChange,prefix='',disabled=false}:{value:BotDifficulty;onChange:(difficulty:BotDifficulty)=>void;prefix?:string;disabled?:boolean}) {
  const option=BOT_DIFFICULTY_OPTIONS.find(item=>item.id===value)??BOT_DIFFICULTY_OPTIONS[0];
  const hintId=`${prefix}bot-difficulty-hint`;
  return <div className="bot-difficulty-choice"><div className="difficulty-heading"><b>BOT DIFFICULTY</b><span>{prefix?'Change without restarting':'Start with Beginner'}</span></div><div className="difficulty-options" role="group" aria-label="Bot difficulty" aria-describedby={hintId}>{BOT_DIFFICULTY_OPTIONS.map(item=><button key={item.id} type="button" data-testid={`${prefix}difficulty-${item.id}`} aria-pressed={value===item.id} disabled={disabled} onClick={()=>onChange(item.id)}>{item.label}</button>)}</div><p id={hintId} data-testid={hintId} role="status">{option.description}</p></div>;
}

function ModeChoice({value,onChange,prefix=''}:{value:GameMode;onChange:(mode:GameMode)=>void;prefix?:string}) {
  return <div className="mode-choice" role="group" aria-label="Game rules">{([{id:'classic',name:'BOMB DEFUSAL',description:'Plant or defuse · One life per round'},{id:'deathmatch',name:'DEATHMATCH',description:'All weapons · Respawn and fight'}] as const).map(mode=><button key={mode.id} data-testid={`${prefix}mode-${mode.id}`} aria-pressed={value===mode.id} onClick={()=>onChange(mode.id)}>{mode.id==='classic'?<Bomb size={18}/>:<Crosshair size={18}/>}<span><b>{mode.name}</b><small>{mode.description}</small></span></button>)}</div>;
}

function WeaponIcon({weapon}:{weapon:Weapon}) {
  const path=weapon==='pistol'?'M19 5h42v11H38l-5 14H19l6-16h-6zm18 12h11v7H35l2-4h7v-2h-8z':weapon==='knife'?'M4 13h25v-4h5v4h37l7 4-17 5H34v4h-5v-5H4z':weapon==='sniper'?'M2 14h22l8-4h23v4h23v3H48l-8 12h-9l4-11H15l-9 9H2zm27-9h25v5H29z':weapon==='shotgun'?'M3 13h27V9h48v5H43v5H29l-7 11h-9l6-13H9l-6 8zm35 3h23v6H38z':weapon==='smg'?'M8 9h18v4h32v-3h17v10H44v10H34V20h-9l-4 10h-9l4-13H8z':'M3 9h17v4h12v-3h26v3h15v3h5v3H58v3H44l-3 8h-9l2-10h-7l-3 9h-7l2-11H8l-5 4zm36-3h10v4H39z';
  return <svg viewBox="0 0 80 32" aria-hidden="true" focusable="false"><path fill="currentColor" d={path}/></svg>;
}

export default function Home() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const minimap = useRef<HTMLCanvasElement>(null);
  const previewMap = useRef<HTMLCanvasElement>(null);
  const placesMap = useRef<HTMLCanvasElement>(null);
  const engine = useRef<GameClient|null>(null);
  const modalPanel = useRef<HTMLElement>(null);
  const buyPanel = useRef<HTMLElement>(null);
  const pausePanel = useRef<HTMLElement>(null);
  const joystickThumb = useRef<HTMLSpanElement>(null);
  const joystickPointer = useRef<number|null>(null);
  const screenLocked = useRef(false);
  const screenWasFullscreen = useRef(false);
  const screenChoice = useRef<DisplayMode>('auto');
  const screenChanging = useRef(false);
  const [hud,setHUD] = useState<HUD>(initialHUD);
  const [ready,setReady] = useState(false);
  const [startupPhase,setStartupPhase] = useState<StartupPhase>('client');
  const [startupSkipped,setStartupSkipped] = useState(false);
  const [error,setError] = useState('');
  const [fatal,setFatal] = useState(false);
  const [modal,setModal] = useState<Modal>(null);
  const [busy,setBusy] = useState(false);
  const [room,setRoom] = useState('');
  const [onlineTab,setOnlineTab] = useState<'create'|'join'>('create');
  const [gameMode,setGameMode] = useState<GameMode>('classic');
  const [botTeam,setBotTeam] = useState<'blue'|'orange'|'spectator'>('blue');
  const [botDifficulty,setBotDifficulty] = useState<BotDifficulty>(DEFAULT_BOT_DIFFICULTY);
  const [copied,setCopied] = useState(false);
  const [name,setName] = useState('Operator');
  const [settings,setSettings] = useState(defaultSettings);
  const [touch,setTouch] = useState(false);
  const [displayMode,setDisplayMode] = useState<DisplayMode>('auto');
  const [displayBusy,setDisplayBusy] = useState(false);
  const [displayMessage,setDisplayMessage] = useState('Choose a view. Where supported, Landscape and Portrait open full screen and rotate your display.');
  const [displayStatus,setDisplayStatus] = useState<{orientation:'portrait'|'landscape';fullscreen:boolean}>({orientation:'portrait',fullscreen:false});
  const [locationId,setLocationId] = useState(DEFAULT_LOCATION_ID);
  const [placeSearch,setPlaceSearch] = useState('');
  const [placeCategory,setPlaceCategory] = useState('all');
  const [placeSector,setPlaceSector] = useState('all');
  const [selectedPlaceId,setSelectedPlaceId] = useState('landmark-bhagya-kaman');
  const [placeLimit,setPlaceLimit] = useState(50);
  const filteredPlaces = useMemo(()=>{
    const words=placeSearch.toLocaleLowerCase().normalize('NFKC').trim().split(/\s+/).filter(Boolean);
    return PLACES.filter(place=>(placeCategory==='all'||place.category===placeCategory)&&(placeSector==='all'||place.sectorId===placeSector)&&words.every(word=>placeSearchText(place).includes(word)));
  },[placeSearch,placeCategory,placeSector]);
  const selectedPlace=filteredPlaces.find(place=>place.id===selectedPlaceId)??filteredPlaces[0];
  const shownPlaces=filteredPlaces.slice(0,placeLimit);
  const categoryCounts=useMemo(()=>new Map(PLACE_CATEGORIES.map(category=>[category.id,PLACES.filter(place=>place.category===category.id).length])),[]);
  const selectedLocation = LOCATIONS.find(location=>location.id===locationId) ?? LOCATIONS[0];
  const pauseOpen=hud.mode!=='lobby'&&hud.paused&&!modal&&!hud.buyOpen;

  useEffect(()=>{
    let disposed=false;
    const initialize=async()=>{
      let nextSettings={...defaultSettings};
      let savedName='Operator';
      let savedDifficulty=DEFAULT_BOT_DIFFICULTY;
      try {
        const saved=JSON.parse(localStorage.getItem('nanded-settings-v2')||'null');
        if(saved)nextSettings={sensitivity:Math.max(.3,Math.min(2.5,Number(saved.sensitivity)||1)),volume:Math.max(0,Math.min(1,Number(saved.volume)||0)),quality:saved.quality==='low'?'low':'high'};
        savedName=(localStorage.getItem('nanded-name')||'Operator').slice(0,18);
      }catch{}
      try{savedDifficulty=normalizeBotDifficulty(localStorage.getItem(BOT_DIFFICULTY_STORAGE_KEY));}catch{}
      setSettings(nextSettings);setName(savedName);setBotDifficulty(savedDifficulty);setTouch(matchMedia('(pointer:coarse)').matches);
      const {GameClient}=await import('../lib/client');
      if(disposed)return;
      setStartupPhase('assets');
      await Promise.all([GameClient.preload(),document.fonts.load('700 92px "Noto Sans Devanagari"').catch(()=>{})]);
      if(disposed||!canvas.current)return;
      setStartupPhase('scene');
      // Yield before synchronous scene construction so its real loading phase can paint.
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
      if(disposed||!canvas.current)return;
      const params=new URLSearchParams(window.location.search);
      const startLocation=params.get('location');
      if(LOCATIONS.some(location=>location.id===startLocation))setLocationId(startLocation!);
      const startPlace=getPlace(params.get('place')??undefined);
      if(startPlace){setSelectedPlaceId(startPlace.id);setPlaceSearch(startPlace.name);setModal('places');}
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
  useEffect(()=>{if(ready)try{localStorage.setItem(BOT_DIFFICULTY_STORAGE_KEY,botDifficulty);}catch{}},[botDifficulty,ready]);
  useEffect(()=>{
    const syncDisplay=()=>{
      const fullscreen=!!document.fullscreenElement;
      setDisplayStatus({orientation:viewportOrientation(window.innerWidth,window.innerHeight),fullscreen});
      // Rotation/fullscreen can cancel active touches without pointerup. Clear both
      // movement and fire, while keeping the same client, player and room alive.
      joystickPointer.current=null;
      if(joystickThumb.current)joystickThumb.current.style.transform='translate(0px,0px)';
      const game=engine.current;
      game?.resetControls();
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
    if(ready&&modal==='places'&&placesMap.current)engine.current?.drawPlaceMap(placesMap.current,selectedPlace?.id);
  },[ready,modal,selectedPlace?.id]);
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
  useEffect(()=>{
    if(!hud.buyOpen)return;
    const previous=document.activeElement as HTMLElement|null;
    const panel=buyPanel.current;
    const focusable=()=>Array.from(panel?.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"]')??[]);
    focusable()[0]?.focus();
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'||event.code==='KeyB'){event.preventDefault();event.stopPropagation();engine.current?.toggleBuy(false);return;}
      if(event.key!=='Tab')return;
      const elements=focusable(),first=elements[0],last=elements.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    };
    panel?.addEventListener('keydown',onKey);
    return()=>{panel?.removeEventListener('keydown',onKey);previous?.focus();};
  },[hud.buyOpen]);
  useEffect(()=>{
    const panel=pausePanel.current;
    if(!pauseOpen||!panel)return;
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const focusable=()=>Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],[tabindex="0"]')).filter(element=>element.getClientRects().length>0);
    (focusable()[0]??panel).focus({preventScroll:true});
    const onKey=(event:KeyboardEvent)=>{
      if(event.key!=='Tab')return;
      event.stopPropagation();
      const elements=focusable(),first=elements[0],last=elements.at(-1);
      if(!first){event.preventDefault();panel.focus();}
      else if(event.shiftKey&&(document.activeElement===first||document.activeElement===panel)){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===panel)){event.preventDefault();first.focus();}
    };
    panel.addEventListener('keydown',onKey);
    return()=>{
      panel.removeEventListener('keydown',onKey);
      if(previous?.isConnected&&previous.getClientRects().length>0&&!previous.closest('[inert]'))previous.focus({preventScroll:true});
    };
  },[pauseOpen]);

  const resetJoystick=()=>{
    joystickPointer.current=null;
    if(engine.current){engine.current.touchMove={forward:0,strafe:0};engine.current.touchSprint=false;}
    if(joystickThumb.current)joystickThumb.current.style.transform='translate(0px,0px)';
  };
  const resetTouchControls=()=>{
    resetJoystick();
    const game=engine.current;
    game?.resetControls();
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
  const chooseBotDifficulty=(value:BotDifficulty)=>{const difficulty=normalizeBotDifficulty(value);setBotDifficulty(difficulty);if(hud.botMatch)engine.current?.setBotDifficulty(difficulty);};
  const startBots=()=>{resetTouchControls();setError('');setModal(null);engine.current?.startBots(name.trim()||'Operator',locationId,gameMode,botTeam,botDifficulty);};
  const startSolo=()=>{resetJoystick();setError('');setModal(null);engine.current?.startSolo(name.trim()||'Operator',locationId,true);};
  const visitPlace=()=>{
    if(!selectedPlace||hud.mode==='online'||!ready)return;
    resetTouchControls();setError('');setModal(null);
    engine.current?.visitPlace(selectedPlace.id,name.trim()||'Operator');
  };
  const online=async(action:'create'|'join'|'quickjoin')=>{
    if(!engine.current||busy)return;setBusy(true);setError('');
    try{await engine.current.startOnline(action,name.trim()||'Operator',action==='join'?room:undefined,locationId,gameMode);setModal(null);}
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
  const botCount=hud.players.filter(operator=>operator.bot).length;
  const currentDifficulty=BOT_DIFFICULTY_OPTIONS.find(option=>option.id===hud.botDifficulty)??BOT_DIFFICULTY_OPTIONS[0];
  const isOnline=hud.mode==='online';
  const classic=hud.gameMode==='classic'&&!hud.exploration?hud.classic:null;
  const bomb=classic?.bomb;
  const loadout=(['rifle','smg','shotgun','sniper','pistol','knife'] as Weapon[]).filter(weapon=>!classic||player?.inventory.includes(weapon));
  const activeSite=player&&classic?.sites.find(site=>Math.hypot(site.x-player.x,site.z-player.z)<=site.radius);
  const canPlant=!!(player&&player.health>0&&classic?.phase==='live'&&player.team==='orange'&&bomb?.carrierId===player.id&&activeSite);
  const canDefuse=!!(player&&player.health>0&&classic?.phase==='live'&&player.team==='blue'&&bomb?.status==='planted'&&Math.hypot(bomb.x-player.x,bomb.z-player.z)<=3);
  const canPickup=!!(player&&player.health>0&&classic?.phase==='live'&&player.team==='orange'&&bomb?.status==='dropped'&&Math.hypot(bomb.x-player.x,bomb.z-player.z)<=1.8);
  const bombAction=bomb?.action?.playerId===player?.id?bomb?.action:undefined;
  const actionProgress=bombAction?Math.max(0,Math.min(1,(hud.now-bombAction.startedAt)/(bombAction.completesAt-bombAction.startedAt))):0;
  const objective=classic?.phase==='waiting'?'Waiting for both teams':classic?.phase==='freeze'?'BUY TIME · Prepare for the round':classic?.phase==='over'?(classic.reason||'Round complete'):bomb?.status==='planted'?`BOMB PLANTED · ${Math.max(0,Math.ceil((bomb.explodeAt-hud.now)/1000))}s`:hud.watching?'CT defend · T attack sites A and B':player?.team==='orange'?(bomb?.carrierId===player.id?'YOU HAVE THE BOMB · Reach A or B':'ATTACK · Escort the bomb carrier'):'DEFEND · Protect sites A and B';
  const startupVisible=!ready&&!fatal&&!startupSkipped;
  const briefingPhase=classic?.phase??'entry';
  const briefingTitle=hud.exploration?'EXPLORE NANDED':classic?.phase==='over'?(classic.roundWinner==='blue'?'CT WIN THE ROUND':classic.roundWinner==='orange'?'T WIN THE ROUND':'ROUND COMPLETE'):classic?.phase==='freeze'?'GEAR UP':classic?.phase==='live'?'ROUND LIVE':classic?.phase==='waiting'?'ASSEMBLE YOUR TEAM':hud.watching?'WATCH THE MATCH':'DEATHMATCH';
  const briefingDetail=hud.exploration?'Your city. Your pace.':classic?.phase==='over'?(classic.reason||'Prepare for the next round'):classic?.phase==='waiting'?'The round starts when both teams are here':hud.watching?'Counter-Terrorists vs Terrorists':classic?(player?.team==='blue'?'CT · Defend sites A and B':'T · Take the bomb to A or B'):'Keep moving. Find cover. Stay with your team.';
  const purchaseEntries=Object.entries(PURCHASES) as [PurchaseId,(typeof PURCHASES)[PurchaseId]][];
  const stopInteraction=()=>engine.current?.setInteracting(false);
  const buyItem=(id:PurchaseId)=>{engine.current?.buy(id);};

  return <main className={`app ${hud.mode==='lobby'?'is-lobby':'is-playing'} ${touch?'is-touch':''} ${hud.hurt?'hurt':''} ${classic?'is-classic':''} ${hud.scoped?'is-scoped':''}`}>
    <canvas ref={canvas} className="world-canvas" data-testid="game-canvas" aria-label="Interactive 3D map of Bhagya Nagar and nearby Nanded streets"/>
    {!hud.watching&&hud.scoped&&!hud.paused&&!hud.buyOpen&&<div className="scope-overlay" data-testid="scope-overlay" aria-label={`${hud.aim===2?'4':'2'} times scope`}><div className="scope-glass"><i/><i/><b/><span>{hud.aim===2?'4':'2'}×</span></div></div>}
    {!hud.watching&&!!player&&player.flashedUntil>hud.now&&<div className="flash-overlay" aria-hidden="true" style={{opacity:Math.min(1,(player.flashedUntil-hud.now)/1000)}}/>}
    {startupVisible&&<StartupLoading phase={startupPhase} onSkip={()=>setStartupSkipped(true)}/>}
    {hud.mode==='lobby'&&<div className={`lobby ${ready?'lobby-ready':''}`} data-testid="lobby" inert={startupVisible}>
      <div className="lobby-shade"/>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Counter Strike Nanded home"><Crosshair size={30}/><span className="brand-wordmark">COUNTER STRIKE <b>NANDED</b></span></Link>
        <span className="prototype-label">NANDED · BROWSER FPS</span>
        <nav aria-label="Game menu">
          <button className="nav-button places-nav" aria-label="Browse places on the map" data-testid="open-places-lobby" onClick={()=>open('places')}><MapPin size={18}/><span>PLACES</span></button>
          <button className="nav-button" onClick={()=>open('guide')}><Gamepad2 size={18}/><span>CONTROLS & MAP</span></button>
          <button className="icon-button" onClick={()=>open('settings')} aria-label="Settings" data-testid="open-settings"><Settings2 size={21}/></button>
        </nav>
      </header>
      <div className="lobby-content">
        <section className="hero">
          <div className="eyebrow"><MapPin size={16}/> NANDED, MAHARASHTRA <span lang="mr">नांदेड</span></div>
          <h1>COUNTER STRIKE<br/><span>NANDED</span></h1>
          <p className="hero-description">Choose your game. Jump into a bot match,<br/>play with friends, or explore Nanded.</p>
          <div className="start-panel">
            <div className="play-choice-label">CHOOSE YOUR RULES</div>
            <ModeChoice value={gameMode} onChange={setGameMode}/>
            <div className="bot-start-card">
              <div className="bot-card-heading"><Bot size={18}/><b>READY WHEN YOU ARE</b><span>No waiting for players</span></div>
              <div className="bot-team-choice" role="group" aria-label="Your team in the bot match">
                <button data-testid="bot-team-blue" aria-pressed={botTeam==='blue'} onClick={()=>setBotTeam('blue')}><b>CT</b><span>Counter-Terrorists</span></button>
                <button data-testid="bot-team-orange" aria-pressed={botTeam==='orange'} onClick={()=>setBotTeam('orange')}><b>T</b><span>Terrorists</span></button>
                <button data-testid="bot-team-spectator" aria-pressed={botTeam==='spectator'} onClick={()=>setBotTeam('spectator')}><b><Eye size={14}/> WATCH</b><span>Bots play both sides</span></button>
              </div>
              <DifficultyChoice value={botDifficulty} onChange={chooseBotDifficulty} disabled={!ready}/>
              <button className="primary-button play-bots-button" data-testid="play-bots" disabled={!ready||busy} onClick={startBots}><Bot size={24}/><span>{botTeam==='spectator'?'WATCH BOTS':'PLAY WITH BOTS'}<small>{botTeam==='spectator'?'Watch CT and T teams fight':`You + AI teammates vs AI opponents · ${botTeam==='blue'?'CT':'T'}`}</small></span><ArrowRight size={23}/></button>
            </div>
            <div className="hero-buttons alternative-play">
              <button className="secondary-button" data-testid="play-online" disabled={!ready||busy} onClick={()=>void online('quickjoin')}><Users size={21}/><span>{busy?'CONNECTING…':'PLAY ONLINE'}<small>Real people · {gameMode==='classic'?'Bomb defusal':'Deathmatch'}</small></span><ArrowRight size={19}/></button>
              <button className="secondary-button" data-testid="explore-map" disabled={!ready||busy} onClick={startSolo}><Footprints size={21}/><span>EXPLORE NANDED<small>Solo · Peaceful city walk</small></span><ArrowRight size={19}/></button>
            </div>
            <div className="room-actions"><button disabled={!ready||busy} onClick={()=>roomDialog('create')}>CREATE PRIVATE ROOM <ArrowUpRight size={14}/></button><button disabled={!ready||busy} onClick={()=>roomDialog('join')}>JOIN A ROOM <ArrowRight size={14}/></button></div>
            <div className="lobby-preferences">
              <div className="lobby-name"><label className="input-label" htmlFor="lobby-name">YOUR CALLSIGN</label><input id="lobby-name" maxLength={18} value={name} onChange={event=>setName(event.target.value)} placeholder="Operator" autoComplete="nickname"/></div>
              <div><label className="input-label location-label" htmlFor="start-location">MAP START</label><div className="select-wrap"><MapPin size={17}/><select id="start-location" data-testid="start-location" value={locationId} onChange={event=>setLocationId(event.target.value)}>{LOCATIONS.map(location=><option key={location.id} value={location.id}>{location.name}</option>)}</select><ChevronDown size={16}/></div></div>
            </div>
            <div className="lobby-utilities"><button className="screen-button lobby-screen-button" data-testid="open-screen-lobby" onClick={()=>open('screen')}><Smartphone size={18}/><span>SCREEN & ROTATION</span></button><button className="browse-local-link" onClick={()=>open('places')}><MapPin size={18}/>{PLACES.length} LOCAL PLACES<ArrowRight size={16}/></button></div>
            <p className="ready-note" role="status"><i className={ready?'ready':''}/>{ready?'Ready · No download or account needed':STARTUP_PHASES.find(phase=>phase.id===startupPhase)?.label}</p>
          </div>
        </section>
        <aside className="map-card">
          <div className="map-card-heading"><span className="eyebrow">ON THE MAP</span><span>N ↑</span></div>
          <canvas ref={previewMap} width={500} height={340} aria-label="Mapped Nanded street layout"/>
          <div className="map-card-copy"><h2>{selectedLocation.name}</h2><p>{selectedLocation.description||'Start on a mapped public road and explore the neighbourhood.'}</p></div>
          <div className="map-facts"><span><b>{LOCATIONS.length}</b> STARTING AREAS</span><span>REAL STREET LAYOUT</span></div>
        </aside>
      </div>
      <footer className="lobby-footer"><span>Bot matches, human multiplayer, and peaceful exploration.</span><div className="footer-links"><a href="/map-reference.json" target="_blank" rel="noreferrer">MAP SOURCES & ATTRIBUTION <ArrowUpRight size={14}/></a><a href="https://github.com/piyushbodaa/nanded-strike" target="_blank" rel="noreferrer">SOURCE & CONTRIBUTE <ArrowUpRight size={14}/></a></div></footer>
    </div>}

    {hud.mode!=='lobby'&&<div className="game-hud">
      <MatchBriefing key={`${hud.mode}-${hud.room}-${hud.round}-${briefingPhase}`} phase={briefingPhase} eyebrow={hud.exploration?'NANDED FIELD GUIDE':classic?`ROUND ${String(hud.round).padStart(2,'0')} · ${hud.location}`:hud.location} title={briefingTitle} detail={briefingDetail} muted={hud.paused||hud.buyOpen||!!hud.winner||!!modal}/>
      <div className="radar-wrap"><div className="radar-header"><MapPin size={13}/><span>{hud.location}</span><b>N ↑</b></div><canvas ref={minimap} width={360} height={360} aria-label="Minimap with your position and teammates"/></div>
      {hud.exploration?<div className="exploration-status"><Footprints size={19}/><div><b>MAP EXPLORATION</b><span>No enemies · Take your time</span></div></div>:<div className="match-status"><div className="score blue"><small>CT</small>{hud.scores.blue}</div><div className="match-clock"><span>{classic?`ROUND ${hud.round} · FIRST TO ${CLASSIC_TARGET_SCORE}`:"FIRST TO 25"}</span><b>{formatTime(hud.remaining)}</b><small>{hud.watching?'SPECTATOR':classic?(player?.team==='blue'?'CT · DEFENDERS':'T · ATTACKERS'):hud.botMatch?`${botCount} BOTS`:`${humanCount} ${humanCount===1?'PLAYER':'PLAYERS'}`}</small></div><div className="score orange"><small>T</small>{hud.scores.orange}</div></div>}
      <div className="session-tools"><span>{hud.exploration?'EXPLORE':hud.botMatch?'BOT MATCH':['NANDED','CLASSC'].includes(hud.room)?'PUBLIC MATCH':'PRIVATE MATCH'}</span>{isOnline&&<button className="invite-button" data-testid="room-code" onClick={()=>void copyInvite()} aria-label={`Copy invite for room ${hud.room}`}><span>{hud.room}</span>{copied?<Check size={17}/>:<Copy size={17}/>}</button>}<button className="places-button" data-testid="open-places-game" aria-label="Browse places on the map" onClick={()=>open('places')}><MapPin size={17}/><span>PLACES</span></button><button className="screen-button" data-testid="open-screen-game" aria-label="Screen orientation and full screen" onClick={()=>open('screen')}><Smartphone size={17}/><span>SCREEN</span></button><button onClick={pause} aria-label="Pause game"><Pause size={20}/></button></div>
      {isOnline&&<div className={`online-status ${!hud.connected?'is-reconnecting':''}`} data-testid="online-status"><i/>{!hud.connected?'RECONNECTING…':humanCount===1?'WAITING FOR OTHER PLAYERS':`${humanCount} REAL PLAYERS · ${hud.ping} MS`}</div>}
      {hud.botMatch&&<div className="online-status bot-match-status" data-testid="bot-match-status"><Bot size={13}/><span className="bot-status-copy"><span>{hud.watching?`WATCH BOTS · ${botCount} AI PLAYERS`:`${humanCount} HUMAN · ${botCount} BOTS · ${player?.team==='blue'?'CT':'T'}`}</span><small data-testid="bot-difficulty-status">{currentDifficulty.label.toUpperCase()}</small></span></div>}
      {classic&&<div className={`classic-status ${bomb?.status==='planted'?'bomb-active':''}`} data-testid="classic-status"><Bomb size={15}/><div className="objective-copy"><span>{objective}</span>{player&&<div className="site-directions" aria-label="Bomb site directions">{classic.sites.map(site=>{const distance=Math.round(Math.hypot(site.x-player.x,site.z-player.z));const bearing=Math.atan2(-(site.x-player.x),-(site.z-player.z))-player.yaw;return <span key={site.id} aria-label={`Bomb site ${site.id}, ${distance} meters`}><b>{site.id}</b><ArrowRight size={12} style={{transform:`rotate(${-90-bearing*180/Math.PI}deg)`}}/><span>{distance} m</span></span>;})}</div>}</div></div>}
      {!hud.exploration&&<div className="kill-feed">{hud.feed.map(feed=><div key={feed.id}>{feed.text}</div>)}</div>}
      {!hud.watching&&!hud.paused&&!hud.buyOpen&&!hud.scoped&&player&&player.health>0&&!hud.winner&&<div className={`crosshair ${hud.hit?'hit-confirmed':''}`}><i/><i/><i/><i/><b/></div>}
      {hud.hit&&<div className="hit-marker">×</div>}
      <div className={`player-status ${hud.watching?'spectator-hidden':''}`}><Shield size={21}/><b>{player?.health??100}</b><span>HEALTH</span>{!hud.exploration&&<span className="kd">{player?.kills??0}<small>K</small><i>/</i>{player?.deaths??0}<small>D</small></span>}</div>
      {classic&&!hud.watching&&<div className="economy-status"><span data-testid="player-money">${player?.money??0}</span><small><Shield size={13}/>{player?.armor??0}{player?.defuseKit?' · KIT':''}</small><button data-testid="open-buy" onClick={()=>engine.current?.toggleBuy(true)}><ShoppingBag size={17}/><b>BUY</b><kbd>B</kbd></button></div>}
      <div className={`weapon-status ${player?.weapon==='knife'?'is-melee':''} ${hud.watching?'spectator-hidden':''}`} data-testid="weapon-status"><span className="weapon-type">{WEAPONS[player?.weapon??'rifle'].name} · {WEAPON_LABELS[player?.weapon??'rifle'].toUpperCase()}</span>{player?.weapon==='knife'?<div className="melee-readout"><WeaponIcon weapon="knife"/><span>CLOSE RANGE</span></div>:<div><b>{player?.ammo??30}</b><span>/ {player?.reserve??120}</span></div>}{player&&player.weapon!=='knife'&&player.reloadUntil>hud.now&&<progress className="reload-progress" max={1} value={Math.max(0,Math.min(1,1-(player.reloadUntil-hud.now)/WEAPONS[player.weapon].reload))} aria-label="Weapon reload progress"/>}<small>{player?.weapon==='knife'?(touch?'SLASH · AIM FOR STAB':'LEFT SLASH · RIGHT STAB'):player&&player.reloadUntil>hud.now?'RELOADING…':player?.ammo===0?'RELOAD YOUR WEAPON':hud.aim>0?`${hud.scoped?(hud.aim===2?'4× SCOPE':'2× SCOPE'):'AIMING'}${hud.crouched?' · CROUCHED':''}`:touch?'TAP AIM FOR SIGHTS':'RIGHT CLICK TO AIM'}</small></div>
      <div className={`weapon-loadout ${loadout.length>3?'expanded-loadout':''} ${hud.watching?'spectator-hidden':''}`} role="group" aria-label="Weapon loadout">{loadout.map(weapon=><button key={weapon} type="button" data-testid={`weapon-${weapon}`} aria-label={`Equip ${WEAPON_LABELS[weapon].toLowerCase()}`} aria-pressed={(player?.weapon??'rifle')===weapon} disabled={!player||player.health<=0||!!hud.winner} onClick={()=>engine.current?.selectWeapon(weapon)}><kbd>{weapon==='pistol'?'2':weapon==='knife'?'3':'1'}</kbd><WeaponIcon weapon={weapon}/><span>{WEAPON_LABELS[weapon]}</span></button>)}</div>
      {classic&&!hud.watching&&player&&<div className="utility-bar" aria-label="Grenades"><div role="group" aria-label="Choose grenade">{UTILITIES.map(item=><button key={item.id} data-testid={`grenade-${item.id}`} aria-label={`Select ${item.label}, ${player.grenades[item.id]} available`} aria-pressed={hud.selectedGrenade===item.id} disabled={!player.grenades[item.id]||player.health<=0} onClick={()=>engine.current?.selectGrenade(item.id)}><span>{item.short}</span><b>{player.grenades[item.id]}</b></button>)}</div><button className="throw-grenade" data-testid="throw-grenade" disabled={!player.grenades[hud.selectedGrenade]||player.health<=0||classic.phase!=='live'} onClick={()=>engine.current?.throwGrenade()}>THROW <kbd>G</kbd></button></div>}
      {!hud.watching&&(canPlant||canDefuse||canPickup||bombAction)&&!hud.paused&&!hud.buyOpen&&<div className="bomb-interaction"><button data-testid="bomb-interact" aria-label={canDefuse?'Hold to defuse bomb':canPickup?'Pick up bomb':'Hold to plant bomb'} onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);engine.current?.setInteracting(true);}} onPointerUp={stopInteraction} onPointerCancel={stopInteraction} onLostPointerCapture={stopInteraction}><Bomb size={20}/><span>HOLD {touch?'':'E '}{canDefuse||bombAction?.type==='defuse'?'TO DEFUSE':canPickup?'TO PICK UP BOMB':'TO PLANT'}</span></button>{bombAction&&<progress value={actionProgress} max="1" aria-label={bombAction.type==='defuse'?'Defusing progress':'Planting progress'}/>}</div>}
      {!touch&&!hud.watching&&<div className="game-hints"><span><kbd>WASD</kbd> MOVE</span><span><kbd>RMB</kbd> AIM</span><span><kbd>CTRL</kbd> CROUCH</span><span><kbd>R</kbd> RELOAD</span><span><kbd>ESC</kbd> MENU</span></div>}
      {touch&&!hud.watching&&!hud.paused&&!hud.buyOpen&&<div className="touch-controls">
        <div className="joystick-wrap"><button className="movement-joystick" data-testid="movement-joystick" aria-label="Movement joystick" onPointerDown={event=>{if(joystickPointer.current!==null)return;joystickPointer.current=event.pointerId;event.currentTarget.setPointerCapture(event.pointerId);moveJoystick(event);}} onPointerMove={moveJoystick} onPointerUp={event=>{if(joystickPointer.current===event.pointerId)resetJoystick();}} onPointerCancel={event=>{if(joystickPointer.current===event.pointerId)resetJoystick();}} onLostPointerCapture={event=>{if(joystickPointer.current===event.pointerId)resetJoystick();}}><span className="joystick-axis"/><span ref={joystickThumb} className="joystick-thumb"><ChevronDown size={19}/></span></button><span className="touch-caption">MOVE · EDGE TO SPRINT</span></div>
        <div className="touch-actions">
          <button className="touch-aim" data-testid="aim-button" aria-label={player?.weapon==='knife'?'Stab knife':'Aim weapon'} aria-pressed={hud.aim>0} onClick={()=>engine.current?.toggleAim()}><Crosshair size={20}/><small>{player?.weapon==='knife'?'STAB':'AIM'}</small></button>
          <button className="touch-crouch" data-testid="crouch-button" aria-label="Toggle crouch" aria-pressed={hud.crouched} onClick={()=>engine.current?.toggleCrouch()}><Footprints size={20}/><small>CROUCH</small></button>
          <button className="touch-reload" aria-label="Reload weapon" disabled={player?.weapon==='knife'} onClick={()=>engine.current?.reload()}><RotateCcw size={20}/><small>RELOAD</small></button>
          <button className="touch-jump" aria-label="Jump" onClick={()=>{if(engine.current)engine.current.jumping=true;}}><ChevronDown size={24}/><small>JUMP</small></button>
          <button aria-label={player?.weapon==='knife'?'Slash knife':'Fire weapon'} data-testid="fire-button" className="touch-fire" onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);if(engine.current){engine.current.shooting=true;engine.current.queuedShot=true;}}} onPointerUp={stopFire} onPointerCancel={stopFire} onLostPointerCapture={stopFire}>{player?.weapon==='knife'?<WeaponIcon weapon="knife"/>:<Crosshair size={29}/>}<span>{player?.weapon==='knife'?'SLASH':'FIRE'}</span></button>
        </div>
      </div>}
      {hud.watching&&!hud.paused&&<div className="spectator-controls" data-testid="bot-spectator-controls"><Eye size={19}/><div><small>WATCHING BOT</small><b>{hud.spectating||'Match starting…'}</b><span>{player?.team==='blue'?'CT · Counter-Terrorists':'T · Terrorists'}</span></div><button className="secondary-button" data-testid="next-bot" onClick={()=>engine.current?.cycleSpectator()}>NEXT BOT<ArrowRight size={18}/></button></div>}
      {!hud.watching&&player&&player.health<=0&&!hud.paused&&!hud.winner&&<div className="respawn-banner"><span>ELIMINATED</span><h2>{classic?hud.spectating?`WATCHING ${hud.spectating}`:'NEXT ROUND':`BACK IN ${Math.max(1,Math.ceil((player.respawnAt-hud.now)/1000))}`}</h2><p>{classic?hud.spectating?'Click to cycle teammates. You return next round.':'One life per round. Wait for the next round to return.':'Find cover. Try another angle.'}</p></div>}
      {!hud.exploration&&(hud.scoreboard||hud.winner)&&<div className={`scoreboard ${hud.winner?'match-victory':''}`} data-testid="scoreboard"><div className="scoreboard-title"><span>{hud.botMatch?'BOT MATCH':'ONLINE MATCH'} · CT vs T</span><h2>{hud.winner?(hud.winner==='draw'?'DRAW':hud.winner==='blue'?'COUNTER-TERRORISTS WIN':'TERRORISTS WIN'):'SCOREBOARD'}</h2>{hud.winner&&<p>Next round starts automatically.</p>}</div><div className="scoreboard-columns"><span>OPERATOR</span><span>K</span><span>D</span></div>{[...hud.players].sort((a,b)=>b.kills-a.kills).map(operator=><div className={`scoreboard-row ${operator.id===player?.id?'is-me':''}`} key={operator.id}><span><i style={{background:operator.team==='blue'?'var(--blue)':'var(--orange)'}}/>{operator.name}<small>{operator.id===player?.id&&!hud.watching?'YOU':operator.bot?'BOT':'PLAYER'} · {operator.team==='blue'?'CT':'T'}</small></span><b>{operator.kills}</b><span>{operator.deaths}</span></div>)}</div>}
      {pauseOpen&&<div className="overlay pause-overlay"><section ref={pausePanel} className="pause-panel" data-testid="pause-menu" role="dialog" aria-modal="true" aria-label="Game paused" tabIndex={-1}><div className="eyebrow"><Pause size={15}/>{isOnline?'MATCH MENU':hud.botMatch?'BOT MATCH PAUSED':'GAME PAUSED'}</div><h2>{isOnline?'READY TO PLAY?':'TAKE A BREATHER.'}</h2><p>{isOnline?`${humanCount} real ${humanCount===1?'player':'players'} in room ${hud.room}. The match keeps running while this menu is open.`:hud.botMatch?'The bot match is paused. Resume when you are ready.':'Your map exploration is paused.'}</p>{hud.botMatch&&<DifficultyChoice value={hud.botDifficulty} onChange={chooseBotDifficulty} prefix="pause-"/>}{isOnline&&<button className="secondary-button wide pause-invite" onClick={()=>void copyInvite()}><Copy size={18}/>{copied?'INVITE COPIED':'COPY INVITE LINK'}<b>{hud.room}</b></button>}<button className="primary-button wide" data-testid="resume-game" onClick={()=>engine.current?.resume()}><Play size={19}/>{isOnline?'ENTER MATCH':'RESUME'}<ArrowRight size={20}/></button><button className="secondary-button wide pause-places" data-testid="open-places-pause" onClick={()=>open('places')}><MapPin size={18}/>BROWSE LOCAL PLACES<ArrowRight size={18}/></button><div className="pause-options"><button className="secondary-button" onClick={()=>open('settings')}><Settings2 size={18}/>SETTINGS</button><button className="secondary-button" data-testid="leave-game" onClick={leave}>{isOnline||hud.botMatch?'LEAVE MATCH':'BACK TO MENU'}<ArrowRight size={17}/></button></div><p className="pause-tip">{hud.watching?'Watch the CT and T teams play. Switch players to follow another view.':touch?'Left thumb moves. Drag to aim. Tap a loadout slot; hold FIRE or SLASH to attack.':'WASD move · Right click aim · Ctrl crouch · B buy · E plant / defuse'}</p></section></div>}
    </div>}

    {hud.buyOpen&&player&&<div className="overlay buy-overlay"><section ref={buyPanel} className="modal-panel buy-panel" role="dialog" aria-modal="true" aria-labelledby="buy-title" data-testid="buy-panel"><button className="modal-close icon-button" data-testid="close-buy" aria-label="Close buy menu" onClick={()=>engine.current?.toggleBuy(false)}><X size={23}/></button><div className="eyebrow"><ShoppingBag size={17}/> EQUIPMENT</div><h2 id="buy-title">GEAR UP.</h2><div className="buy-summary"><b>${player.money}</b><span>{hud.canBuy?`${Math.max(0,Math.ceil(((classic?.phaseEndsAt??hud.now)-hud.now)/1000))}s BUY TIME`:'BUYING CLOSED'}</span><small>{player.team==='blue'?'CT · DEFENDERS':'T · ATTACKERS'}</small></div><p className="buy-note">{hud.canBuy?'Buy one primary weapon, armor and utility. Your round keeps running.':'Buy while alive, near your team’s spawn, during the opening buy time.'}</p>{(['weapon','armor','grenade'] as const).map(kind=><div className="buy-category" key={kind}><h3>{kind==='weapon'?'WEAPONS':kind==='armor'?'PROTECTION & TOOLS':'GRENADES'}</h3><div className="buy-grid">{purchaseEntries.filter(([,item])=>item.kind===kind||(kind==='armor'&&item.kind==='kit')).map(([id,item])=>{
      const owned=item.kind==='weapon'?player.inventory.includes(id as Weapon):id==='armor'?player.armor>=100:id==='kit'?player.defuseKit:false;
      const grenadeLimit=item.kind==='grenade'&&(player.grenades[id as GrenadeKind]>=(id==='flash'?2:1)||Object.values(player.grenades).reduce((total,count)=>total+count,0)>=4);
      const teamLimit=id==='kit'&&player.team!=='blue';
      const unavailable=owned||grenadeLimit||teamLimit;
      const reason=owned?'OWNED':grenadeLimit?'FULL':teamLimit?'DEFENDERS ONLY':player.money<item.price?'NEED MORE FUNDS':`$${item.price.toLocaleString()}`;
      return <button key={id} data-testid={`buy-${id}`} disabled={!hud.canBuy||unavailable||player.money<item.price} onClick={()=>buyItem(id)}>{item.kind==='weapon'?<WeaponIcon weapon={id as Weapon}/>:item.kind==='grenade'?<Bomb size={30}/>:<Shield size={30}/>}<span><b>{item.name}</b><small>{reason}</small></span></button>;
    })}</div></div>)}<button className="primary-button wide buy-done" onClick={()=>engine.current?.toggleBuy(false)}><Check size={18}/>BACK TO ROUND<ArrowRight size={18}/></button></section></div>}

    {modal&&<div className="overlay modal-overlay" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy&&!displayBusy)close();}}><section ref={modalPanel} className={`modal-panel ${modal==='guide'?'guide-panel':modal==='screen'?'screen-panel':modal==='places'?'places-panel':''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" data-testid={modal==='settings'?'settings-panel':modal==='screen'?'screen-panel':modal==='places'?'places-panel':undefined}>
      <button className="modal-close icon-button" onClick={close} disabled={busy||displayBusy} aria-label="Close dialog" data-testid={modal==='settings'?'close-settings':undefined}><X size={23}/></button>
      {modal==='places'?<>
        <div className="eyebrow"><MapPin size={16}/> EXPLORE NANDED</div>
        <h2 id="modal-title">PLACES ON THE MAP.</h2>
        <p className="modal-intro">Find food, shops, hotels, schools and local landmarks. Pick a place to see its surroundings, then visit in solo exploration.</p>
        <div className="places-filters">
          <label className="places-search"><Search size={19}/><input data-testid="places-search" aria-label="Search places" type="search" placeholder="Search a place, shop or street…" value={placeSearch} onChange={event=>{setPlaceSearch(event.target.value);setPlaceLimit(50);}}/></label>
          <label className="places-area"><span>NEAR</span><select aria-label="Filter places by area" data-testid="places-sector" value={placeSector} onChange={event=>{setPlaceSector(event.target.value);setPlaceLimit(50);}}><option value="all">All areas</option>{PLACE_SECTORS.map(sector=><option key={sector.id} value={sector.id}>{sector.name}</option>)}</select><ChevronDown size={17}/></label>
        </div>
        <div className="places-categories" role="group" aria-label="Filter places by category">
          <button aria-pressed={placeCategory==='all'} onClick={()=>{setPlaceCategory('all');setPlaceLimit(50);}}>All places <span>{PLACES.length}</span></button>
          {PLACE_CATEGORIES.filter(category=>(categoryCounts.get(category.id)??0)>0).map(category=><button key={category.id} data-testid={`places-category-${category.id}`} aria-pressed={placeCategory===category.id} onClick={()=>{setPlaceCategory(category.id);setPlaceLimit(50);}}><i style={{background:category.color}}/>{category.label}<span>{categoryCounts.get(category.id)}</span></button>)}
        </div>
        <div className="places-count" role="status" data-testid="places-count"><b>{filteredPlaces.length.toLocaleString()} {filteredPlaces.length===1?'place':'places'}</b><span>{placeSector==='all'?'Across the mapped area':`Near ${PLACE_SECTORS.find(sector=>sector.id===placeSector)?.name}`}</span>{(placeSearch||placeCategory!=='all'||placeSector!=='all')&&<button onClick={()=>{setPlaceSearch('');setPlaceCategory('all');setPlaceSector('all');setPlaceLimit(50);}}>Clear filters <X size={13}/></button>}</div>
        {selectedPlace?<div className="places-browser">
          <div className="places-results" aria-label="Places matching your filters">
            <ul>{shownPlaces.map(place=><li key={place.id}><button className="place-result" aria-pressed={selectedPlace.id===place.id} data-testid={`place-result-${place.id}`} onClick={()=>setSelectedPlaceId(place.id)}><i style={{background:PLACE_CATEGORIES.find(category=>category.id===place.category)?.color}}/><span><b>{place.name}</b><small>{place.categoryLabel} · Near {place.sectorName}{place.locationQuality==='shared-coordinate'||place.locationQuality==='area-centroid'?' · Approximate area':place.confidence!==undefined&&place.confidence<.5?' · Location uncertain':''}</small></span><ChevronDown size={17}/></button></li>)}</ul>
            {filteredPlaces.length>placeLimit&&<button className="places-more secondary-button" onClick={()=>setPlaceLimit(limit=>limit+50)}>SHOW MORE <span>{Math.min(placeLimit,filteredPlaces.length)} / {filteredPlaces.length}</span></button>}
          </div>
          <section className="place-detail" aria-label={`Map and details for ${selectedPlace.name}`}>
            <div className="place-map-heading"><span>LOCAL MAP</span><b>N ↑</b></div>
            <canvas ref={placesMap} width={620} height={420} data-testid="places-map" aria-label={`Street map around ${selectedPlace.name}; its location is highlighted`}/>
            <div className="place-detail-copy">
              <span className="place-category"><i style={{background:PLACE_CATEGORIES.find(category=>category.id===selectedPlace.category)?.color}}/>{selectedPlace.categoryLabel}</span>
              <h3 data-testid="place-name">{selectedPlace.name}</h3>
              {(selectedPlace.locationQuality==='shared-coordinate'||selectedPlace.locationQuality==='area-centroid')?<p className="place-uncertain">Approximate area. This listing shares a source position with other places; an exact storefront is not established.</p>:selectedPlace.confidence!==undefined&&selectedPlace.confidence<.5&&<p className="place-uncertain">Location uncertain in the source. This marker may be misplaced.</p>}
              <p>Near {selectedPlace.sectorName}{hud.player&&<span> · {Math.round(Math.hypot(selectedPlace.x-hud.player.x,selectedPlace.z-hud.player.z))} m from you</span>}</p>
              {selectedPlace.address&&<p className="place-address">{selectedPlace.address}</p>}
              <button className="primary-button wide" data-testid="visit-place" disabled={!ready||busy||isOnline} onClick={visitPlace}><Footprints size={19}/>VISIT IN SOLO<ArrowRight size={18}/></button>
              {isOnline?<p className="place-visit-note">You are in a live match. Return to the menu to visit places in solo exploration.</p>:<p className="place-visit-note">Start on a walkable approach near this place. Exteriors are approximate; indoor access is not modelled.</p>}
              <a className="place-source" href={selectedPlace.sourceUrl} target="_blank" rel="noreferrer">{selectedPlace.sourceLabel} · {selectedPlace.verification==='photo-reference'?'Photo referenced':selectedPlace.confidence!==undefined&&selectedPlace.confidence<.5?'Uncertain listing':'Map listing'}<ArrowUpRight size={15}/></a>
            </div>
          </section>
        </div>:<div className="places-empty"><MapPin size={30}/><h3>No matching places</h3><p>Try a shorter name, another category or all areas.</p></div>}
        <p className="places-accuracy">Public map listings may be incomplete or outdated. Area labels mean the nearest starting area, not neighbourhood boundaries. Map positions come from sources; most building appearances are estimated. <a href="/place-reference.json" target="_blank" rel="noreferrer">Sources & coverage <ArrowUpRight size={13}/></a></p>
        {hud.mode!=='lobby'&&<button className="secondary-button places-back" onClick={()=>{close();engine.current?.resume();}}><Play size={17}/>BACK TO {isOnline||hud.botMatch?'MATCH':'EXPLORING'}</button>}
      </>:modal==='screen'?<><div className="eyebrow"><Smartphone size={16}/> SCREEN</div><h2 id="modal-title">YOUR VIEW.</h2><p className="modal-intro">Choose portrait or landscape without leaving your game.</p><div className="screen-current" data-testid="screen-current"><span>NOW SHOWING</span><b>{displayStatus.orientation==='landscape'?'Landscape':'Portrait'}</b><small>{displayStatus.fullscreen?'Full screen':'Browser window'}</small></div><div className="screen-modes" role="group" aria-label="Screen orientation">{([{mode:'landscape',label:'Landscape',hint:'Wider view'},{mode:'portrait',label:'Portrait',hint:'Upright view'},{mode:'auto',label:'Auto rotate',hint:'Follow your phone'}] as const).map(choice=><button key={choice.mode} className={displayMode===choice.mode?'selected':''} aria-pressed={displayMode===choice.mode} disabled={displayBusy} data-testid={`screen-${choice.mode}`} onClick={()=>void chooseDisplay(choice.mode)}>{choice.mode==='auto'?<RotateCcw size={25}/>:<Smartphone size={25} className={choice.mode==='landscape'?'landscape-icon':''}/>}<b>{choice.label}</b><small>{choice.hint}</small>{displayMode===choice.mode&&<Check size={15} className="screen-choice-check"/>}</button>)}</div><p className="screen-message" role="status" aria-live="polite" data-testid="screen-message">{displayBusy?'Changing your screen…':displayMessage}</p><button className="secondary-button wide" data-testid="screen-fullscreen" disabled={displayBusy} onClick={()=>void fullScreen()}><Maximize2 size={18}/>{displayStatus.fullscreen?'LEAVE FULL SCREEN':'ENTER FULL SCREEN'}</button><button className="primary-button wide screen-done" disabled={displayBusy} onClick={()=>{close();if(hud.mode!=='lobby')engine.current?.resume();}}><Check size={18}/>{hud.mode==='lobby'?'DONE':'BACK TO GAME'}</button></>:modal==='multiplayer'?<><div className="eyebrow"><Users size={16}/> PRIVATE ROOMS</div><h2 id="modal-title">PLAY TOGETHER.</h2><p className="modal-intro">Invite friends on phones or laptops. Up to eight real players. No bots fill empty places.</p><div className="segmented-tabs room-tabs"><button className={onlineTab==='create'?'selected':''} onClick={()=>setOnlineTab('create')} disabled={busy}>CREATE ROOM</button><button className={onlineTab==='join'?'selected':''} onClick={()=>setOnlineTab('join')} disabled={busy}>JOIN ROOM</button></div><div className="setting"><label htmlFor="room-player-name">Your callsign</label><input id="room-player-name" data-testid="room-player-name" maxLength={18} value={name} onChange={event=>setName(event.target.value)} placeholder="Operator"/></div>{onlineTab==='create'?<><ModeChoice value={gameMode} onChange={setGameMode} prefix="private-"/><label className="input-label" htmlFor="private-location">MATCH START</label><div className="select-wrap"><MapPin size={19}/><select id="private-location" value={locationId} onChange={event=>setLocationId(event.target.value)}>{LOCATIONS.map(location=><option key={location.id} value={location.id}>{location.name}</option>)}</select><ChevronDown size={18}/></div></>:<div className="setting"><label htmlFor="room-input">Six-character room code</label><input id="room-input" data-testid="room-code-input" value={room} onChange={event=>setRoom(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'' ).slice(0,6))} placeholder="ABC234" className="code-input" maxLength={6}/></div>}<button className="primary-button wide" data-testid={onlineTab==='create'?'create-room':'join-room'} disabled={!ready||busy||(onlineTab==='join'&&room.length!==6)} onClick={()=>void online(onlineTab)}><Users size={19}/>{busy?'CONNECTING…':onlineTab==='create'?'CREATE & ENTER':'JOIN MATCH'}<ArrowRight size={20}/></button><p className="modal-footnote">Share the invite link after creating your room.</p></>:modal==='settings'?<><div className="eyebrow"><Settings2 size={16}/> SETTINGS</div><h2 id="modal-title">MAKE IT YOURS.</h2><div className="setting"><label htmlFor="player-name">Callsign</label><input id="player-name" data-testid="player-name" maxLength={18} value={name} onChange={event=>setName(event.target.value)} placeholder="Operator" autoComplete="nickname"/></div><div className="setting"><label htmlFor="sensitivity">Aim sensitivity <b>{settings.sensitivity.toFixed(1)}×</b></label><input id="sensitivity" type="range" min="0.3" max="2.5" step="0.1" value={settings.sensitivity} onChange={event=>setSettings({...settings,sensitivity:Number(event.target.value)})}/><div className="range-labels"><span>PRECISE</span><span>FAST</span></div></div><div className="setting"><label htmlFor="volume"><span><Volume2 size={16}/> Sound volume</span><b>{Math.round(settings.volume*100)}%</b></label><input id="volume" type="range" min="0" max="1" step="0.05" value={settings.volume} onChange={event=>setSettings({...settings,volume:Number(event.target.value)})}/></div><div className="setting"><label>Graphics</label><div className="segmented-tabs" role="group" aria-label="Graphics quality"><button aria-pressed={settings.quality==='high'} className={settings.quality==='high'?'selected':''} onClick={()=>setSettings({...settings,quality:'high'})}>SHARP<small>Full detail & shadows</small></button><button aria-pressed={settings.quality==='low'} className={settings.quality==='low'?'selected':''} onClick={()=>setSettings({...settings,quality:'low'})}>PERFORMANCE<small>Lighter on your device</small></button></div></div><button className="secondary-button wide" onClick={()=>open('screen')}><Smartphone size={18}/>SCREEN & ORIENTATION</button><p className="modal-footnote"><Check size={15}/> Settings are saved on this device.</p></>:<><div className="eyebrow"><Gamepad2 size={16}/> CONTROLS & MAP</div><h2 id="modal-title">FIND YOUR FEET.</h2><p className="modal-intro">Play with Bots starts a local match immediately: join CT, join T, or watch both AI teams play. Play Online joins real people, with no AI filling empty spaces. Bomb defusal gives you one life per round. Terrorists (T, orange) plant at A or B; Counter-Terrorists (CT, blue) stop them or defuse. Buy weapons, armor and grenades near your spawn during buy time. Deathmatch has all weapons, automatic respawns and a first-to-25 score. Explore has no opponents or time limit. All online opponents are real people.</p><div className="controls-grid">{[['W A S D','Move'],['MOUSE','Look'],['LEFT CLICK','Fire / slash'],['RIGHT CLICK','Scope / aim / knife stab'],['R','Reload'],['1 / 2 / 3','Primary / handgun / knife'],['Q / WHEEL','Last weapon / cycle'],['CTRL','Crouch'],['SHIFT / ALT','Walk / sprint'],['SPACE','Jump'],['B','Buy equipment'],['E (HOLD)','Plant / defuse'],['G','Throw selected grenade'],['TAB','Scoreboard'],['ESC','Pause / menu']].map(([key,label])=><div key={key}><kbd>{key}</kbd><span>{label}</span></div>)}</div><p className="guide-note"><HelpCircle size={20}/>On a phone or tablet, use the left thumb joystick to move; push to its edge to sprint. Drag the open view to aim. Tap a weapon in your loadout. AIM cycles rifle/sniper scope levels, aims other guns, or stabs with the knife. CROUCH toggles your stance. Hold FIRE to shoot or SLASH to attack. Use BUY during buy time, choose a grenade then THROW, and hold the bomb prompt to plant or defuse.</p><div className="guide-map-note"><MapPin size={22}/><div><b>GROUNDED IN NANDED</b><p>Street positions and building footprints come from map datasets. Building heights, façades, street widths, and gameplay props are interpretations, not a photographic reconstruction.</p><a href="/map-reference.json" target="_blank" rel="noreferrer">Map sources & accuracy notes <ArrowUpRight size={14}/></a><p className="attribution">Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>. Building data: <a href="https://docs.overturemaps.org/attribution/" target="_blank" rel="noreferrer">Overture Maps</a> and <a href="https://sites.research.google/gr/open-buildings/" target="_blank" rel="noreferrer">Google Open Buildings</a>.</p></div></div></>}
      {error&&<div className="inline-error" role="alert">{error}</div>}
    </section></div>}
    {error&&!modal&&<div className={`toast ${fatal?'fatal-toast':''}`} role="alert"><span>{error}</span>{!fatal&&<button onClick={()=>setError('')} aria-label="Dismiss message"><X size={20}/></button>}</div>}
  </main>;
}
