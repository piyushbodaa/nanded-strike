import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';

const baseURL=process.env.TEST_URL||'http://127.0.0.1:5175';
const artifacts=resolve(process.env.TEST_ARTIFACTS||'/tmp/counterstrike-places-local');
await mkdir(artifacts,{recursive:true});
const reference=await fetch(`${baseURL}/place-reference.json`).then(response=>{assert.equal(response.status,200);return response.json();});
const mapReference=await fetch(`${baseURL}/map-reference.json`).then(response=>{assert.equal(response.status,200);return response.json();});
const districtReference=await fetch(`${baseURL}/district-landmark-reference.json`).then(response=>{assert.equal(response.status,200);return response.json();});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:process.env.HEADED==='0',args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const contexts=[],errors=[],serverErrors=[],samples=[];
const debug=page=>page.evaluate(()=>window.__NANDED_DEBUG__);
const screenshot=(page,name)=>page.screenshot({path:resolve(artifacts,`${name}.png`),fullPage:true});
async function captureWorld(page,name){
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const state=await debug(page);
 const model=districtReference.models.find(model=>`landmark-${model.id}`===state.visitingPlaceId);
 const expectedYaw=model?.viewpoint?.yaw??(state.visitingPlaceId==='landmark-konale-neet'?-2.64287:undefined);
 if(expectedYaw!==undefined)assert.ok(Math.abs(state.yaw-expectedYaw)<.01,`${name}: pointer lock preserves the selected landmark heading (${state.yaw} vs ${expectedYaw})`);
 if(model?.estimated?.facadePosition&&model?.viewpoint){
  const p=model.viewpoint,f=model.estimated.facadePosition;
  const expectedPitch=Math.atan2(model.estimated.heightMetres*.4-1.58,Math.hypot(p.x-f.x,p.z-f.z));
  assert.ok(Math.abs(state.pitch-expectedPitch)<.01,`${name}: pointer lock preserves landmark pitch (${state.pitch} vs ${expectedPitch})`);
 }
 await screenshot(page,name);
}
const wait=(page,predicate,message)=>expect.poll(async()=>{const state=await debug(page);return !!state&&predicate(state);},{message,timeout:30000,intervals:[100,250,500]}).toBe(true);
async function click(page,locator){await page.bringToFront();if(await page.evaluate(()=>matchMedia('(pointer:coarse)').matches))await locator.tap();else await locator.click();}
async function createPage(name,viewport,touch=false){
 const context=await browser.newContext({baseURL,viewport,hasTouch:touch,isMobile:touch,deviceScaleFactor:touch?2:1});contexts.push(context);
 const page=await context.newPage();page.setDefaultTimeout(30000);
 page.on('pageerror',error=>errors.push(`${name}: ${error.message}`));
 page.on('response',response=>{if(response.status()>=500&&response.url().startsWith(baseURL))serverErrors.push(`${name}: ${response.status()} ${response.url()}`);});
 await page.goto('/',{waitUntil:'domcontentloaded',timeout:60000});
 await expect(page.getByTestId('play-online')).toBeEnabled({timeout:90000});
 await page.locator('#lobby-name').fill(name);
 // Low resolution retains every model, material and landmark while keeping two
 // independently connected browser sessions affordable for the integration run.
 await click(page,page.getByTestId('open-settings'));
 await click(page,page.getByRole('button',{name:/PERFORMANCE/}));
 await click(page,page.getByTestId('close-settings'));
 return page;
}
async function openPlaces(page){
 const state=await debug(page);
 if(state.mode==='lobby')await click(page,page.getByTestId('open-places-lobby'));
 else if(await page.evaluate(()=>matchMedia('(pointer:coarse)').matches))await click(page,page.getByTestId('open-places-game'));
 else{
  if(state.phase!=='paused')await page.keyboard.press('Escape');
  await expect(page.getByTestId('open-places-pause')).toBeVisible();
  await click(page,page.getByTestId('open-places-pause'));
 }
 await expect(page.getByTestId('places-panel')).toBeVisible();
}
async function clearFilters(page){
 await page.getByTestId('places-search').fill('');
 await page.getByTestId('places-sector').selectOption('all');
 await click(page,page.getByRole('button',{name:/^All places /}));
}
async function selectPlace(page,query,name){
 await clearFilters(page);await page.getByTestId('places-search').fill(query);
 const row=page.locator('.place-result').filter({has:page.locator('b',{hasText:name})});
 await expect(row.first()).toBeVisible();await click(page,row.first());
 await expect(page.getByTestId('place-name')).toHaveText(name);
}
async function layout(page){
 const result=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth,app:document.querySelector('.app').scrollWidth,panel:document.querySelector('[data-testid="places-panel"]')?.getBoundingClientRect().toJSON()}));
 assert.ok(result.document<=result.width+1&&result.app<=result.width+1,`No horizontal overflow: ${JSON.stringify(result)}`);
 if(result.panel)assert.ok(result.panel.x>=0&&result.panel.x+result.panel.width<=result.width+1,'Directory stays inside viewport');
}
async function touchControls(page){
 const controls=await page.locator('.touch-controls button,.session-tools button,.weapon-loadout button').evaluateAll(buttons=>buttons.map(button=>{const r=button.getBoundingClientRect();return {name:button.getAttribute('aria-label')||button.textContent,x:r.x,y:r.y,width:r.width,height:r.height,w:innerWidth,h:innerHeight};}));
 for(const r of controls){assert.ok(r.width>=48&&r.height>=48,`${r.name}: >=48px`);assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=r.w+1&&r.y+r.height<=r.h+1,`${r.name}: in viewport`);}
 for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){const a=controls[i],b=controls[j];assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,`${a.name}/${b.name}: no overlap`);}
}
async function leave(page){
 if(await page.getByTestId('places-panel').isVisible())await click(page,page.getByRole('button',{name:'Close dialog',exact:true}));
 if((await debug(page)).phase!=='paused'){
  if(await page.evaluate(()=>matchMedia('(pointer:coarse)').matches))await click(page,page.getByRole('button',{name:'Pause game',exact:true}));else await page.keyboard.press('Escape');
 }
 await click(page,page.getByTestId('leave-game'));await expect(page.getByTestId('lobby')).toBeVisible();
}
async function enter(page){await page.bringToFront();if(await page.getByTestId('resume-game').isVisible())await click(page,page.getByTestId('resume-game'));await wait(page,state=>state.phase==='playing','Game resumes');}
let desktop,phone;
try{
 desktop=await createPage('PLACES DESKTOP',{width:1200,height:800});
 await openPlaces(desktop);await layout(desktop);
 const count=Number((await desktop.getByTestId('places-count').innerText()).match(/[\d,]+/)[0].replaceAll(',',''));
 assert.equal(count,reference.counts.places,'UI inventory matches published coverage');
 assert.ok(count>300,'Directory contains the broad inventory');
 await expect(desktop.getByTestId('place-name')).toHaveText('Bhagya Nagar Kaman');
 await screenshot(desktop,'desktop-places-directory');
 for(const category of ['food','shop','hotel','education','health','landmark','service','other']){
  await click(desktop,desktop.getByTestId(`places-category-${category}`));
  await expect(desktop.getByTestId(`places-category-${category}`)).toHaveAttribute('aria-pressed','true');
  assert.ok(await desktop.locator('.place-result').count()>0,`${category} has discoverable listings`);
 }
 await clearFilters(desktop);
 for(const sector of ['bhagya','workshop','anand','shrinagar','college-road']){
  await desktop.getByTestId('places-sector').selectOption(sector);
  assert.ok(await desktop.locator('.place-result').count()>0,`${sector} has discoverable listings`);
 }
 await clearFilters(desktop);await desktop.getByTestId('places-search').fill('no-such-nanded-place-918273');
 await expect(desktop.getByRole('heading',{name:'No matching places'})).toBeVisible();
 await selectPlace(desktop,'Konale','Konale NEET Center');
 assert.ok(await desktop.getByTestId('places-map').evaluate(canvas=>{const d=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let changed=0;for(let i=0;i<d.length;i+=256)if(d[i]!==d[0]||d[i+1]!==d[1]||d[i+2]!==d[2])changed++;return changed>30;}),'Local map renders streets and marker');
 await expect(desktop.locator('.place-source')).toHaveAttribute('href',/^https?:\/\//);
 await click(desktop,desktop.getByTestId('visit-place'));
 await wait(desktop,state=>state.mode==='solo'&&state.exploration&&state.visitingPlaceId==='landmark-konale-neet','Visit starts solo exploration at Konale');
 await enter(desktop);await captureWorld(desktop,'konale-world');
 const first=await debug(desktop);assert.equal(first.world.detailedBuildings,mapReference.displayedBuildings);assert.ok(first.world.windows>100000);samples.push({shot:'konale',state:first});
 for(const [query,name,label] of [['Grand Tulsi','Hotel Grand Tulsi','hotel-grand-tulsi'],['Nanded Pharmacy','Nanded Pharmacy College','nanded-pharmacy'],['Amrut Cafe','Amrut Cafe','amrut-cafe'],['Tekisky','Tekisky','tekisky-workshop'],['Panasonic','Panasonic Living Store','panasonic-store'],['Andhra Idli','Andhra Idli Center','mapped-restaurant-sign']]){
  await openPlaces(desktop);await selectPlace(desktop,query,name);await click(desktop,desktop.getByTestId('visit-place'));await enter(desktop);await captureWorld(desktop,label);samples.push({shot:label,state:await debug(desktop)});
 }
 await leave(desktop);
 console.log('PASS desktop: inventory, search, eight categories, five sectors, empty results, local map, solo visits, all-building detail');
 phone=await createPage('PLACES PHONE',{width:390,height:844},true);
 await openPlaces(phone);await selectPlace(phone,'Grand Tulsi','Hotel Grand Tulsi');await layout(phone);await screenshot(phone,'phone-portrait-directory');
 await click(phone,phone.getByTestId('visit-place'));await enter(phone);await touchControls(phone);await captureWorld(phone,'phone-portrait-world');
 const soloBefore=await debug(phone);
 await phone.setViewportSize({width:844,height:390});await openPlaces(phone);await layout(phone);await screenshot(phone,'phone-landscape-directory');
 await click(phone,phone.getByRole('button',{name:'BACK TO EXPLORING',exact:true}));await enter(phone);await touchControls(phone);
 assert.equal((await debug(phone)).playerId,soloBefore.playerId,'Directory browsing and rotation preserve the solo player');
 await captureWorld(phone,'phone-landscape-world');await leave(phone);
 console.log('PASS phone: portrait/landscape directory, solo Visit, unclipped nonoverlapping 48px controls');
 await desktop.bringToFront();await click(desktop,desktop.getByRole('button',{name:/CREATE PRIVATE ROOM/}));await click(desktop,desktop.getByTestId('create-room'));
 await wait(desktop,state=>state.mode==='online'&&state.roomCode&&state.roomCode!=='NANDED','Create a private room');
 const host=await debug(desktop);
 await phone.bringToFront();await click(phone,phone.getByRole('button',{name:/JOIN A ROOM/}));await phone.getByTestId('room-code-input').fill(host.roomCode);await click(phone,phone.getByTestId('join-room'));
 await wait(phone,state=>state.mode==='online'&&state.players.some(player=>player.id===host.playerId),'Phone joins host in separate browser session');await enter(phone);
 const onlineBefore=await debug(phone);
 await openPlaces(phone);await selectPlace(phone,'Konale','Konale NEET Center');await expect(phone.getByTestId('visit-place')).toBeDisabled();
 await expect(phone.locator('.place-visit-note')).toContainText('live match');
 await screenshot(phone,'online-places-visit-disabled');
 await click(phone,phone.getByRole('button',{name:'BACK TO MATCH',exact:true}));await enter(phone);
 const after=await debug(phone);assert.equal(after.playerId,onlineBefore.playerId);assert.equal(after.roomCode,onlineBefore.roomCode);assert.equal(after.mode,'online');assert.ok(after.players.some(player=>player.id===host.playerId));
 await wait(desktop,state=>state.roomCode===host.roomCode&&state.players.some(player=>player.id===after.playerId),'Host retains the browsing phone participant');
 console.log('PASS online: browse safely, Visit disabled, same room/player/peer after returning');
 await leave(phone);await desktop.bringToFront();await leave(desktop);
 await phone.goto('/?place=landmark-konale-neet',{waitUntil:'domcontentloaded'});await expect(phone.getByTestId('places-panel')).toBeVisible({timeout:90000});await expect(phone.getByTestId('place-name')).toHaveText('Konale NEET Center');await expect(phone.getByTestId('visit-place')).toBeEnabled();assert.equal((await debug(phone)).mode,'lobby','A place deep link does not auto-start a game');
 console.log('PASS place deep link opens the selected listing without auto-start');
 assert.deepEqual(errors,[],'No browser JavaScript errors');assert.deepEqual(serverErrors,[],'No server errors');
 await writeFile(resolve(artifacts,'verification.json'),JSON.stringify({baseURL,referencePlaces:reference.counts.places,renderedPlaces:count,samples,errors,serverErrors},null,2));
 console.log(`PASS all Places browser checks; artifacts ${artifacts}`);
}catch(error){
 for(const [index,context]of contexts.entries())for(const page of context.pages()){await screenshot(page,`failure-${index}`).catch(()=>{});console.error('Failure state',await debug(page).catch(()=>null));}
 console.error({errors,serverErrors});throw error;
}finally{for(const context of contexts)await context.close().catch(()=>{});await browser.close();}
