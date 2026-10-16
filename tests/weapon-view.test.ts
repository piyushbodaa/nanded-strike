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
