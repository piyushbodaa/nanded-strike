import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Weapon } from './simulation';

export interface WeaponPose {
  weapon: Weapon; time: number; shotAt: number; reloadUntil: number;
  reloadDuration: number; speed: number; sprint: boolean; alive: boolean;
}
const ease=(x:number)=>{const t=THREE.MathUtils.clamp(x,0,1);return t*t*(3-2*t);};

/** Original articulated view model. Reload, slide, magazine and support hand animate separately. */
export function createWeaponView(camera:THREE.Camera) {
  const group=new THREE.Group(),rifle=new THREE.Group(),pistol=new THREE.Group();
  group.name='First-person weapon';group.add(rifle,pistol);camera.add(group);
  const materials:THREE.Material[]=[],geometries:THREE.BufferGeometry[]=[];
  const material=(color:string,roughness=.65,metalness=.12)=>{const m=new THREE.MeshStandardMaterial({color,roughness,metalness});materials.push(m);return m;};
  const receiver=material('#3c444a',.43,.42),steel=material('#222a30',.38,.5),polymer=material('#263139',.8,.05),rubber=material('#151e23',.95,0),sleeve=material('#425568',.9,0),glove=material('#666c58',.95,0),skin=material('#b79578',.85,0),marking=material('#9babb0',.55,.2);
  function add(parent:THREE.Object3D,g:THREE.BufferGeometry,m:THREE.Material,x=0,y=0,z=0) {geometries.push(g);const mesh=new THREE.Mesh(g,m);mesh.position.set(x,y,z);mesh.castShadow=false;mesh.receiveShadow=false;parent.add(mesh);return mesh;}
  function box(parent:THREE.Object3D,w:number,h:number,d:number,x:number,y:number,z:number,m:THREE.Material=receiver,radius=.009) {return add(parent,new RoundedBoxGeometry(w,h,d,1,Math.min(radius,w/4,h/4,d/4)),m,x,y,z);}
  function tube(parent:THREE.Object3D,r:number,length:number,x:number,y:number,z:number,m=steel,axis:'z'|'y'='z') {const mesh=add(parent,new THREE.CylinderGeometry(r,r,length,12),m,x,y,z);if(axis==='z')mesh.rotation.x=Math.PI/2;return mesh;}
  // Receiver, barrel, handguard, stock, trigger guard, sights and a removable magazine.
  box(rifle,.105,.115,.39,0,0,-.12,receiver);box(rifle,.11,.075,.28,0,.067,-.12,polymer);
  box(rifle,.098,.13,.30,0,-.007,-.46,polymer);tube(rifle,.021,.39,0,.025,-.76);tube(rifle,.033,.075,0,.025,-.99);
  tube(rifle,.035,.24,0,.018,.20,polymer);box(rifle,.093,.15,.19,0,-.026,.32,polymer);box(rifle,.115,.185,.035,0,-.045,.42,rubber);
  const grip=box(rifle,.082,.18,.105,0,-.137,.003,polymer);grip.rotation.x=-.23;
  box(rifle,.018,.085,.14,-.051,-.089,-.09,steel);box(rifle,.018,.085,.14,.051,-.089,-.09,steel);box(rifle,.10,.017,.14,0,-.13,-.09,steel);
  const trigger=box(rifle,.013,.055,.018,0,-.085,-.07,steel);trigger.rotation.x=-.3;
  const rifleMagazine=new THREE.Group();rifleMagazine.position.set(0,-.15,-.18);rifle.add(rifleMagazine);
  box(rifleMagazine,.073,.235,.12,0,-.06,0,steel);box(rifleMagazine,.08,.023,.13,0,-.18,0,polymer);
  for(let n=0;n<3;n++)box(rifleMagazine,.077,.008,.112,0,-.03-n*.055,0,receiver,.002);
  const bolt=box(rifle,.018,.032,.105,.058,.012,-.08,steel);
  for(let n=0;n<10;n++)box(rifle,.12,.012,.014,0,.113,-.27+n*.027,steel,.003);
  for(let n=0;n<5;n++){box(rifle,.105,.012,.024,0,.072,-.58+n*.052,steel,.002);box(rifle,.012,.03,.025,.052,.012,-.57+n*.05,steel,.003);}
  box(rifle,.065,.10,.025,0,.12,-.79,steel);box(rifle,.032,.018,.065,0,.171,-.79,steel);
  box(rifle,.08,.065,.055,0,.14,.01,steel);box(rifle,.035,.035,.058,0,.169,.01,rubber);
  for(let n=0;n<3;n++)box(rifle,.002,.01,.029,.054,-.008+n*.016,-.12,marking,.001);
  // A separate compact sidearm, with moving slide and removable magazine.
  const slide=new THREE.Group();pistol.add(slide);
  box(slide,.09,.09,.29,0,.035,-.15,receiver);box(slide,.065,.02,.25,0,.088,-.15,steel);tube(slide,.019,.075,0,.038,-.316);
  box(pistol,.087,.07,.22,0,-.027,-.12,polymer);const pistolGrip=box(pistol,.08,.18,.102,0,-.12,-.015,polymer);pistolGrip.rotation.x=-.24;
  box(pistol,.015,.09,.12,-.045,-.075,-.14,steel);box(pistol,.015,.09,.12,.045,-.075,-.14,steel);box(pistol,.08,.016,.12,0,-.116,-.14,steel);
  box(slide,.017,.023,.023,0,.095,-.275,steel);box(slide,.058,.024,.022,0,.095,-.028,steel);
  const pistolMagazine=box(pistol,.074,.15,.076,0,-.17,-.025,steel);
  for(let n=0;n<6;n++)box(slide,.094,.065,.006,0,.035,-.06+n*.009,polymer,.001);
  function arm(side:number) {
    const root=new THREE.Group();group.add(root);
    const upper=add(root,new THREE.CylinderGeometry(.058,.071,1,10),sleeve);
    const forearm=add(root,new THREE.CylinderGeometry(.041,.059,1,10),sleeve);
    const wrist=tube(root,.042,.07,0,0,0,skin,'y');
    const hand=new THREE.Group();root.add(hand);box(hand,.088,.085,.12,0,0,0,glove,.02);
    for(let n=0;n<4;n++)box(hand,.016,.057,.024,-.03+n*.019,-.035,-.052,glove,.007);
    const thumb=box(hand,.023,.065,.035,side*.044,-.005,.01,glove,.01);thumb.rotation.z=side*.45;
    const bone=(mesh:THREE.Mesh,a:THREE.Vector3,b:THREE.Vector3)=>{const direction=b.clone().sub(a);mesh.position.copy(a).addScaledVector(direction,.5);mesh.scale.y=direction.length();mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());};
    return {pose(target:THREE.Vector3){const shoulder=new THREE.Vector3(side*.23,-.39,.37),elbow=new THREE.Vector3(side*.20,-.28,.12);bone(upper,shoulder,elbow);bone(forearm,elbow,target);wrist.position.copy(target).add(new THREE.Vector3(0,.005,.045));wrist.rotation.x=Math.PI/2;hand.position.copy(target);hand.rotation.set(-.1,side*.12,side*.08);}};
  }
  const left=arm(-1),right=arm(1);
  const flashMaterial=new THREE.MeshBasicMaterial({color:'#ffd690',transparent:true,opacity:.9,depthWrite:false});materials.push(flashMaterial);
  const muzzle=add(group,new THREE.ConeGeometry(.047,.17,7),flashMaterial,0,.025,-1.05);muzzle.rotation.x=-Math.PI/2;muzzle.visible=false;
  const fill=new THREE.PointLight('#eef4ff',.65,3,1);fill.position.set(-.2,.45,.25);group.add(fill);
  let cycle=0,current:Weapon='rifle',swap=1,lastReload=false;
  function update(pose:WeaponPose,dt:number) {
    group.visible=pose.alive;
    if(!pose.alive)return;
    if(current!==pose.weapon){current=pose.weapon;swap=0;}
    swap=Math.min(1,swap+dt*5.5);rifle.visible=current==='rifle';pistol.visible=current==='pistol';
    const shotAge=Math.max(0,pose.time-pose.shotAt)/1000;
    const recoil=pose.shotAt>0?Math.exp(-shotAge*25)*Math.sin(Math.min(1,shotAge*35)*Math.PI*.65):0;
    const reloading=pose.reloadUntil>pose.time;
    const progress=reloading?THREE.MathUtils.clamp(1-(pose.reloadUntil-pose.time)/pose.reloadDuration,0,1):0;
    const reloadLift=reloading?ease(progress/.15)*(1-ease((progress-.83)/.17)):0;
    const magOut=reloading?ease((progress-.12)/.15)*(1-ease((progress-.55)/.18)):0;
    const boltPull=reloading?Math.sin(ease((progress-.76)/.14)*Math.PI)*.05:0;
    cycle+=dt*(pose.speed>0.1?Math.min(12,pose.speed*2.1):1.3);
    const moveWeight=THREE.MathUtils.clamp(pose.speed/5,0,1),bob=Math.sin(cycle)*.005*moveWeight;
    group.position.set(current==='rifle'?.24:.20,-.245+Math.abs(Math.cos(cycle))*.005*moveWeight-.25*(1-ease(swap))-.065*reloadLift,-.72+recoil*.05);
    group.rotation.set(recoil*.045+(pose.sprint?.22:0)-reloadLift*.12,.005+reloadLift*.22,-reloadLift*.33+bob);
    rifleMagazine.position.set(-magOut*.06,-.15-magOut*.31,-.18+magOut*.12);rifleMagazine.rotation.z=-magOut*.18;
    pistolMagazine.position.y=-.17-magOut*.25;bolt.position.z=-.08+boltPull;slide.position.z=recoil*.028;
    left.pose(new THREE.Vector3(current==='rifle'?-.025:-.035,-.09-magOut*.29,current==='rifle'?-.46+magOut*.34:-.07));
    right.pose(new THREE.Vector3(.012,-.13,current==='rifle'?.025:.015));
    muzzle.position.z=current==='rifle'?-1.05:-.37;muzzle.visible=pose.shotAt>0&&shotAge<.042&&!reloading;muzzle.rotation.z=pose.shotAt%7;
    if(lastReload&&!reloading){rifleMagazine.rotation.z=0;pistolMagazine.position.y=-.17;}lastReload=reloading;
  }
  return {group,muzzle,update,dispose(){camera.remove(group);for(const geometry of geometries)geometry.dispose();for(const m of materials)m.dispose();}};
}
