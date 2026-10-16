import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';

const baseURL=process.env.TEST_URL||process.env.BASE_URL||'http://127.0.0.1:5173';
const artifacts=resolve(process.env.TEST_ARTIFACTS||'test-results/classic');
await mkdir(artifacts,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:process.env.HEADED!=='1',args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const actors=[],credentials=[],errors=[];
const debug=actor=>actor.page.evaluate(()=>window.__NANDED_DEBUG__);
const player=actor=>actor.state?.players.find(p=>p.id===actor.session?.playerId);
const shot=(actor,name)=>actor.page.screenshot({path:resolve(artifacts,`${name}.png`),fullPage:true});
async function click(actor,locator){await actor.page.bringToFront();if(actor.touch)await locator.tap();else await locator.click();}
async function waitState(actor,predicate,message,timeout=30_000){await expect.poll(()=>!!actor.state&&predicate(actor.state),{message,timeout,intervals:[100,200,500]}).toBe(true);}
async function waitDebug(actor,predicate,message){await expect.poll(async()=>{const value=await debug(actor);return !!value&&predicate(value);},{message,timeout:30_000,intervals:[100,200,500]}).toBe(true);}
async function makeActor(name,touch=false){
  const context=await browser.newContext({baseURL,viewport:touch?{width:844,height:390}:{width:1440,height:900},isMobile:touch,hasTouch:touch,deviceScaleFactor:1});
  const page=await context.newPage();page.setDefaultTimeout(30_000);
  const actor={context,page,touch,name,state:null,session:null,inputs:[]};actors.push(actor);
  page.on('pageerror',error=>errors.push(`${name}: ${error.message}`));
  page.on('request',request=>{
    if(request.url()!==new URL('/api/game',baseURL).href||request.method()!=='POST')return;
    const body=request.postDataJSON();
    if(body?.action==='input')actor.inputs.push(body.input);
  });
  page.on('response',async response=>{
    if(response.url()!==new URL('/api/game',baseURL).href||response.request().method()!=='POST')return;
    if(response.status()>=500)errors.push(`${name}: API HTTP ${response.status()}`);
    if(!response.ok())return;
    const body=await response.json().catch(()=>null);
    if(body?.state)actor.state=body.state;
    if(body?.token){actor.session={room:body.room,token:body.token,playerId:body.playerId};credentials.push({...actor.session});}
  });
  await page.goto('/',{waitUntil:'domcontentloaded',timeout:60_000});
  await expect(page.getByTestId('play-online')).toBeEnabled({timeout:90_000});
  await page.locator('#lobby-name').fill(name);
  await click(actor,page.getByTestId('open-settings'));
  await click(actor,page.getByRole('button',{name:/PERFORMANCE/}));
  await click(actor,page.getByTestId('close-settings'));
  return actor;
}
async function enter(actor){
  await actor.page.bringToFront();
  if(await actor.page.getByTestId('resume-game').isVisible())await click(actor,actor.page.getByTestId('resume-game'));
  await waitDebug(actor,state=>state.phase==='playing','Player enters match');
}
async function create(actor,mode){
  await click(actor,actor.page.getByTestId(`mode-${mode}`));
  await expect(actor.page.getByTestId(`mode-${mode}`)).toHaveAttribute('aria-pressed','true');
  await click(actor,actor.page.getByRole('button',{name:'CREATE PRIVATE ROOM',exact:true}));
  await click(actor,actor.page.getByTestId('create-room'));
  await waitState(actor,state=>state.mode===mode&&state.players.some(p=>p.name===actor.name),`Private ${mode} room reaches authoritative state`);
  await waitDebug(actor,state=>state.mode==='online'&&state.gameMode===mode,`Client displays ${mode}`);
  return actor.session.room;
}
async function join(actor,room){
  await click(actor,actor.page.getByRole('button',{name:'JOIN A ROOM',exact:true}));
  await actor.page.getByTestId('room-code-input').fill(room);
  await click(actor,actor.page.getByTestId('join-room'));
  await waitDebug(actor,state=>state.mode==='online'&&state.roomCode===room,'Second browser joins selected private room');
}
async function leave(actor){
  await actor.page.bringToFront();
  if(await actor.page.getByTestId('buy-panel').isVisible())await click(actor,actor.page.getByTestId('close-buy'));
  if(!(await actor.page.getByTestId('pause-menu').isVisible())){
    if(actor.touch)await click(actor,actor.page.getByRole('button',{name:'Pause game',exact:true}));
    else await actor.page.keyboard.press('Escape');
  }
  await click(actor,actor.page.getByTestId('leave-game'));
  await expect(actor.page.getByTestId('lobby')).toBeVisible();
  actor.state=null;actor.session=null;
}
async function buy(actor,item,expected){
  await click(actor,actor.page.getByTestId(`buy-${item}`));
  await waitState(actor,()=>expected(player(actor)),`Server confirms ${actor.name} bought ${item}`);
  assert.ok(actor.inputs.some(input=>input.buy===item),`Purchase ${item} uses the authenticated input transport`);
}
async function openBuy(actor){
  if(actor.touch)await click(actor,actor.page.getByTestId('open-buy'));
  else await actor.page.keyboard.press('KeyB'); // Pointer lock intentionally keeps desktop clicks on the world.
  await expect(actor.page.getByTestId('buy-panel')).toBeVisible();
}
async function checkTouchTargets(actor,label){
  const targets=await actor.page.locator('.touch-controls button,.session-tools button,.weapon-loadout button,.economy-status button,.utility-bar button,.bomb-interaction button').evaluateAll(buttons=>buttons.flatMap(button=>{
    const bounds=button.getBoundingClientRect(),style=getComputedStyle(button);
    if(!bounds.width||!bounds.height||style.display==='none'||style.visibility==='hidden')return [];
    return [{name:button.getAttribute('aria-label')||button.getAttribute('data-testid')||button.textContent.trim(),x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height,viewportWidth:innerWidth,viewportHeight:innerHeight}];
  }));
  assert.ok(targets.length>=15,`${label}: gameplay, session, loadout, economy and utility controls are present`);
  for(const target of targets){
    assert.ok(target.width>=47.99&&target.height>=47.99,`${label}: ${target.name} is at least 48px (${target.width}×${target.height})`);
    assert.ok(target.x>=-.5&&target.y>=-.5&&target.x+target.width<=target.viewportWidth+.5&&target.y+target.height<=target.viewportHeight+.5,`${label}: ${target.name} stays inside the viewport`);
  }
  for(let i=0;i<targets.length;i++)for(let j=i+1;j<targets.length;j++){
    const a=targets[i],b=targets[j],overlapX=Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x),overlapY=Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y);
    assert.ok(overlapX<=.5||overlapY<=.5,`${label}: ${a.name} overlaps ${b.name} by ${overlapX.toFixed(1)}×${overlapY.toFixed(1)}px`);
  }
}

try{
  // Preload both WebGL clients before starting the timed buy phase.
  const host=await makeActor('Classic browser CT');
  const phone=await makeActor('Classic browser T',true);
  await expect(host.page.getByTestId('mode-classic')).toHaveAttribute('aria-pressed','true');
  await click(host,host.page.getByTestId('mode-deathmatch'));
  await expect(host.page.getByTestId('play-online')).toContainText('Deathmatch');
  const room=await create(host,'classic');
  await waitState(host,state=>state.classic?.phase==='waiting','A single human cannot start a classic round');
  assert.equal(player(host).money,800);
  assert.deepEqual([...player(host).inventory].sort(),['knife','pistol']);
  await enter(host);
  await shot(host,'classic-waiting');
  await join(phone,room);
  await waitState(phone,state=>state.mode==='classic'&&state.classic?.phase==='freeze'&&state.players.length===2,'Both teams start a freeze/buy phase');
  assert.ok(phone.state.players.every(p=>!p.bot));
  assert.equal(player(phone).team,'orange');
  assert.equal(player(host).team,'blue');

  await enter(phone);
  await openBuy(phone);
  await expect(phone.page.getByTestId('buy-sniper')).toBeDisabled();
  await expect(phone.page.getByTestId('buy-kit')).toBeDisabled();
  await buy(phone,'smoke',p=>p?.money===500&&p.grenades.smoke===1);
  await buy(phone,'flash',p=>p?.money===300&&p.grenades.flash===1);
  await shot(phone,'phone-classic-buy');
  await click(phone,phone.page.getByTestId('close-buy'));

  await enter(host);
  await openBuy(host);
  await expect(host.page.getByTestId('buy-sniper')).toBeDisabled();
  await buy(host,'kit',p=>p?.money===400&&p.defuseKit===true);
  await buy(host,'smoke',p=>p?.money===100&&p.grenades.smoke===1);
  await expect(host.page.getByTestId('buy-smoke')).toBeDisabled();
  await shot(host,'desktop-classic-buy');
  await click(host,host.page.getByTestId('close-buy'));
  await waitState(phone,state=>state.players.find(p=>p.id===host.session.playerId)?.defuseKit===true,'Second browser observes host purchase');
  await waitState(host,state=>state.players.find(p=>p.id===phone.session.playerId)?.grenades.smoke===1,'Host observes phone inventory');
  await waitState(host,state=>state.classic?.phase==='live','Freeze automatically advances to live round');
  assert.equal(host.state.classic.bomb.status,'carried');
  assert.equal(host.state.classic.bomb.carrierId,phone.session.playerId);
  assert.equal(host.state.classic.sites.length,2);
  await expect(host.page.getByTestId('classic-status')).toBeVisible();

  await enter(phone);
  await click(phone,phone.page.getByTestId('grenade-smoke'));
  await click(phone,phone.page.getByTestId('throw-grenade'));
  await waitState(phone,()=>player(phone)?.grenades.smoke===0,'Phone throw consumes one owned smoke');
  await waitState(host,state=>state.smokes.length===1,'A smoke cloud is authoritative in the other browser');
  assert.ok(phone.inputs.some(input=>input.grenade==='smoke'));
  await checkTouchTargets(phone,'Classic landscape');
  await shot(phone,'phone-classic-smoke');
  const identity=await debug(phone);
  await phone.page.setViewportSize({width:390,height:844});
  await expect.poll(()=>phone.page.evaluate(()=>[innerWidth,innerHeight])).toEqual([390,844]);
  await waitDebug(phone,state=>state.phase==='playing'&&state.playerId===identity.playerId&&state.roomCode===identity.roomCode,'Portrait rotation preserves the live Classic session');
  await checkTouchTargets(phone,'Classic portrait');
  await shot(phone,'phone-classic-portrait');
  await phone.page.setViewportSize({width:844,height:390});
  await expect.poll(()=>phone.page.evaluate(()=>[innerWidth,innerHeight])).toEqual([844,390]);
  await enter(host);
  await shot(host,'desktop-classic-live');
  await leave(phone);await leave(host);

  // The expensive sniper belongs to the free Deathmatch arsenal; no money or
  // state mutation shortcuts are used to manufacture a Classic purchase.
  const deathmatchRoom=await create(phone,'deathmatch');
  await join(host,deathmatchRoom);
  await waitState(host,state=>state.mode==='deathmatch'&&state.players.length===2,'Private join follows the existing Deathmatch room mode');
  await enter(phone);
  await click(phone,phone.page.getByTestId('weapon-sniper'));
  await waitDebug(phone,state=>state.weapon==='sniper'&&state.visibleWeapon.some(name=>/sniper/i.test(name)),'Phone equips a distinct sniper view model');
  await waitState(host,state=>state.players.find(p=>p.id===phone.session.playerId)?.weapon==='sniper','Peer observes sniper selection');
  await click(phone,phone.page.getByTestId('aim-button'));
  await waitDebug(phone,state=>state.aim===1&&state.fov<50,'Phone sniper scope changes the actual camera projection');
  const firstZoom=(await debug(phone)).fov;
  await click(phone,phone.page.getByTestId('aim-button'));
  await waitDebug(phone,state=>state.aim===2&&state.fov<firstZoom-10,'Phone sniper supports the second zoom level');
  const ammunition=player(phone).ammo;
  await click(phone,phone.page.getByTestId('fire-button'));
  await waitState(phone,()=>player(phone)?.ammo===ammunition-1,'Scoped sniper firing consumes authoritative ammunition');
  await shot(phone,'phone-deathmatch-sniper');
  assert.deepEqual(errors,[]);
  console.log(`PASS Classic waiting → buy → live; purchases and smoke shared by two browsers; isolated Deathmatch and phone sniper. Screenshots: ${artifacts}`);
}catch(error){
  for(const [index,actor] of actors.entries()){
    await shot(actor,`failure-${index}`).catch(()=>{});
    // Session credentials are deliberately excluded from diagnostics.
    console.error('Classic browser state',JSON.stringify({name:actor.name,debug:await debug(actor).catch(()=>null),classic:actor.state?.classic,player:player(actor)}));
  }
  console.error('Browser errors',errors);throw error;
}finally{
  // Only sessions created by this test are touched; production rooms and data
  // are never cleared or teleported for verification.
  await Promise.allSettled(credentials.map(session=>fetch(new URL('/api/game',baseURL),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'leave',room:session.room,token:session.token})})));
  await Promise.allSettled(actors.map(actor=>actor.context.close()));
  await browser.close();
}
