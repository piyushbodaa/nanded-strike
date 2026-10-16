import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';

const baseURL=process.env.TEST_URL||process.env.BASE_URL||'http://127.0.0.1:5173';
const artifacts=resolve(process.env.TEST_ARTIFACTS||'test-results/bots');
await mkdir(artifacts,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:process.env.HEADED!=='1',args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const context=await browser.newContext({baseURL,viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
const page=await context.newPage();page.setDefaultTimeout(30_000);
const errors=[],requests=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>{if(new URL(request.url()).pathname==='/api/game')requests.push(request.method());});
const debug=()=>page.evaluate(()=>window.__NANDED_DEBUG__);
const wait=async(predicate,message,timeout=30_000)=>expect.poll(async()=>{const state=await debug();return !!state&&predicate(state);},{message,timeout,intervals:[150,300,500]}).toBe(true);
const tap=id=>page.getByTestId(id).tap();
const shot=name=>page.screenshot({path:resolve(artifacts,`${name}.png`),fullPage:true});
async function leave(){
  if(!(await page.getByTestId('pause-menu').isVisible()))await page.getByRole('button',{name:'Pause game',exact:true}).tap();
  await tap('leave-game');await expect(page.getByTestId('lobby')).toBeVisible();
}
async function checkButtons(ids){
  for(const id of ids){const bounds=await page.getByTestId(id).boundingBox();assert.ok(bounds&&bounds.width>=48&&bounds.height>=48,`${id} is an easy 48px target`);}
}
try{
  await page.goto('/',{waitUntil:'domcontentloaded',timeout:60_000});
  await expect(page.getByTestId('play-bots')).toBeEnabled({timeout:90_000});
  await page.locator('#lobby-name').fill('Bot browser');
  await tap('open-settings');await page.getByRole('button',{name:/PERFORMANCE/}).tap();await tap('close-settings');
  await checkButtons(['play-bots','play-online','explore-map','bot-team-blue','bot-team-orange','bot-team-spectator']);
  await shot('portrait-mode-selection');
  await tap('play-bots');
  await wait(s=>s.botMatch&&!s.watching&&s.phase==='playing'&&s.players.length===8,'One click starts a 4v4 bot match');
  let state=await debug();
  assert.equal(state.players.filter(p=>p.bot).length,7);assert.equal(state.players.find(p=>p.id===state.playerId).team,'blue');
  for(const team of ['blue','orange'])assert.equal(state.players.filter(p=>p.team===team).length,4);
  await tap('open-buy');await tap('buy-kit');
  await wait(s=>s.localPlayer.defuseKit&&s.localPlayer.money===400,'Buying equipment works in local bot match');
  await tap('close-buy');
  await page.getByRole('button',{name:'Pause game',exact:true}).tap();
  await wait(s=>s.phase==='paused','Local bot match pauses');
  const paused=await debug();
  await page.keyboard.press('KeyB');
  assert.equal((await debug()).buyOpen,false,'Buy shortcut cannot resume a paused game behind a menu');
  await page.waitForTimeout(1200);
  state=await debug();assert.deepEqual(state.players,paused.players,'Bots cannot move or shoot while paused');
  assert.equal(state.classic.phaseEndsAt,paused.classic.phaseEndsAt);
  await tap('resume-game');
  await wait(s=>s.phase==='playing'&&s.classic.phaseEndsAt>=paused.classic.phaseEndsAt+1100,'Resume preserves remaining buy/objective time');
  await shot('portrait-playing-with-bots');
  await leave();

  await tap('bot-team-orange');await tap('mode-deathmatch');await tap('play-bots');
  await wait(s=>s.botMatch&&s.gameMode==='deathmatch'&&!s.watching,'Terrorist Deathmatch starts');
  state=await debug();assert.equal(state.players.find(p=>p.id===state.playerId).team,'orange');
  assert.ok(state.localPlayer.inventory.includes('rifle'));
  await leave();

  await page.setViewportSize({width:844,height:390});
  await tap('mode-classic');await tap('bot-team-spectator');await tap('play-bots');
  await wait(s=>s.watching&&s.botMatch&&s.players.length===8,'Watch Bots starts eight AI players');
  state=await debug();assert.equal(state.playerId,'');assert.ok(state.players.every(p=>p.bot));
  await expect(page.getByTestId('fire-button')).toHaveCount(0);await expect(page.getByTestId('open-buy')).toHaveCount(0);
  const initial=state,watching=state.spectatingId;
  await page.getByRole('button',{name:/NEXT BOT/i}).tap();
  await wait(s=>s.spectatingId&&s.spectatingId!==watching,'Next Bot changes the followed camera');
  await page.setViewportSize({width:390,height:844});
  await wait(s=>s.watching&&s.phase==='playing'&&s.players.length===8,'Portrait switch preserves the bot match');
  await page.setViewportSize({width:844,height:390});
  const seen=new Set(),moved=new Set();let totalKills=0;
  await expect.poll(async()=>{
    const current=await debug();
    for(const event of current.events??[])seen.add(event.type);
    for(const p of current.players){const origin=initial.players.find(q=>q.id===p.id);if(origin&&Math.hypot(p.x-origin.x,p.z-origin.z)>8)moved.add(p.team);}
    totalKills=Math.max(totalKills,current.players.reduce((sum,p)=>sum+p.kills,0));
    return current.round>initial.round||current.scores.blue+current.scores.orange>0;
  },{message:'Both bot teams autonomously move, fight, and finish a real Classic round',timeout:210_000,intervals:[1000]}).toBe(true);
  assert.deepEqual([...moved].sort(),['blue','orange']);assert.ok(seen.has('shot'),'AI fires actual weapons');assert.ok(totalKills>0,'AI combat produces a kill');
  await shot('watch-bots-round-result');
  await wait(s=>s.round>initial.round,'Bot teams automatically start the next round');
  console.log(JSON.stringify({result:'PASS',teams:'4 CT vs 4 T',join:'CT and T',watch:true,movement:[...moved],events:[...seen],kills:totalKills,round:(await debug()).round,artifacts}));
  assert.deepEqual(errors,[]);assert.equal(requests.length,0,'Local bot play never creates or mutates an online room');
}catch(error){await shot('failure').catch(()=>{});const state=await debug().catch(()=>null);console.error(JSON.stringify({errors,state}));throw error;}
finally{await context.close();await browser.close();}
