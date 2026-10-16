import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';

const baseURL=process.env.TEST_URL||process.env.BASE_URL||'http://127.0.0.1:5173';
const artifacts=resolve(process.env.TEST_ARTIFACTS||'test-results/multiplayer');
await mkdir(artifacts,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:process.env.HEADED!=='1',args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const contexts=[],errors=[],serverErrors=[];
const debug=page=>page.evaluate(()=>window.__NANDED_DEBUG__);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const screenshot=(page,name)=>page.screenshot({path:resolve(artifacts,`${name}.png`),fullPage:true});
async function wait(page,predicate,message){await expect.poll(async()=>{const state=await debug(page);return !!state&&predicate(state);},{message,timeout:30_000,intervals:[100,250,500]}).toBe(true);}
async function click(page,locator){await page.bringToFront();if(await page.evaluate(()=>matchMedia('(pointer:coarse)').matches))await locator.tap({force:true});else await locator.click({force:true});}
async function createPage(name,viewport,touch=false){
  const context=await browser.newContext({baseURL,viewport,hasTouch:touch,isMobile:touch,deviceScaleFactor:touch?2:1});contexts.push(context);
  const page=await context.newPage();page.setDefaultTimeout(30_000);
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
  const controls=await page.locator('.touch-controls button,.session-tools button').evaluateAll(buttons=>buttons.map(button=>{const r=button.getBoundingClientRect();return {name:button.getAttribute('aria-label'),x:r.x,y:r.y,width:r.width,height:r.height,w:innerWidth,h:innerHeight};}));
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
let host,phone;
try{
  host=await createPage('QA DESKTOP',{width:1100,height:720});
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
  await leave(phone);await leave(host);
  console.log('PASS private: selected area, fresh human-only room, prefilled invite requires click, second browser joins, copy invite');

  await phone.setViewportSize({width:390,height:844});
  await click(phone,phone.getByTestId('explore-map'));await wait(phone,state=>state.mode==='solo'&&state.exploration,'Peaceful exploration remains available');
  assert.equal((await debug(phone)).players.length,1);await verifyTouch(phone);await screenshot(phone,'explore-phone-portrait');await leave(phone);
  assert.deepEqual(errors,[],'No browser JavaScript errors');assert.deepEqual(serverErrors,[],'No server failures');
  console.log(`PASS all browser flows. Screenshots: ${artifacts}`);
}catch(error){for(const [index,context] of contexts.entries())for(const page of context.pages()){await screenshot(page,`failure-${index}`).catch(()=>{});console.error('Failure state:',JSON.stringify(await debug(page).catch(()=>null)));}throw error;}
finally{
  for(const page of [phone,host])if(page&&!page.isClosed())try{const state=await debug(page);if(state?.mode!=='lobby')await leave(page);}catch{}
  await browser.close();
}
