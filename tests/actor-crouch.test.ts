import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { loadActorAsset, createActor, updateActor, disposeActor, type ActorPose } from '../lib/actors';

test('crouched character lowers its head while articulated legs keep feet on the ground',async()=>{
  const hadProgressEvent=typeof globalThis.ProgressEvent!=='undefined';
  if(!hadProgressEvent)Object.defineProperty(globalThis,'ProgressEvent',{configurable:true,value:class extends Event {
    constructor(type:string,options:ProgressEventInit={}){super(type);Object.assign(this,options);}
  }});
  const source=await readFile(new URL('../public/assets/characters/swat.glb',import.meta.url));
  THREE.DefaultLoadingManager.setURLModifier(url=>url.endsWith('/swat.glb')?`data:model/gltf-binary;base64,${source.toString('base64')}`:url);
  try {await loadActorAsset();} finally {
    THREE.DefaultLoadingManager.setURLModifier(url=>url);
    if(!hadProgressEvent)Reflect.deleteProperty(globalThis,'ProgressEvent');
  }
  const actor=createActor('blue');
  const pose:ActorPose={x:0,y:0,z:0,yaw:0,pitch:0,speed:0,shooting:false,dead:false,weapon:'rifle'};
  const animate=(crouched:boolean)=>{for(let n=0;n<20;n++)updateActor(actor,{...pose,crouched},1/60);actor.group.updateMatrixWorld(true);};
  try {
    animate(false);
    const standingHead=actor.head.getWorldPosition(new THREE.Vector3());
    const feet=actor.legs.map(leg=>leg.foot.getWorldPosition(new THREE.Vector3()));
    animate(true);
    const crouchedHead=actor.head.getWorldPosition(new THREE.Vector3());
    assert.ok(standingHead.y-crouchedHead.y>.51&&standingHead.y-crouchedHead.y<.59);
    actor.legs.forEach((leg,index)=>{
      const foot=leg.foot.getWorldPosition(new THREE.Vector3()),ankle=leg.chain[2].getWorldPosition(new THREE.Vector3());
      assert.ok(foot.distanceTo(feet[index])<.04,'crouching does not move the planted foot');
      assert.ok(ankle.distanceTo(foot)<.02,'bent leg reaches the planted foot');
    });
    animate(false);
    assert.ok(Math.abs(actor.head.getWorldPosition(new THREE.Vector3()).y-standingHead.y)<.04);
  } finally {disposeActor(actor);}
});
