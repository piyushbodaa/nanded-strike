import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';

const baseURL=process.env.TEST_URL||process.env.BASE_URL||'http://127.0.0.1:5173';
const artifacts=resolve(process.env.TEST_ARTIFACTS||'test-results/animations');
await mkdir(artifacts,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:process.env.HEADED!=='1',args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const errors=[];
try{
  for(const reduced of [false,true]){
    const context=await browser.newContext({baseURL,viewport:reduced?{width:390,height:844}:{width:1440,height:900},hasTouch:reduced,isMobile:reduced,deviceScaleFactor:1,reducedMotion:reduced?'reduce':'no-preference'});
    const page=await context.newPage();page.setDefaultTimeout(30_000);
    page.on('pageerror',error=>errors.push(error.message));
    let releaseAsset,modelRequested=false;
    const gate=new Promise(resolve=>{releaseAsset=resolve;});
    await page.route('**/assets/characters/swat.glb',async route=>{modelRequested=true;await gate;await route.continue().catch(()=>{});});
    try{
      await page.goto('/',{waitUntil:'domcontentloaded',timeout:60_000});
      await expect.poll(()=>modelRequested,{timeout:30_000}).toBe(true);
      const startup=page.getByTestId('startup-loading');
      await expect(startup).toBeVisible();await expect(page.getByTestId('startup-phase')).not.toBeEmpty();
      await expect(page.getByTestId('play-bots')).toBeDisabled();
      const running=await startup.evaluate(element=>element.getAnimations({subtree:true}).filter(animation=>animation.playState==='running').length);
      if(reduced)assert.equal(running,0,'Reduced-motion startup has no decorative animations');
      else assert.ok(running>0,'Startup really animates while actual assets load');
      const target=await page.getByTestId('skip-startup').boundingBox();assert.ok(target&&target.width>=48&&target.height>=48);
      await page.screenshot({path:resolve(artifacts,reduced?'startup-reduced-phone.png':'startup-desktop.png')});
      if(reduced){
        await page.setViewportSize({width:844,height:390});
        const landscapeSkip=await page.getByTestId('skip-startup').boundingBox();
        assert.ok(landscapeSkip&&landscapeSkip.x>=0&&landscapeSkip.y>=0&&landscapeSkip.x+landscapeSkip.width<=844&&landscapeSkip.y+landscapeSkip.height<=390,'Startup skip stays accessible in phone landscape');
        await page.screenshot({path:resolve(artifacts,'startup-reduced-landscape.png')});
        await page.setViewportSize({width:390,height:844});
      }
      if(!reduced){
        await page.getByTestId('skip-startup').click();await expect(startup).toBeHidden();
        await expect(page.getByTestId('play-bots')).toBeDisabled();
        await page.locator('#lobby-name').fill('Loading player');
        await page.getByTestId('open-settings').click();await page.getByRole('button',{name:/PERFORMANCE/}).click();await page.getByTestId('close-settings').click();
      }
      releaseAsset();await expect(page.getByTestId('play-bots')).toBeEnabled({timeout:90_000});
      await expect(startup).toBeHidden();
      if(!reduced){
        await expect(page.locator('#lobby-name')).toHaveValue('Loading player');
        await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('nanded-settings-v2')).quality)).toBe('low');
      }
      await page.getByTestId('open-settings').click();await page.getByRole('button',{name:/PERFORMANCE/}).click();await page.getByTestId('close-settings').click();
      await page.getByTestId('bot-team-spectator').click();
      await page.evaluate(()=>{
        window.__briefingFrames=[];
        document.addEventListener('animationstart',event=>{
          if(event.animationName!=='match-briefing')return;
          const element=event.target;
          const started=performance.now();
          const sample=()=>{const style=getComputedStyle(element);window.__briefingFrames.push({visibility:style.visibility,opacity:Number(style.opacity),pointerEvents:style.pointerEvents,phase:element.dataset.phase});if(performance.now()-started<1500)requestAnimationFrame(sample);};
          sample();
        });
      });
      await page.getByTestId('play-bots').click();
      const briefing=page.getByTestId('match-entry');
      if(reduced)await expect(briefing).toBeHidden();
      else{
        await expect.poll(()=>page.evaluate(()=>window.__briefingFrames.some(frame=>frame.visibility==='visible'&&frame.opacity>0))).toBe(true);
        assert.equal(await briefing.evaluate(element=>getComputedStyle(element).pointerEvents),'none','Entry never intercepts input');
        const watched=await page.evaluate(()=>window.__NANDED_DEBUG__.spectatingId);
        await page.getByTestId('next-bot').click();
        await expect.poll(()=>page.evaluate(()=>window.__NANDED_DEBUG__.spectatingId)).not.toBe(watched);
        await expect(briefing).toBeHidden({timeout:5000});
      }
      await expect(page.getByTestId('bot-difficulty-status')).toHaveText('BEGINNER');
      await page.getByRole('button',{name:'Pause game',exact:true}).click();
      await page.getByTestId('leave-game').click();await expect(page.getByTestId('lobby')).toBeVisible();
      await page.screenshot({path:resolve(artifacts,reduced?'menu-reduced-phone.png':'menu-desktop.png')});
    }finally{releaseAsset();await context.close();}
  }
  assert.deepEqual(errors,[]);
  console.log(`PASS actual-asset loading animation, skip without fake readiness, nonblocking match entry, reduced-motion desktop/phone and default Beginner. Screenshots: ${artifacts}`);
}finally{await browser.close();}
