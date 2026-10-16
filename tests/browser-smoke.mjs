import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';

const baseURL=process.env.TEST_URL||process.env.BASE_URL||'http://127.0.0.1:5173';
const artifacts=resolve(process.env.TEST_ARTIFACTS||'test-results/multiplayer');
await mkdir(artifacts,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:process.env.HEADED!=='1',args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const contexts=[],errors=[],serverErrors=[],inputDiagnostics=new Map();
const debug=page=>page.evaluate(()=>window.__NANDED_DEBUG__);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const screenshot=(page,name)=>page.screenshot({path:resolve(artifacts,`${name}.png`),fullPage:true});
async function wait(page,predicate,message){await expect.poll(async()=>{const state=await debug(page);return !!state&&predicate(state);},{message,timeout:30_000,intervals:[100,250,500]}).toBe(true);}
async function click(page,locator){await page.bringToFront();if(await page.evaluate(()=>matchMedia('(pointer:coarse)').matches))await locator.tap({force:true});else await locator.click({force:true});}
async function createPage(name,viewport,touch=false){
  const context=await browser.newContext({baseURL,viewport,hasTouch:touch,isMobile:touch,deviceScaleFactor:touch?2:1});contexts.push(context);
  const page=await context.newPage();page.setDefaultTimeout(30_000);
  const inputSamples={movingRequests:0,recent:[]};inputDiagnostics.set(page,inputSamples);
  page.on('request',request=>{
    if(!request.url().startsWith(baseURL)||!request.url().endsWith('/api/game')||request.method()!=='POST')return;
    const input=request.postDataJSON()?.input;if(!input)return;
    if(input.forward||input.strafe)inputSamples.movingRequests++;
    inputSamples.recent.push({seq:input.seq,forward:input.forward,strafe:input.strafe});
    if(inputSamples.recent.length>12)inputSamples.recent.shift();
  });
  page.on('pageerror',error=>errors.push(`${name}: ${error.message}`));
  page.on('response',response=>{if(response.status()>=500&&response.url().startsWith(baseURL))serverErrors.push(`${name}: ${response.status()} ${response.url()}`);});
  await page.goto('/',{waitUntil:'domcontentloaded',timeout:60_000});
  await expect(page.getByTestId('play-online')).toBeEnabled({timeout:90_000});
  await expect(page.getByTestId('lobby')).toBeVisible();
  await screenshot(page,`${name}-lobby-sharp`);
  if(touch){const ratio=await page.getByTestId('game-canvas').evaluate(canvas=>canvas.width/canvas.clientWidth);assert.ok(ratio>=1.9,'Phone defaults to sharp 2x drawing buffer');}
  await page.locator('#lobby-name').fill(name);
  await click(page,page.getByTestId('open-settings'));
  await expect(page.getByRole('button',{name:/SHARP/})).toHaveAttribute('aria-pressed','true');
  await click(page,page.getByRole('button',{name:/PERFORMANCE/}));
  await click(page,page.getByTestId('close-settings'));
  return page;
}
async function enter(page){
  await page.bringToFront();
  if(await page.getByTestId('resume-game').isVisible())await click(page,page.getByTestId('resume-game'));
  await wait(page,state=>state.phase==='playing','Player enters the match');
}
async function leave(page){
  await page.bringToFront();
  if(!(await page.getByTestId('pause-menu').isVisible())){
    if(await page.evaluate(()=>matchMedia('(pointer:coarse)').matches))await click(page,page.getByRole('button',{name:'Pause game',exact:true}));
    else await page.keyboard.press('Escape');
  }
  await expect(page.getByTestId('pause-menu')).toBeVisible();
  await click(page,page.getByTestId('leave-game'));
  await expect(page.getByTestId('lobby')).toBeVisible();
}
async function verifyTouch(page){
  await enter(page);
  await wait(page,state=>state.health>0,'Touch player is alive before input check');
  const controls=await page.locator('.touch-controls button,.session-tools button,.weapon-loadout button').evaluateAll(buttons=>buttons.map(button=>{const r=button.getBoundingClientRect();return {name:button.getAttribute('aria-label'),x:r.x,y:r.y,width:r.width,height:r.height,w:innerWidth,h:innerHeight};}));
  for(const r of controls){assert.ok(r.width>=48&&r.height>=48,`${r.name}: >=48px`);assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=r.w&&r.y+r.height<=r.h,`${r.name}: in viewport`);}
  for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){const a=controls[i],b=controls[j];assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,`${a.name}/${b.name}: no overlap`);}
  const joystick=await page.getByTestId('movement-joystick').boundingBox(),fire=await page.getByTestId('fire-button').boundingBox(),size=page.viewportSize();
  assert.ok(joystick&&fire);
  const move={x:joystick.x+joystick.width/2,y:joystick.y+joystick.height*.2,id:1},aim={x:size.width*.65,y:size.height*.4,id:2},shoot={x:fire.x+fire.width/2,y:fire.y+fire.height/2,id:3};
  const session=await page.context().newCDPSession(page),before=await debug(page);
  try{
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[move]});
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[move,aim]});
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[move,aim,shoot]});
    await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[move,{...aim,x:aim.x+30},shoot]});
    await wait(page,state=>distance(state.localPlayer,before.localPlayer)>.4&&state.ammo<before.ammo,'Real touch movement and firing reach authoritative state');
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.ok(Math.abs((await debug(page)).yaw-before.yaw)>.05,'Simultaneous aim touch changes view');
  }finally{await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}).catch(()=>{});await session.detach();}
  await page.waitForTimeout(1300);
  const stopped=await debug(page);await page.waitForTimeout(500);
  const later=await debug(page);
  assert.ok(distance(stopped.localPlayer,later.localPlayer)<.15,'Released joystick stops server movement');
  assert.equal(stopped.ammo,later.ammo,'Released fire stops firing');
  await click(page,page.getByRole('button',{name:'Reload weapon',exact:true}));
  await wait(page,state=>state.ammo===30,'Touch reload completes');
}
async function verifyLoadout(page){
  await enter(page);
  const rifleAmmo=(await debug(page)).ammo;
  await click(page,page.getByTestId('weapon-pistol'));
  await wait(page,state=>state.weapon==='pistol'&&state.visibleWeapon.includes('P12 handgun'),'Handgun slot equips the real handgun model');
  await expect(page.getByTestId('weapon-pistol')).toHaveAttribute('aria-pressed','true');
  await expect(page.getByTestId('weapon-status')).toContainText('HANDGUN');
  const pistolAmmo=(await debug(page)).ammo;
  await click(page,page.getByTestId('fire-button'));
  await wait(page,state=>state.ammo<pistolAmmo,'Handgun touch shot consumes its own ammunition');
  const pistolRemaining=(await debug(page)).ammo;
  await click(page,page.getByTestId('weapon-knife'));
  await wait(page,state=>state.weapon==='knife'&&state.visibleWeapon.includes('Combat knife'),'Knife slot equips the real knife model');
  await expect(page.getByTestId('weapon-knife')).toHaveAttribute('aria-pressed','true');
  await expect(page.getByTestId('weapon-status')).toContainText('CLOSE RANGE');
  await expect(page.getByRole('button',{name:'Reload weapon',exact:true})).toBeDisabled();
  await expect(page.getByTestId('fire-button')).toHaveAccessibleName('Slash knife');
  // Switching does not bypass the shared attack cooldown after the handgun shot.
  await page.waitForTimeout(600);
  const lastAttack=(await debug(page)).lastAttackAt;
  await click(page,page.getByTestId('fire-button'));
  await wait(page,state=>state.lastAttackAt>lastAttack,'Knife touch slash reaches game state');
  await click(page,page.getByTestId('weapon-rifle'));
  await wait(page,state=>state.weapon==='rifle'&&state.visibleWeapon.includes('AR30 rifle'),'Rifle slot restores the rifle model');
  assert.equal((await debug(page)).ammo,rifleAmmo,'Handgun shots do not consume rifle ammunition');
  await click(page,page.getByTestId('weapon-pistol'));
  await wait(page,state=>state.weapon==='pistol','Return to handgun');
  assert.equal((await debug(page)).ammo,pistolRemaining,'Weapon switching preserves the handgun magazine');
  await click(page,page.getByTestId('weapon-rifle'));
  await wait(page,state=>state.weapon==='rifle','Restore rifle for remaining input tests');
  await expect(page.getByTestId('weapon-rifle')).toHaveAttribute('aria-pressed','true');
  await expect(page.getByTestId('weapon-status')).toContainText('RIFLE');
}
async function verifyScreenControls(page){
  await enter(page);
  const before=await debug(page);
  const joystick=await page.getByTestId('movement-joystick').boundingBox();
  const fire=await page.getByTestId('fire-button').boundingBox();
  assert.ok(joystick&&fire);
  const move={x:joystick.x+joystick.width/2,y:joystick.y+joystick.height*.2,id:11};
  const shoot={x:fire.x+fire.width/2,y:fire.y+fire.height/2,id:12};
  const session=await page.context().newCDPSession(page);
  try{
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[move,shoot]});
    await wait(page,state=>distance(state.localPlayer,before.localPlayer)>.2&&state.ammo<before.ammo,'Inputs are active before opening Screen');
    // Browsers suppress a click from a third finger during an active multi-touch
    // gesture. Keyboard activation exercises the real button handler while both
    // touch controls remain held; ordinary phone taps are tested in online rotation.
    await page.getByTestId('open-screen-game').press('Enter');
    await expect(page.getByTestId('screen-panel')).toBeVisible();
    await wait(page,state=>state.phase==='paused','Screen dialog pauses input without replacing the game');
  }finally{
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}).catch(()=>{});
    await session.detach();
  }
  await expect(page.getByTestId('screen-current')).toContainText('Portrait');
  // Simulate an iPhone-like browser with no orientation-lock API. This tests the
  // actual React wiring; supported native lock/fullscreen ordering is unit tested.
  await page.evaluate(()=>{
    const orientation=screen.orientation,root=document.documentElement;
    const keys=[[orientation,'lock'],[orientation,'unlock'],[root,'requestFullscreen'],[document,'fullscreenEnabled']];
    window.__SCREEN_TEST_RESTORE__=keys.map(([object,key])=>({object,key,descriptor:Object.getOwnPropertyDescriptor(object,key)}));
    Object.defineProperty(orientation,'lock',{configurable:true,value:undefined});
    Object.defineProperty(orientation,'unlock',{configurable:true,value:()=>{}});
    Object.defineProperty(root,'requestFullscreen',{configurable:true,value:undefined});
    Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:false});
  });
  try{
    await click(page,page.getByTestId('screen-landscape'));
    await expect(page.getByTestId('screen-message')).toContainText('cannot rotate');
    await expect(page.getByTestId('screen-message')).toContainText('sideways');
    await expect(page.getByTestId('screen-current')).toContainText('Portrait');
    await click(page,page.getByTestId('screen-fullscreen'));
    await expect(page.getByTestId('screen-message')).toContainText('unavailable');
    await screenshot(page,'screen-portrait-fallback');
    await page.setViewportSize({width:844,height:390});
    await expect(page.getByTestId('screen-current')).toContainText('Landscape');
    await expect(page.getByTestId('screen-current')).toContainText('Browser window');
    const afterResize=await debug(page);
    assert.equal(afterResize.playerId,before.playerId,'Rotation preserves player identity');
    assert.equal(afterResize.roomCode,before.roomCode,'Rotation preserves room');
    assert.equal(afterResize.mode,before.mode,'Rotation preserves game mode');
    await page.evaluate(()=>{
      window.__SCREEN_TEST_LOCK_CALLS__=0;
      Object.defineProperty(screen.orientation,'lock',{configurable:true,value:async()=>{window.__SCREEN_TEST_LOCK_CALLS__++;}});
      Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:true});
      Object.defineProperty(document.documentElement,'requestFullscreen',{configurable:true,value:async()=>{throw new DOMException('Denied by test','NotAllowedError');}});
    });
    await click(page,page.getByTestId('screen-portrait'));
    await expect(page.getByTestId('screen-message')).toContainText('Full screen was not allowed');
    assert.equal(await page.evaluate(()=>window.__SCREEN_TEST_LOCK_CALLS__),0,'A fullscreen rejection does not attempt an invalid orientation lock');
    await expect(page.getByTestId('screen-current')).toContainText('Landscape');
    await click(page,page.getByTestId('screen-auto'));
    await expect(page.getByTestId('screen-auto')).toHaveAttribute('aria-pressed','true');
    await expect(page.getByTestId('screen-message')).toContainText('follows your phone');
    await screenshot(page,'screen-landscape-options');
  }finally{
    await page.evaluate(()=>{
      for(const {object,key,descriptor} of window.__SCREEN_TEST_RESTORE__??[]){if(descriptor)Object.defineProperty(object,key,descriptor);else delete object[key];}
      delete window.__SCREEN_TEST_RESTORE__;delete window.__SCREEN_TEST_LOCK_CALLS__;
    });
  }
  await click(page,page.getByRole('button',{name:'BACK TO GAME',exact:true}));
  await wait(page,state=>state.phase==='playing','Screen dialog returns to the same game');
  await page.waitForTimeout(400);const released=await debug(page);await page.waitForTimeout(700);const later=await debug(page);
  assert.ok(distance(released.localPlayer,later.localPlayer)<.1,'Opening and closing Screen clears the held joystick');
  assert.equal(released.ammo,later.ammo,'Opening and closing Screen clears held fire');
  await verifyTouch(page);await verifyLoadout(page);await screenshot(page,'explore-phone-landscape-loadout');
  await page.setViewportSize({width:390,height:844});
  await click(page,page.getByTestId('open-screen-game'));
  await expect(page.getByTestId('screen-current')).toContainText('Portrait');
  await click(page,page.getByRole('button',{name:'BACK TO GAME',exact:true}));
  await enter(page);
}
async function verifyOnlineRotation(page,peerPage){
  await enter(page);
  const before=await debug(page),peerId=(await debug(peerPage)).playerId;
  for(const [width,height,orientation] of [[390,844,'Portrait'],[844,390,'Landscape']]){
    await page.setViewportSize({width,height});
    await click(page,page.getByTestId('open-screen-game'));
    await expect(page.getByTestId('screen-current')).toContainText(orientation);
    await wait(page,state=>state.phase==='paused'&&state.mode==='online'&&state.playerId===before.playerId&&state.roomCode===before.roomCode&&state.players.some(player=>player.id===peerId),`${orientation}: Screen preserves the online player, private room and peer`);
    await screenshot(page,`private-screen-${orientation.toLowerCase()}`);
    await click(page,page.getByRole('button',{name:'BACK TO GAME',exact:true}));
    await wait(page,state=>state.phase==='playing'&&state.mode==='online'&&state.playerId===before.playerId&&state.roomCode===before.roomCode&&state.players.some(player=>player.id===peerId),`${orientation}: returning from Screen keeps the online session`);
    await wait(peerPage,state=>state.roomCode===before.roomCode&&state.players.some(player=>player.id===before.playerId),'Private host retains the rotating phone participant');
  }
}
let host,phone;
try{
  host=await createPage('QA DESKTOP',{width:1100,height:720});
  if(process.env.TEST_SCOPE==='screen'){
    phone=await createPage('QA PHONE',{width:844,height:390},true);
  }else{
  await click(host,host.getByTestId('play-online'));
  await wait(host,state=>state.mode==='online'&&state.roomCode==='NANDED','Desktop joins shared public room');
  console.log('PASS desktop joined public room');
  const first=await debug(host);assert.ok(first.players.every(player=>!player.bot),'Public room contains no bots');
  if(first.players.length===1)await expect(host.getByTestId('online-status')).toContainText('WAITING');
  phone=await createPage('QA PHONE',{width:844,height:390},true);
  await click(phone,phone.getByTestId('play-online'));
  await wait(phone,state=>state.mode==='online'&&state.roomCode==='NANDED','Phone independently joins same public room');
  const phoneId=(await debug(phone)).playerId,hostId=first.playerId;
  await wait(host,state=>state.players.some(player=>player.id===phoneId),'Desktop receives phone participant');
  await wait(phone,state=>state.players.some(player=>player.id===hostId),'Phone receives desktop participant');
  const joined=await debug(host);assert.ok(joined.players.every(player=>!player.bot));
  const a=joined.players.find(player=>player.id===hostId),b=joined.players.find(player=>player.id===phoneId);
  assert.ok(distance(a,b)>.9,'Players spawn separately');
  console.log('PASS public: two independent clients, same NANDED room, real players only, separated spawns');
  await enter(host);const start=(await debug(host)).localPlayer;
  await host.keyboard.down('KeyW');try{await wait(host,state=>distance(state.localPlayer,start)>.5,'Desktop movement reaches server');}finally{await host.keyboard.up('KeyW');}
  await host.waitForTimeout(900);const moved=(await debug(host)).localPlayer;
  await wait(phone,state=>{const peer=state.players.find(player=>player.id===hostId);return peer&&distance(peer,moved)<.8&&distance(peer,start)>.3;},'Phone sees desktop movement');
  const ammo=(await debug(host)).ammo;await host.mouse.down();try{await wait(host,state=>state.ammo<ammo,'Desktop firing reaches server');}finally{await host.mouse.up();}
  await host.keyboard.press('KeyR');await wait(host,state=>state.ammo===30,'Desktop reload completes');
  await host.keyboard.down('Tab');await expect(host.getByTestId('scoreboard')).toBeVisible();await host.keyboard.up('Tab');
  await screenshot(host,'public-desktop');await host.keyboard.press('Escape');
  const phoneBefore=(await debug(phone)).localPlayer;await verifyTouch(phone);
  const phoneAfter=(await debug(phone)).localPlayer;
  await wait(host,state=>{const peer=state.players.find(player=>player.id===phoneId);return peer&&distance(peer,phoneAfter)<.8&&distance(peer,phoneBefore)>.3;},'Desktop sees phone touch movement');
  await screenshot(phone,'public-phone-landscape');
  console.log('PASS public controls: desktop and phone movement visible in both sessions, actual multi-touch aim/fire, reload, scoreboard');
  await phone.route('**/api/game',route=>route.abort());
  await expect(phone.getByTestId('online-status')).toContainText('RECONNECTING',{timeout:20_000});
  await phone.unroute('**/api/game');await wait(phone,state=>state.mode==='online'&&state.roomCode==='NANDED','Phone remains in room after reconnect');
  await expect(phone.getByTestId('online-status')).not.toContainText('RECONNECTING',{timeout:20_000});
  await leave(phone);await wait(host,state=>!state.players.some(player=>player.id===phoneId),'Leaving removes the real participant');await leave(host);
  }

  await host.getByTestId('start-location').selectOption('college-road');
  await click(host,host.getByRole('button',{name:'CREATE PRIVATE ROOM',exact:true}));
  await expect(host.locator('#private-location')).toHaveValue('college-road');
  await click(host,host.getByTestId('create-room'));
  await wait(host,state=>state.mode==='online'&&state.roomCode!=='NANDED','Private room created');
  const privateState=await debug(host);assert.equal(privateState.locationId,'college-road');assert.equal(privateState.players.length,1);assert.equal(privateState.players[0].bot,false);
  await phone.goto(`/?room=${privateState.roomCode}`,{waitUntil:'domcontentloaded'});
  await expect(phone.getByTestId('room-code-input')).toHaveValue(privateState.roomCode,{timeout:60_000});
  assert.equal((await debug(phone)).mode,'lobby','Invite does not autojoin before a user click');
  await expect(phone.getByTestId('join-room')).toBeEnabled({timeout:60_000});await click(phone,phone.getByTestId('join-room'));
  await wait(phone,state=>state.mode==='online'&&state.roomCode===privateState.roomCode,'Invite link joins private room');
  const guestId=(await debug(phone)).playerId;
  await wait(host,state=>state.players.some(player=>player.id===guestId),'Private host receives invited phone');
  const pair=await debug(host);assert.equal(pair.players.length,2);assert.ok(pair.players.every(player=>!player.bot));
  await click(host,host.getByRole('button',{name:new RegExp('COPY INVITE LINK')}));
  await expect(host.getByRole('button',{name:/INVITE COPIED/})).toBeVisible();
  await screenshot(host,'private-invite');
  await verifyOnlineRotation(phone,host);
  await leave(phone);await leave(host);
  console.log('PASS private: selected area, fresh human-only room, prefilled invite requires click, second browser joins, copy invite, portrait/landscape keeps player identity and both participants');

  await phone.setViewportSize({width:390,height:844});
  await click(phone,phone.getByTestId('explore-map'));await wait(phone,state=>state.mode==='solo'&&state.exploration,'Peaceful exploration remains available');
  assert.equal((await debug(phone)).players.length,1);await verifyTouch(phone);await verifyLoadout(phone);await screenshot(phone,'explore-phone-portrait');
  await verifyScreenControls(phone);await leave(phone);
  await expect(phone.getByTestId('open-screen-lobby')).toBeVisible();
  await click(phone,phone.getByRole('group',{name:'Visit a landmark',exact:true}).getByRole('button',{name:'Konale',exact:true}));
  await expect(phone.getByTestId('start-location')).toHaveValue('konale');
  assert.equal((await debug(phone)).mode,'lobby','Landmark shortcut selects a start without launching or losing lobby state');
  console.log('PASS phone screens: portrait/landscape layout, real weapon slots and independent magazines, native fallback, fullscreen denial, preserved game and cleared held touches');
  assert.deepEqual(errors,[],'No browser JavaScript errors');assert.deepEqual(serverErrors,[],'No server failures');
  console.log(`PASS ${process.env.TEST_SCOPE==='screen'?'private-room, phone screen and loadout':'all'} browser flows. Screenshots: ${artifacts}`);
}catch(error){for(const [index,context] of contexts.entries())for(const page of context.pages()){await screenshot(page,`failure-${index}`).catch(()=>{});console.error('Failure state:',JSON.stringify(await debug(page).catch(()=>null)));console.error('Failure inputs (no credentials):',JSON.stringify(inputDiagnostics.get(page)));console.error('Failure focus/status:',JSON.stringify(await page.evaluate(()=>({activeElement:document.activeElement?.outerHTML.slice(0,500),pointerLock:document.pointerLockElement?.getAttribute('data-testid'),status:document.querySelector('[data-testid="online-status"]')?.textContent})).catch(()=>null)));}console.error('Browser errors:',errors,'Server errors:',serverErrors);throw error;}
finally{
  for(const page of [phone,host])if(page&&!page.isClosed())try{const state=await debug(page);if(state?.mode!=='lobby')await leave(page);}catch{}
  await browser.close();
}
