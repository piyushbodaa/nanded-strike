import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium,expect} from '@playwright/test';
const baseURL=process.env.TEST_URL||'http://127.0.0.1:5175';
const artifacts=resolve(process.env.TEST_ARTIFACTS||'test-results/combat');await mkdir(artifacts,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:process.env.HEADED!=='1',args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const errors=[];
const debug=page=>page.evaluate(()=>window.__NANDED_DEBUG__);
const wait=(page,predicate,message)=>expect.poll(async()=>predicate(await debug(page)),{message,timeout:30000,intervals:[100,200,400]}).toBe(true);
async function setup(touch=false){
 const context=await browser.newContext({baseURL,viewport:touch?{width:390,height:844}:{width:1365,height:900},hasTouch:touch,isMobile:touch});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('nanded-settings-v2',JSON.stringify({quality:'low',sensitivity:1,volume:0})));
 await page.goto('/',{waitUntil:'domcontentloaded'});await expect(page.getByTestId('explore-map')).toBeEnabled({timeout:90000});
 if(touch)await page.getByTestId('explore-map').tap();else await page.getByTestId('explore-map').click();
 if(await page.getByTestId('resume-game').isVisible())await page.getByTestId('resume-game').click();
 await wait(page,d=>d?.phase==='playing','Exploration controls active');return {context,page};
}
try{
 const {context,page}=await setup();
 await page.mouse.click(680,450,{button:'right'});
 await wait(page,d=>d.aim===1&&d.fov<43&&d.localPlayer.aiming,'Right click engages rifle scope and server aiming');
 await expect(page.getByTestId('scope-overlay')).toBeVisible();
 const narrow=(await debug(page)).fov;
 await page.mouse.click(680,450,{button:'right'});await wait(page,d=>d.aim===2&&d.fov<23,'Second right click selects higher magnification');
 await page.screenshot({path:resolve(artifacts,'desktop-rifle-scope.png')});
 await page.mouse.down({button:'left'});const before=(await debug(page)).ammo;
 await page.mouse.click(680,450,{button:'right'});
 await wait(page,d=>d.aim===0&&d.shooting&&d.ammo<before,'Right mouse release does not stop held left fire');
 await page.mouse.up({button:'left'});
 await page.keyboard.press('KeyR');await wait(page,d=>d.aim===0&&d.fov>73,'Reload restores normal view');
 await wait(page,d=>d.ammo===30&&!d.reloadUntil,'Rifle reload completes');
 await page.keyboard.down('ControlLeft');await wait(page,d=>d.localPlayer.crouched&&d.cameraY<1.1,'Crouch changes camera and authoritative stance');
 await page.keyboard.up('ControlLeft');await wait(page,d=>!d.localPlayer.crouched&&d.cameraY>1.5,'Crouch release restores stance');
 await page.keyboard.down('ShiftLeft');await wait(page,d=>d.localPlayer.walking,'Shift activates quiet walking');await page.keyboard.up('ShiftLeft');
 await page.keyboard.press('Digit2');await wait(page,d=>d.weapon==='pistol','Handgun equipped');
 await page.mouse.click(680,450,{button:'right'});await wait(page,d=>d.aim===1&&d.fov>50&&d.fov<65,'Handgun uses iron sights');
 await expect(page.getByTestId('scope-overlay')).toHaveCount(0);
 await page.screenshot({path:resolve(artifacts,'desktop-pistol-sights.png')});
 await page.keyboard.press('Digit3');await wait(page,d=>d.weapon==='knife'&&d.aim===0,'Knife clears zoom');
 const attack=(await debug(page)).lastAttackAt;await page.mouse.click(680,450,{button:'right'});
 await wait(page,d=>d.lastAttackAt>attack&&d.localPlayer.lastAttackSecondary&&d.aim===0,'Right click executes stronger knife stab without zoom');
 await page.keyboard.press('KeyQ');await wait(page,d=>d.weapon==='pistol','Q returns to previous weapon');
 await page.keyboard.press('Digit1');await wait(page,d=>d.weapon==='rifle','Primary shortcut selects owned rifle');
 await page.mouse.click(680,450,{button:'right'});await wait(page,d=>d.fov<narrow+1,'Scope reopens');
 await page.keyboard.press('Escape');await wait(page,d=>d.phase==='paused'&&d.aim===0&&d.fov>73,'Pause releases aim');
 await context.close();
 const phone=await setup(true);const p=phone.page;
 await p.getByTestId('aim-button').tap();await wait(p,d=>d.aim===1&&d.fov<43,'Phone aim scopes rifle');
 await p.getByTestId('crouch-button').tap();await wait(p,d=>d.localPlayer.crouched,'Phone crouch toggles');
 await p.screenshot({path:resolve(artifacts,'phone-portrait-scope.png')});
 const identity=(await debug(p)).playerId;
 await p.setViewportSize({width:844,height:390});
 await wait(p,d=>d.playerId===identity&&d.aim===0&&!d.localPlayer.crouched&&d.fov>73,'Rotation clears held controls without changing player');
 await p.getByTestId('aim-button').tap();await wait(p,d=>d.aim===1&&d.fov<43,'Landscape aim remains usable');
 const targets=await p.locator('.touch-controls button,.session-tools button,.weapon-loadout button').evaluateAll(buttons=>buttons.map(button=>{const r=button.getBoundingClientRect();return {name:button.getAttribute('aria-label'),x:r.x,y:r.y,w:r.width,h:r.height,vw:innerWidth,vh:innerHeight};}));
 for(const r of targets){assert.ok(r.w>=48&&r.h>=48,`${r.name} has 48px touch target`);assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=r.vw&&r.y+r.h<=r.vh,`${r.name} in viewport`);}
 for(let i=0;i<targets.length;i++)for(let j=i+1;j<targets.length;j++){const a=targets[i],b=targets[j];assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y,`${a.name}/${b.name} do not overlap`);}
 await p.screenshot({path:resolve(artifacts,'phone-landscape-scope.png')});
 await phone.context.close();assert.deepEqual(errors,[]);console.log('PASS: right-click scopes, independent mouse buttons, reload/reset, crouch/walk, handgun sights, knife stab, quick-switch, phone aim and rotation.');
}finally{await browser.close();}
