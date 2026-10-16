import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWeaponView, type WeaponPose } from '../lib/weapon-view';

const pose:WeaponPose={weapon:'rifle',time:1000,shotAt:0,reloadUntil:0,reloadDuration:1800,speed:0,sprint:false,alive:true};
const near=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-6,`${actual} should equal ${expected}`);

test('aimed rifle optic stays on the camera axis while moving and blends from the hip',()=>{
  const camera=new THREE.PerspectiveCamera(75,1,.05,500),view=createWeaponView(camera);
  try {
    view.update({...pose,aim:.5},1);
    near(view.group.position.x,.12);
    view.update({...pose,aim:1,speed:4.8},1);
    camera.updateMatrixWorld(true);
    const optic=view.group.getObjectByName('AR30 optic');assert.ok(optic);
    for(const z of [-.12,.12]){
      const lens=optic.localToWorld(new THREE.Vector3(0,0,z));
      near(lens.x,0);near(lens.y,0);assert.ok(lens.z<0);
    }
  } finally {view.dispose();}
});

test('aimed pistol front bead centers between rear sights on the viewing axis',()=>{
  const camera=new THREE.PerspectiveCamera(75,1,.05,500),view=createWeaponView(camera);
  try {
    view.update({...pose,weapon:'pistol',aim:1,speed:4.8},1);
    camera.updateMatrixWorld(true);
    const point=(name:string)=>{const node=view.group.getObjectByName(name);assert.ok(node);return node.getWorldPosition(new THREE.Vector3());};
    const front=point('P12 front sight'),left=point('P12 rear sight left'),right=point('P12 rear sight right');
    near(front.x,0);near(front.y,0);near(left.y,0);near(right.y,0);
    near(left.x,-right.x);assert.ok(left.x<front.x&&front.x<right.x);
    assert.ok(front.z<left.z&&front.z<right.z);
    view.update({...pose,weapon:'pistol',aim:1,reloadUntil:2000},.016);
    near(view.group.position.x,.20);
    view.update({...pose,weapon:'pistol',aim:1,sprint:true},.016);
    near(view.group.position.x,.20);
  } finally {view.dispose();}
});

test('secondary knife attack thrusts forward distinctly from the primary slash',()=>{
  const camera=new THREE.PerspectiveCamera(75,1,.05,500),view=createWeaponView(camera);
  try {
    const attack={...pose,weapon:'knife' as const,time:1260,shotAt:1000,aim:1};
    view.update({...attack,secondary:false},1);
    const slash=view.group.position.clone(),slashRotation=view.group.rotation.z;
    view.update({...attack,secondary:true},1);
    assert.ok(view.group.position.z<slash.z-.3,'stab reaches forward rather than sweeping sideways');
    assert.ok(Math.abs(view.group.rotation.z)<Math.abs(slashRotation)*.1,'stab does not use the slash roll');
    assert.equal(view.muzzle.visible,false);
  } finally {view.dispose();}
});

test('all six weapon selections have distinct visible models and primary proportions',()=>{
  const camera=new THREE.PerspectiveCamera(75,1,.05,500),view=createWeaponView(camera);
  try {
    const names={rifle:'AR30 rifle',pistol:'P12 handgun',knife:'Combat knife',smg:'SM30 submachine gun',sniper:'SR5 sniper',shotgun:'SG8 pump shotgun'};
    const depths:Partial<Record<WeaponPose['weapon'],number>>={};
    for(const weapon of Object.keys(names) as WeaponPose['weapon'][]){
      view.update({...pose,weapon},1);
      const visible=Object.values(names).filter(name=>view.group.getObjectByName(name)?.visible);
      assert.deepEqual(visible,[names[weapon]]);
      depths[weapon]=new THREE.Box3().setFromObject(view.group.getObjectByName(names[weapon])!).getSize(new THREE.Vector3()).z;
    }
    assert.ok(depths.sniper!>depths.rifle!+.2);
    assert.ok(depths.rifle!>depths.smg!+.2);
  } finally {view.dispose();}
});

test('first appearance and a new match draw the weapon smoothly without queuing rapid selections',()=>{
  const camera=new THREE.PerspectiveCamera(75,1,.05,500),view=createWeaponView(camera);
  try {
    view.update(pose,0);const lowered=view.group.position.y;
    assert.ok(lowered<-.45);assert.ok(Math.abs(view.group.rotation.z)>.1);
    view.update({...pose,time:1140},.14);assert.ok(view.group.position.y>lowered&&view.group.position.y<-.245);
    view.update({...pose,time:1300},.16);near(view.group.position.y,-.245);near(view.group.rotation.z,0);
    view.resetDraw();view.update({...pose,time:2000},0);near(view.group.position.y,lowered);
    view.update({...pose,weapon:'pistol'},.016);
    assert.equal(view.group.getObjectByName('P12 handgun')?.visible,true);
    view.update({...pose,weapon:'sniper'},.016);
    assert.equal(view.group.getObjectByName('SR5 sniper')?.visible,true);
    assert.equal(view.group.getObjectByName('P12 handgun')?.visible,false);
    view.update({...pose,weapon:'knife'},.016);
    assert.equal(view.group.getObjectByName('Combat knife')?.visible,true);
    assert.equal(view.group.getObjectByName('SR5 sniper')?.visible,false);
  } finally {view.dispose();}
});

test('aiming immediately interrupts a draw and keeps both scoped weapons on the camera axis',()=>{
  const camera=new THREE.PerspectiveCamera(75,1,.05,500),view=createWeaponView(camera);
  try {
    for(const weapon of ['rifle','sniper'] as const){
      view.resetDraw();view.update({...pose,weapon},.016);
      assert.ok(view.group.position.y<-.4);
      view.update({...pose,weapon,aim:1},0);camera.updateMatrixWorld(true);
      const optic=view.group.getObjectByName(weapon==='rifle'?'AR30 optic':'SR5 optic');assert.ok(optic);
      for(const z of [-.12,.12]){
        const lens=optic.localToWorld(new THREE.Vector3(0,0,z));near(lens.x,0);near(lens.y,0);
      }
    }
  } finally {view.dispose();}
});

test('reduced motion removes draw and movement sway but keeps shot and reload feedback',()=>{
  const camera=new THREE.PerspectiveCamera(75,1,.05,500),view=createWeaponView(camera);
  try {
    const still={...pose,reducedMotion:true,speed:4.8};
    view.update(still,.016);const position=view.group.position.clone(),rotation=view.group.rotation.clone();
    view.update({...still,time:1500},.5);
    assert.deepEqual(view.group.position.toArray(),position.toArray());assert.deepEqual(view.group.rotation.toArray(),rotation.toArray());
    near(view.group.position.y,-.245);
    const firing={...still,time:2020,shotAt:2000},before={...firing};
    view.resetDraw();view.update(firing,.016);
    assert.equal(view.muzzle.visible,true);assert.ok(view.group.position.z>-.72,'recoil remains visible');
    assert.deepEqual(firing,before,'presentation cannot alter attack timers');
    view.update({...still,time:3000,reloadUntil:4000},.016);
    assert.equal(view.muzzle.visible,false);
    const magazine=view.group.getObjectByName('AR30 magazine');assert.ok(magazine);
    assert.ok(magazine.position.y<-.35,'reload magazine movement remains visible');
    view.update({...still,time:4000,reloadUntil:4000},.016);near(magazine.position.y,-.15);
  } finally {view.dispose();}
});

test('firing during a normal draw presents the shot immediately at the ready position',()=>{
  const camera=new THREE.PerspectiveCamera(75,1,.05,500),view=createWeaponView(camera);
  try {
    view.update(pose,.016);assert.ok(view.group.position.y<-.4);
    view.update({...pose,time:1020,shotAt:1000},.004);
    near(view.group.position.y,-.245);assert.equal(view.muzzle.visible,true);
    view.update({...pose,time:1500,shotAt:1000},.016);near(view.group.position.y,-.245);
  } finally {view.dispose();}
});
