import assert from 'node:assert/strict';
import test from 'node:test';
import {requestDisplayMode,toggleDisplayFullscreen,viewportOrientation,type DisplayPlatform} from '../lib/display-mode';

test('mobile orientation lock waits for fullscreen and selects the requested mode',async()=>{
  const calls:string[]=[];let full=false;
  const platform:DisplayPlatform={isFullscreen:()=>full,requestFullscreen:async()=>{calls.push('fullscreen');full=true;},orientation:{lock:async mode=>{assert.equal(full,true);calls.push(mode);}}};
  assert.equal((await requestDisplayMode('landscape',platform)).locked,true);
  assert.deepEqual(calls,['fullscreen','landscape']);
  assert.equal((await requestDisplayMode('portrait',platform)).locked,true);
  assert.deepEqual(calls,['fullscreen','landscape','portrait']);
});

test('unsupported orientation uses an honest physical-rotation fallback without entering fullscreen',async()=>{
  let fullscreenCalls=0;
  const result=await requestDisplayMode('portrait',{isFullscreen:()=>false,requestFullscreen:async()=>{fullscreenCalls++;}});
  assert.equal(result.locked,false);assert.match(result.message,/cannot rotate/);assert.match(result.message,/upright/);assert.match(result.message,/iPhone/);
  assert.equal(fullscreenCalls,0);
});

test('fullscreen rejection does not attempt lock and releases a previous orientation',async()=>{
  let locks=0,unlocks=0;
  const result=await requestDisplayMode('landscape',{isFullscreen:()=>false,requestFullscreen:async()=>{throw Error('Denied');},orientation:{lock:async()=>{locks++;},unlock:()=>{unlocks++;}}});
  assert.equal(result.locked,false);assert.match(result.message,/not allowed/);assert.equal(locks,0);assert.equal(unlocks,1);
});

test('lock rejection releases previous lock and provides a rotate-phone instruction',async()=>{
  let unlocks=0;
  const result=await requestDisplayMode('landscape',{isFullscreen:()=>true,orientation:{lock:async()=>{throw Error('NotSupportedError');},unlock:()=>{unlocks++;}}});
  assert.equal(result.locked,false);assert.match(result.message,/sideways/);assert.equal(unlocks,1);
});

test('installed web app can lock without a fullscreen method; auto releases it',async()=>{
  let locked='',unlocks=0;
  const platform:DisplayPlatform={isFullscreen:()=>false,orientation:{lock:async mode=>{locked=mode;},unlock:()=>{unlocks++;}}};
  assert.equal((await requestDisplayMode('portrait',platform)).locked,true);assert.equal(locked,'portrait');
  assert.equal((await requestDisplayMode('auto',platform)).locked,false);assert.equal(unlocks,1);
});

test('fullscreen exit and rejection are handled without uncaught promises',async()=>{
  let exits=0;
  assert.match(await toggleDisplayFullscreen({isFullscreen:()=>true,exitFullscreen:async()=>{exits++;}}),/off/);assert.equal(exits,1);
  assert.match(await toggleDisplayFullscreen({isFullscreen:()=>false}),/unavailable/);
  assert.match(await toggleDisplayFullscreen({isFullscreen:()=>false,requestFullscreen:async()=>{throw Error('Denied');}}),/not allowed/);
});

test('actual layout follows viewport resizing rather than a requested orientation',()=>{
  assert.equal(viewportOrientation(390,844),'portrait');
  assert.equal(viewportOrientation(844,390),'landscape');
  assert.equal(viewportOrientation(430,720),'portrait');
});
