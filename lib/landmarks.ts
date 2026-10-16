import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LANDMARKS } from './landmark-data';
import { drawIibFacade } from './iib-facade';
import { drawKonaleFacade, drawRccFacade } from './coaching-facades';

/** Photo-referenced exterior structures, isolated from the geographic base renderer.
 * Original mesh construction; no copyrighted source photo is bundled or used as a decal. */
export function createLandmarks() {
 const group=new THREE.Group();group.name='Photo-referenced Nanded landmarks';
 const resources:{dispose():void}[]=[];
 const materials=new Map<string,THREE.MeshStandardMaterial>();
 const material=(c:string,metal=0)=>{
  metal=metal||(['#ab7836','#d5a356'].includes(c)?.35:0);
  const key=c+metal;let m=materials.get(key);if(!m){m=new THREE.MeshStandardMaterial({color:c,roughness:metal?.48:.86,metalness:metal});materials.set(key,m);}return m;
 };
 for(const landmark of LANDMARKS) {
  const local=new THREE.Group();local.name=landmark.name;local.position.set(landmark.x,0,landmark.z);local.rotation.y=landmark.yaw;group.add(local);
  const batches=new Map<THREE.Material,THREE.BufferGeometry[]>();
  const add=(geo:THREE.BufferGeometry,color:string,x:number,y:number,z:number,rx=0,ry=0,rz=0,metal=0)=>{
   geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz)),new THREE.Vector3(1,1,1)));
   const m=material(color,metal);let list=batches.get(m);if(!list){list=[];batches.set(m,list);}list.push(geo);
  };
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,c:string)=>add(new THREE.BoxGeometry(w,h,d),c,x,y,z);
  const sphere=(x:number,y:number,z:number,r:number,c:string,sx=1,sy=1,sz=1)=>{const geo=new THREE.SphereGeometry(r,10,8);geo.scale(sx,sy,sz);add(geo,c,x,y,z);};
  const bar=(a:THREE.Vector3,b:THREE.Vector3,r:number,c:string,metal=0)=>{
   const delta=b.clone().sub(a),geo=new THREE.CylinderGeometry(r,r,delta.length(),7);geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));const p=a.clone().add(b).multiplyScalar(.5);add(geo,c,p.x,p.y,p.z,0,0,0,metal);
  };
  const rail=(a:number[],b:number[],radius:number,c:string)=>bar(new THREE.Vector3(...a as [number,number,number]),new THREE.Vector3(...b as [number,number,number]),radius,c,.38);
  const text=(value:string,x:number,y:number,z:number,w:number,h:number,fg:string,bg?:string,small?:string)=>{
   const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=Math.max(128,Math.round(2048*h/w));const ctx=canvas.getContext('2d');if(!ctx)return;
   if(bg){ctx.fillStyle=bg;ctx.fillRect(0,0,canvas.width,canvas.height);}ctx.textAlign='center';ctx.fillStyle=fg;
   const font="'Noto Devanagari', 'Noto Sans Devanagari', sans-serif";
   let fontSize=canvas.height*(small?.62:1.02);ctx.font=`700 ${fontSize}px ${font}`;
   const measured=ctx.measureText(value).width;if(measured>canvas.width*.95){fontSize*=canvas.width*.95/measured;ctx.font=`700 ${fontSize}px ${font}`;}
   ctx.shadowColor='#4c473f';ctx.shadowOffsetX=2;ctx.shadowOffsetY=3;ctx.shadowBlur=0;
   ctx.fillText(value,canvas.width/2,canvas.height*(small?.6:.8));
   if(small){ctx.font=`500 ${canvas.height*.24}px ${font}`;ctx.fillText(small,canvas.width/2,canvas.height*.92,canvas.width*.94);}
   const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=16;resources.push(texture);
   const mat=new THREE.MeshStandardMaterial({map:texture,transparent:!bg,alphaTest:bg?0:.2,roughness:.75,side:THREE.DoubleSide});resources.push(mat);
   const geometry=new THREE.PlaneGeometry(w,h);resources.push(geometry);const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(x,y,z);local.add(mesh);
  };
  if(landmark.id==='bhagya-kaman') {
   const stone='#3c3939',bronze='#ab7836',gold='#d5a356',cream='#d1c4a5',panel='#a6532a';
   box(0,.15,.65,3.4,.3,3.2,'#777970');
   box(0,2.625,0,2.8,5.25,1.5,stone);
   box(0,3,.765,2.15,4.2,.06,panel);
   box(-1.27,2.95,.82,.22,4.55,.12,'#282a2c');box(1.27,2.95,.82,.22,4.55,.12,'#282a2c');
   for(const x of [-6,6]) {box(x,2.75,0,.8,5.5,1.2,stone);box(x,.2,0,1.1,.4,1.5,'#78766f');box(x,5.46,0,1.05,.2,1.35,cream);}
   box(0,5.72,0,13.2,.85,1.25,cream);box(0,6.15,0,13.35,.12,1.35,'#e1d7c1');
   text('भाग्यनगर',0,6.63,.02,7.8,1.48,'#e1ded0');
   text('भाग्यनगर को-ऑपरेटिव्ह हाउसिंग सोसायटी मर्यादित, नांदेड',0,5.72,.639,12.7,.63,'#605242');
   // Recognisable relief arrangement from the photograph: standing figure, upper bust,
   // seated figure at a book/table and stylised trees. Sculptural details are simplified.
   function reliefPerson(x:number,y:number,scale:number,seated=false) {
    sphere(x,y+.56*scale,.88,.15*scale,gold,.75,1.2,.45);
    const torso=new THREE.CylinderGeometry(.13*scale,.2*scale,.64*scale,8);add(torso,bronze,x,y+.13*scale,.9);
    rail([x-.1*scale,y+.3*scale,.93],[x-.3*scale,y-.1*scale,1.01],.065*scale,gold);
    rail([x+.11*scale,y+.3*scale,.93],[x+.24*scale,y+.02*scale,1.1],.06*scale,gold);
    if(seated){rail([x,y-.15*scale,.97],[x+.35*scale,y-.45*scale,1.12],.12*scale,bronze);}
    else {rail([x-.08*scale,y-.15*scale,.94],[x-.1*scale,y-.72*scale,.94],.07*scale,gold);rail([x+.08*scale,y-.15*scale,.94],[x+.12*scale,y-.72*scale,.94],.07*scale,gold);}
   }
   reliefPerson(-.65,4.55,.74);reliefPerson(.65,4.35,.65);reliefPerson(.35,3.14,.75,true);
   box(.14,2.64,1.02,1.15,.13,.32,bronze);box(.08,2.77,1.05,.45,.08,.34,gold);
   for(const x of [-.79,.83]){
    rail([x,1.3,.89],[x,2.45,.9],.075,bronze);
    for(let k=0;k<9;k++){const angle=k*2.4;sphere(x+Math.cos(angle)*.34,2.15+Math.sin(angle)*.4,.91,.16,gold,1,1,.32);}
    box(x,1.27,.94,.47,.14,.22,gold);
   }
   // Dark bust on the forward memorial pedestal, intentionally not an invented portrait.
   box(0,.88,1.25,1.05,1.45,.95,stone);box(0,1.6,1.25,1.22,.13,1.06,'#c5bda9');
   sphere(0,2.01,1.25,.28,'#393737',1.05,.74,.65);sphere(0,2.38,1.24,.19,'#45403a',.86,1.13,.86);
   box(0,1.89,1.25,.38,.41,.24,'#393737');
   box(0,.95,1.735,.74,.53,.018,'#242527');
   text('स्मृतिस्थळ',0,1.06,1.75,.65,.2,'#d5c49d');
   for(const x of [-2,2]) {
    // Lamps sit clear of the twin openings; their small bases stay on the central forecourt.
    rail([x,0,1.5],[x,3.65,1.5],.055,'#303332');
    sphere(x,3.83,1.5,.13,'#303332',.7,1.4,.7);
    for(const side of [-1,1]){rail([x,3.48,1.5],[x+side*.28,3.58,1.5],.045,'#303332');box(x+side*.28,3.48,1.5,.2,.4,.2,'#eee3b8');box(x+side*.28,3.71,1.5,.27,.07,.27,'#333632');}
   }
  } else if(landmark.id==='yeshwant-entrance') {
   const brick='#ad4b2e',cream='#d9d1b9',metal='#d4cba6';
   for(const x of [-4.25,4.25]){
    box(x,2.15,0,.92,4.3,.92,brick);box(x,.12,0,1.12,.24,1.1,'#86755e');
    for(let y=.28;y<4.2;y+=.23){box(x,y,.468,.94,.025,.018,'#d38a64');box(x+.468,y,0,.018,.025,.94,'#d38a64');}
   }
   box(0,4.62,0,10.9,1.18,1.1,cream);box(0,5.23,0,10.96,.08,1.14,'#e2dac4');
   text('यशवंत महाविद्यालय, नांदेड',0,4.55,.561,10.3,.7,'#f0ece0');
   text('श्री शारदा भवन शिक्षण संस्था संचलित',0,4.99,.568,8.7,.26,'#514c3f');
   // Open cream gates preserve the photograph's geometric bars while allowing passage.
   for(const side of [-1,1]) {
    const x=side*3.76;
    for(const y of [.18,.42,1.45,1.8])rail([x,y,0],[x,y,-3.6],.035,metal);
    for(let z=0;z>=-3.61;z-=.45)rail([x,.18,z],[x,1.8,z],.025,metal);
    const z=-1.8;
    rail([x,.43,z],[x,1.1,z+.75],.027,metal);rail([x,1.1,z+.75],[x,1.75,z],.027,metal);
    rail([x,1.75,z],[x,1.1,z-.75],.027,metal);rail([x,1.1,z-.75],[x,.43,z],.027,metal);
    const medallion=new THREE.CylinderGeometry(.17,.17,.025,16);medallion.rotateZ(Math.PI/2);add(medallion,metal,x,1.1,z,0,0,0,.2);
   }
  }
  if(landmark.buildingId) {
   const draw={box,text,rail};
   const facade=landmark.id==='iib-parnakuti'?drawIibFacade:landmark.id==='konale-neet'?drawKonaleFacade:drawRccFacade;
   facade(landmark.facadeWidth!,landmark.height!,draw);
  }
  for(const [m,geometries] of batches){const merged=mergeGeometries(geometries,false);for(const geo of geometries)geo.dispose();if(!merged)continue;const mesh=new THREE.Mesh(merged,m);mesh.castShadow=true;mesh.receiveShadow=true;local.add(mesh);resources.push(merged);}
 }
 return {group,dispose(){group.removeFromParent();for(const r of resources)r.dispose();for(const m of materials.values())m.dispose();}};
}
