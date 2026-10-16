import * as THREE from 'three';
import type { Match } from './simulation';

/** These markers are gameplay objectives, not claims about real-world buildings. */
export function createCombatEffects(scene:THREE.Scene){
  const root=new THREE.Group();root.name='Classic objectives and utility';scene.add(root);
  const objects=new Map<string,THREE.Object3D>();
  const baseFog=scene.fog,smokeFog=new THREE.Fog('#9b9f9b',.1,3);
  const geometry=new THREE.IcosahedronGeometry(1,1);
  const grenadeGeometry=new THREE.SphereGeometry(.09,8,6);
  const grenadeMaterial=new THREE.MeshStandardMaterial({color:'#596647',roughness:.8});
  const smokeMaterial=new THREE.MeshBasicMaterial({color:'#9b9f9b',transparent:true,opacity:.86,depthWrite:false});
  const ringGeometry=new THREE.RingGeometry(.94,1,48);
  const ringMaterial=new THREE.MeshBasicMaterial({color:'#edb85c',transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false});
  const bombGeometry=new THREE.BoxGeometry(.3,.16,.22);
  const bombMaterial=new THREE.MeshStandardMaterial({color:'#b68c4f',roughness:.65});
  const textures:THREE.CanvasTexture[]=[];
  const labelMaterials:THREE.SpriteMaterial[]=[];
  function label(text:string){
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;
    const context=canvas.getContext('2d')!;context.fillStyle='#172522d9';context.fillRect(0,0,256,128);context.fillStyle='#ffe2a4';context.font='bold 72px sans-serif';context.textAlign='center';context.textBaseline='middle';context.fillText(text,128,68);
    const map=new THREE.CanvasTexture(canvas);textures.push(map);
    const material=new THREE.SpriteMaterial({map,depthWrite:false});labelMaterials.push(material);
    const sprite=new THREE.Sprite(material);sprite.scale.set(2.6,1.3,1);return sprite;
  }
  function ensure(key:string,make:()=>THREE.Object3D){let object=objects.get(key);if(!object){object=make();objects.set(key,object);root.add(object);}return object;}
  function update(match:Match|null,camera:THREE.Camera,now:number){
    const active=new Set<string>();let inSmoke=false;
    for(const site of match?.classic?.sites??[]){
      const key=`site-${site.id}`;active.add(key);
      const group=ensure(key,()=>{const group=new THREE.Group(),ring=new THREE.Mesh(ringGeometry,ringMaterial);ring.rotation.x=-Math.PI/2;ring.scale.setScalar(site.radius);ring.position.y=.035;group.add(ring);const marker=label(site.id);marker.position.y=3;group.add(marker);return group;});group.position.set(site.x,0,site.z);
    }
    for(const grenade of match?.grenades??[]){const key=`grenade-${grenade.id}`;active.add(key);const mesh=ensure(key,()=>new THREE.Mesh(grenadeGeometry,grenadeMaterial));mesh.position.set(grenade.x,grenade.y,grenade.z);}
    for(const smoke of match?.smokes??[]){
      const key=`smoke-${smoke.id}`;active.add(key);
      const group=ensure(key,()=>{const group=new THREE.Group();for(let i=0;i<9;i++){const cloud=new THREE.Mesh(geometry,smokeMaterial);const angle=i*Math.PI*2/8;cloud.position.set(i===8?0:Math.cos(angle)*2, i%3*.8, i===8?0:Math.sin(angle)*2);cloud.scale.set(3.5,2.5,3.5);group.add(cloud);}return group;});
      group.position.set(smoke.x,smoke.y+1,smoke.z);const fade=Math.min(1,Math.max(.05,(smoke.expiresAt-now)/1500));group.scale.setScalar(smoke.radius/6*fade);
      if(Math.hypot(camera.position.x-smoke.x,camera.position.z-smoke.z)<smoke.radius&&camera.position.y<smoke.y+6)inSmoke=true;
    }
    const bomb=match?.classic?.bomb;
    if(bomb&&(bomb.status==='planted'||bomb.status==='dropped')){const key='bomb';active.add(key);const mesh=ensure(key,()=>new THREE.Mesh(bombGeometry,bombMaterial));mesh.position.set(bomb.x,.11,bomb.z);bombMaterial.emissive.set(bomb.status==='planted'&&Math.sin(now/100)>0?'#bf2412':'#000000');}
    for(const[key,object]of objects){if(!active.has(key)){root.remove(object);objects.delete(key);}}
    scene.fog=inSmoke?smokeFog:baseFog;
  }
  return {update,dispose(){scene.remove(root);scene.fog=baseFog;geometry.dispose();grenadeGeometry.dispose();grenadeMaterial.dispose();smokeMaterial.dispose();ringGeometry.dispose();ringMaterial.dispose();bombGeometry.dispose();bombMaterial.dispose();textures.forEach(t=>t.dispose());labelMaterials.forEach(m=>m.dispose());objects.clear();}};
}
