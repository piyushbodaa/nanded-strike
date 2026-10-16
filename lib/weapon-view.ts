import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Weapon } from './simulation';

export interface WeaponPose {
  weapon: Weapon; time: number; shotAt: number; reloadUntil: number;
  reloadDuration: number; speed: number; sprint: boolean; alive: boolean;
  /** Smoothed aim transition supplied by the camera controller, from hip fire to sights. */
  aim?: number;
  /** The last knife attack was a secondary forward stab rather than a primary slash. */
  secondary?: boolean;
  /** Override the system preference when testing or supplying an in-game preference. */
  reducedMotion?: boolean;
}
const ease=(x:number)=>{const t=THREE.MathUtils.clamp(x,0,1);return t*t*(3-2*t);};

/** Original articulated view model. Reload, slide, magazine and support hand animate separately. */
export function createWeaponView(camera:THREE.Camera) {
  const motionPreference=typeof window!=='undefined'&&typeof window.matchMedia==='function'?window.matchMedia('(prefers-reduced-motion: reduce)'):null;
  const group=new THREE.Group(),rifle=new THREE.Group(),pistol=new THREE.Group(),knife=new THREE.Group();
  group.name='First-person weapon';rifle.name='AR30 rifle';pistol.name='P12 handgun';knife.name='Combat knife';group.add(rifle,pistol,knife);camera.add(group);
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
  const rifleMagazine=new THREE.Group();rifleMagazine.name='AR30 magazine';rifleMagazine.position.set(0,-.15,-.18);rifle.add(rifleMagazine);
  box(rifleMagazine,.073,.235,.12,0,-.06,0,steel);box(rifleMagazine,.08,.023,.13,0,-.18,0,polymer);
  for(let n=0;n<3;n++)box(rifleMagazine,.077,.008,.112,0,-.03-n*.055,0,receiver,.002);
  const bolt=box(rifle,.018,.032,.105,.058,.012,-.08,steel);
  for(let n=0;n<10;n++)box(rifle,.12,.012,.014,0,.113,-.27+n*.027,steel,.003);
  for(let n=0;n<5;n++){box(rifle,.105,.012,.024,0,.072,-.58+n*.052,steel,.002);box(rifle,.012,.03,.025,.052,.012,-.57+n*.05,steel,.003);}
  box(rifle,.065,.10,.025,0,.12,-.79,steel);box(rifle,.032,.018,.065,0,.171,-.79,steel);
  box(rifle,.08,.065,.055,0,.14,.01,steel);box(rifle,.035,.035,.058,0,.169,.01,rubber);
  for(let n=0;n<3;n++)box(rifle,.002,.01,.029,.054,-.008+n*.016,-.12,marking,.001);
  // An original compact optic makes the rifle's zoom capability visible before aiming.
  // The bore runs along local -Z at Y=.214; the aimed pose brings that line onto the camera.
  const optic=new THREE.Group();optic.name='AR30 optic';optic.position.set(0,.214,-.13);rifle.add(optic);
  for(const z of [-.20,-.04]){
    box(rifle,.081,.023,.051,0,.126,z,steel,.004);
    box(rifle,.038,.054,.037,0,.157,z,receiver,.004);
  }
  const opticTube=add(optic,new THREE.CylinderGeometry(.048,.048,.24,20,1,true),steel);
  opticTube.rotation.x=Math.PI/2;
  for(const z of [-.126,.126])add(optic,new THREE.TorusGeometry(.047,.009,8,20),receiver,0,0,z);
  for(const z of [-.084,.058])add(optic,new THREE.TorusGeometry(.049,.003,5,20),rubber,0,0,z);
  tube(optic,.019,.026,0,.055,-.015,receiver,'y');
  const windage=tube(optic,.016,.022,.054,0,-.015,receiver,'y');windage.rotation.z=Math.PI/2;
  const opticGlass=new THREE.MeshStandardMaterial({color:'#74c7bb',emissive:'#24443d',emissiveIntensity:.25,transparent:true,opacity:.17,roughness:.12,metalness:.12,depthWrite:false,side:THREE.DoubleSide});materials.push(opticGlass);
  add(optic,new THREE.CircleGeometry(.043,20),opticGlass,0,0,-.119);
  add(optic,new THREE.CircleGeometry(.043,20),opticGlass,0,0,.119);
  // A separate compact sidearm, with moving slide and removable magazine.
  const slide=new THREE.Group();pistol.add(slide);
  box(slide,.09,.09,.29,0,.035,-.15,receiver);box(slide,.065,.02,.25,0,.088,-.15,steel);tube(slide,.019,.075,0,.038,-.316);
  box(pistol,.087,.07,.22,0,-.027,-.12,polymer);const pistolGrip=box(pistol,.08,.18,.102,0,-.12,-.015,polymer);pistolGrip.rotation.x=-.24;
  box(pistol,.015,.09,.12,-.045,-.075,-.14,steel);box(pistol,.015,.09,.12,.045,-.075,-.14,steel);box(pistol,.08,.016,.12,0,-.116,-.14,steel);
  box(slide,.017,.023,.023,0,.095,-.275,steel);
  box(slide,.058,.008,.022,0,.087,-.028,steel);
  // Open rear notch and three visible beads; the front bead and rear notch share Y=.100.
  const sightPaint=material('#d9e6bb',.8,0);
  const frontSight=box(slide,.007,.007,.002,0,.100,-.262,sightPaint,.001);frontSight.name='P12 front sight';
  for(const side of [-1,1]){
    box(slide,.012,.024,.022,side*.023,.095,-.028,steel,.002);
    const rearSight=box(slide,.007,.007,.002,side*.023,.100,-.016,sightPaint,.001);rearSight.name=`P12 rear sight ${side===-1?'left':'right'}`;
  }
  const pistolMagazine=box(pistol,.074,.15,.076,0,-.17,-.025,steel);
  for(let n=0;n<6;n++)box(slide,.094,.065,.006,0,.035,-.06+n*.009,polymer,.001);
  // A broad tapered steel blade, crossguard and wrapped grip distinguish slot 3.
  const bladeMaterial=material('#c2ccd0',.27,.8);
  const bladeShape=new THREE.Shape();bladeShape.moveTo(-.039,0);bladeShape.lineTo(.039,0);bladeShape.lineTo(.029,.26);bladeShape.lineTo(0,.42);bladeShape.lineTo(-.033,.29);bladeShape.closePath();
  const blade=add(knife,new THREE.ExtrudeGeometry(bladeShape,{depth:.012,bevelEnabled:false}),bladeMaterial,0,.006,-.17);blade.rotation.x=-Math.PI/2;
  tube(knife,.032,.20,0,0,-.03,rubber);box(knife,.16,.025,.035,0,0,-.154,steel);box(knife,.068,.035,.025,0,0,.079,steel);
  for(let n=0;n<6;n++)tube(knife,.034,.007,0,0,-.11+n*.029,polymer);
  knife.rotation.set(-.12,0,-.23);
  // Original silhouettes for the buy menu's primary weapons. Shared rifle meshes
  // keep GPU resources modest; the SMG and pump shotgun use their own proportions.
  const sniper=rifle.clone(true);sniper.name='SR5 sniper';group.add(sniper);
  const sniperOptic=sniper.getObjectByName('AR30 optic')!;sniperOptic.name='SR5 optic';sniperOptic.scale.z=1.45;
  tube(sniper,.018,.42,0,.025,-1.1);tube(sniper,.028,.10,0,.025,-1.34);
  box(sniper,.10,.035,.20,0,.073,.31,rubber);box(sniper,.02,.028,.15,.085,.014,.04,steel);
  const sniperMagazine=sniper.getObjectByName('AR30 magazine')!;sniperMagazine.scale.y=.55;
  const smg=new THREE.Group();smg.name='SM30 submachine gun';group.add(smg);
  box(smg,.095,.12,.37,0,.005,-.15,receiver);box(smg,.088,.055,.22,0,.09,-.12,polymer);
  box(smg,.082,.085,.18,0,-.005,-.41,polymer);tube(smg,.018,.17,0,.02,-.57);tube(smg,.032,.12,0,.02,-.69,steel);
  box(smg,.044,.035,.25,0,.015,.16,steel);box(smg,.08,.15,.035,0,-.03,.30,rubber);
  const smgGrip=box(smg,.072,.16,.092,0,-.13,.01,polymer);smgGrip.rotation.x=-.18;
  const smgMagazine=new THREE.Group();smgMagazine.position.set(0,-.15,-.17);smg.add(smgMagazine);
  box(smgMagazine,.058,.25,.073,0,-.07,0,steel);box(smgMagazine,.066,.02,.082,0,-.19,0,polymer);
  for(const z of [-.47,.015]){box(smg,.06,.018,.025,0,.12,z,steel);box(smg,.012,.032,.022,0,.137,z,marking,.002);}
  const shotgun=new THREE.Group();shotgun.name='SG8 pump shotgun';group.add(shotgun);
  const wood=material('#64503b',.82,.02);
  box(shotgun,.095,.12,.32,0,-.005,-.10,receiver);tube(shotgun,.027,.78,0,.028,-.65);tube(shotgun,.021,.63,0,-.036,-.58);
  box(shotgun,.09,.12,.29,0,-.045,.22,wood);box(shotgun,.105,.17,.035,0,-.065,.38,rubber);
  const shotgunGrip=box(shotgun,.07,.12,.1,0,-.092,.025,wood);shotgunGrip.rotation.x=-.35;
  const pump=new THREE.Group();pump.position.set(0,-.025,-.48);shotgun.add(pump);
  box(pump,.10,.10,.24,0,0,0,wood);for(let n=0;n<7;n++)box(pump,.106,.104,.008,0,0,-.09+n*.03,polymer,.002);
  box(shotgun,.018,.026,.018,0,.063,-1.01,marking,.002);box(shotgun,.054,.01,.025,0,.068,.02,steel);for(const side of [-1,1])box(shotgun,.008,.016,.025,side*.024,.073,.02,steel,.002);
  const models:Record<Weapon,THREE.Group>={rifle,pistol,knife,smg,sniper,shotgun};
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
  let cycle=0,current:Weapon='rifle',drawProgress=1,lastReload=false,wasAlive=false;
  const drawDuration:Record<Weapon,number>={rifle:.28,pistol:.22,knife:.24,smg:.24,sniper:.32,shotgun:.28};
  function resetDraw(){drawProgress=0;wasAlive=false;}
  function update(pose:WeaponPose,dt:number) {
    group.visible=pose.alive;
    if(!pose.alive){wasAlive=false;return;}
    if(!wasAlive||current!==pose.weapon){current=pose.weapon;drawProgress=0;}wasAlive=true;
    const reducedMotion=pose.reducedMotion??motionPreference?.matches??false;
    drawProgress=Math.min(1,drawProgress+Math.max(0,dt)/drawDuration[current]);
    for(const [weapon,model] of Object.entries(models))model.visible=current===weapon;
    const shotAge=Math.max(0,pose.time-pose.shotAt)/1000;
    const melee=current==='knife';
    const primary=!melee&&current!=='pistol';
    const slash=melee&&!pose.secondary&&pose.shotAt>0&&shotAge<.38?Math.sin(shotAge/.38*Math.PI):0;
    const stab=melee&&pose.secondary&&pose.shotAt>0&&shotAge<.52?Math.sin(shotAge/.52*Math.PI):0;
    const recoil=!melee&&pose.shotAt>0?Math.exp(-shotAge*25)*Math.sin(Math.min(1,shotAge*35)*Math.PI*.65):0;
    const reloading=!melee&&pose.reloadUntil>pose.time;
    const progress=reloading?THREE.MathUtils.clamp(1-(pose.reloadUntil-pose.time)/pose.reloadDuration,0,1):0;
    const reloadLift=reloading?ease(progress/.15)*(1-ease((progress-.83)/.17)):0;
    const magOut=reloading?ease((progress-.12)/.15)*(1-ease((progress-.55)/.18)):0;
    const boltPull=reloading?Math.sin(ease((progress-.76)/.14)*Math.PI)*.05:0;
    cycle+=dt*(pose.speed>0.1?Math.min(12,pose.speed*2.1):1.3);
    const aim=melee||reloading||pose.sprint?0:THREE.MathUtils.clamp(pose.aim??0,0,1);
    // Equipping is presentation only: sights, an attack or reloading take over
    // immediately. Never queue a model swap or delay a live game input.
    if(reducedMotion||aim>0||reloading||(pose.shotAt>0&&shotAge<.32))drawProgress=1;
    const draw=(1-ease(drawProgress))*(1-aim);
    const moveWeight=reducedMotion?0:THREE.MathUtils.clamp(pose.speed/5,0,1)*(1-aim),bob=Math.sin(cycle)*.005*moveWeight;
    const hipX=primary?.24:melee?.28:.20;
    const sightY=current==='rifle'||current==='sniper'?-.214:current==='smg'?-.1535:current==='shotgun'?-.076:-.100;
    group.position.set(THREE.MathUtils.lerp(hipX,0,aim)+draw*.035-slash*.34-stab*.15,THREE.MathUtils.lerp(-.245,sightY,aim)+Math.abs(Math.cos(cycle))*.005*moveWeight-draw*.27-.065*reloadLift+slash*.1+stab*.04,THREE.MathUtils.lerp(melee?-.60:-.72,primary?-.56:-.48,aim)+draw*.08+recoil*.05-slash*.17-stab*.48);
    group.rotation.set(draw*.12+recoil*.045*(1-aim*.55)+(pose.sprint?.22:0)-reloadLift*.12+slash*.15,.005*(1-aim)+draw*.045+reloadLift*.22-slash*.45,-draw*.13-reloadLift*.33+bob+slash*.8);
    knife.rotation.set(-.12*(1-stab),0,-.23*(1-stab));
    rifleMagazine.position.set(-magOut*.06,-.15-magOut*.31,-.18+magOut*.12);rifleMagazine.rotation.z=-magOut*.18;
    sniperMagazine.position.copy(rifleMagazine.position);sniperMagazine.rotation.copy(rifleMagazine.rotation);
    smgMagazine.position.set(-magOut*.04,-.15-magOut*.31,-.17+magOut*.1);smgMagazine.rotation.z=-magOut*.12;
    const pumpStroke=current==='shotgun'&&pose.shotAt>0&&shotAge>.10&&shotAge<.56?Math.sin((shotAge-.10)/.46*Math.PI):0;
    pump.position.z=-.48+pumpStroke*.12;
    pistolMagazine.position.y=-.17-magOut*.25;bolt.position.z=-.08+boltPull;slide.position.z=recoil*.028;
    left.pose(new THREE.Vector3(melee?-.47:primary?-.025:-.035,(melee?-.17:-.09)-magOut*.29,primary?-.46+magOut*.34+pumpStroke*.12:melee?.05:-.07));
    right.pose(new THREE.Vector3(.012,melee?-.035:-.13,primary?.025:.015));
    muzzle.position.z=current==='sniper'?-1.41:current==='smg'?-.78:primary?-1.07:-.37;muzzle.visible=!melee&&pose.shotAt>0&&shotAge<.042&&!reloading;muzzle.rotation.z=pose.shotAt%7;
    if(lastReload&&!reloading){rifleMagazine.rotation.z=0;pistolMagazine.position.y=-.17;}lastReload=reloading;
  }
  return {group,muzzle,update,resetDraw,dispose(){camera.remove(group);for(const geometry of geometries)geometry.dispose();for(const m of materials)m.dispose();}};
}
