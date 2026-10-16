import * as THREE from 'three';
import { BUILDINGS, ROADS } from './map';
import { insidePolygon } from './geometry';
import { LANDMARKS } from './landmark-data';

/** Estimated everyday exterior detail on the mapped footprints, not surveyed assets.
 * Roof fittings stay inside each outline; shutter panels stay flush with street-facing walls. */
export function createStreetDetails() {
 const group=new THREE.Group();group.name='Stylized roof and street frontage detail';
 const resources:{dispose():void}[]=[];
 const cells=new Map<string,{group:THREE.Group;x:number;z:number}>(),cellSize=120;
 type Instance={position:THREE.Vector3;scale:THREE.Vector3;yaw:number;color?:string};
 const tanks:Instance[]=[],caps:Instance[]=[],bases:Instance[]=[],shutters:Instance[]=[],slats:Instance[]=[],awnings:Instance[]=[],acUnits:Instance[]=[];
 const custom=new Set(LANDMARKS.map(l=>l.buildingId));
 const hash=(id:string)=>{let h=2166136261;for(const c of id)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
 const item=(x:number,y:number,z:number,sx:number,sy:number,sz:number,yaw=0,color?:string):Instance=>({position:new THREE.Vector3(x,y,z),scale:new THREE.Vector3(sx,sy,sz),yaw,color});
 const streetSegments=ROADS.filter(r=>['secondary','tertiary','primary','residential'].includes(r.kind)).flatMap(r=>r.points.slice(1).map((b,i)=>({a:r.points[i],b,width:r.width})));
 for(const b of BUILDINGS) {
  if(custom.has(b.id))continue;
  const seed=hash(b.id);
  if(b.w>5&&b.d>5&&seed%3===0&&[[-.85,-.85],[-.85,.85],[.85,-.85],[.85,.85]].every(([x,z])=>insidePolygon(b.x+x,b.z+z,b.polygon))) {
   // Small black water tanks, slab bases and lids; the roof geometry remains geographic.
   bases.push(item(b.x,b.h+.12,b.z,1.7,.24,1.7));
   tanks.push(item(b.x,b.h+.95,b.z,.74,1.45,.74));
   caps.push(item(b.x,b.h+1.72,b.z,.52,.1,.52));
   for(const y of [.45,.75,1.05,1.35])caps.push(item(b.x,b.h+y,b.z,.765,.055,.765));
  }
  // Only the nearest public street gets a shop frontage, and only a fraction of buildings.
  if(seed%4!==0||b.w<5||b.d<4)continue;
  let nearest:{x:number;z:number;distance:number}|undefined;
  for(const {a,b:end,width} of streetSegments){
   const dx=end.x-a.x,dz=end.z-a.z,t=Math.max(0,Math.min(1,((b.x-a.x)*dx+(b.z-a.z)*dz)/(dx*dx+dz*dz||1)));
   const x=a.x+t*dx,z=a.z+t*dz,distance=Math.hypot(x-b.x,z-b.z)-width/2;
   if(!nearest||distance<nearest.distance)nearest={x,z,distance};
  }
  if(!nearest||nearest.distance>Math.max(b.w,b.d)*.5+6)continue;
  let edge:{x:number;z:number;nx:number;nz:number;length:number;distance:number}|undefined;
  for(let i=0;i<b.polygon.length;i++){
   const a=b.polygon[i],q=b.polygon[(i+1)%b.polygon.length],dx=q.x-a.x,dz=q.z-a.z,length=Math.hypot(dx,dz);if(length<4)continue;
   const x=(a.x+q.x)/2,z=(a.z+q.z)/2;let nx=dz/length,nz=-dx/length;
   if(nx*(x-b.x)+nz*(z-b.z)<0){nx=-nx;nz=-nz;}
   if(nx*(nearest.x-x)+nz*(nearest.z-z)<0)continue;
   const distance=Math.hypot(x-nearest.x,z-nearest.z);
   if(!edge||distance<edge.distance)edge={x,z,nx,nz,length,distance};
  }
  if(!edge)continue;
  const {x,z,nx,nz,length}=edge,yaw=Math.atan2(nx,nz),width=Math.min(length-.8,8.4),count=width>5?2:1;
  for(let k=0;k<count;k++){
   const side=(k-(count-1)/2)*width/count,px=x+nz*side,pz=z-nx*side,w=width/count-.22;
   shutters.push(item(px+nx*.025,1.35,pz+nz*.025,w,2.5,.045,yaw,['#6e817d','#8090a0','#997b68'][seed%3]));
   for(let sy=.22;sy<2.6;sy+=.17)slats.push(item(px+nx*.055,sy,pz+nz*.055,w,.025,.02,yaw));
  }
  awnings.push(item(x+nx*.3,2.78,z+nz*.3,width+.2,.1,.65,yaw,['#48615c','#8e4d3f','#b4955c'][seed%3]));
  if(b.h>6)acUnits.push(item(x+nx*.25,4.7,z+nz*.25,.8,.55,.5,yaw));
 }
 function instances(name:string,geometry:THREE.BufferGeometry,color:string,list:Instance[],roughness=.85){
  if(!list.length){geometry.dispose();return;}
  const mat=new THREE.MeshStandardMaterial({color,roughness});resources.push(geometry,mat);
  // Keep repeated detail local so distant roofs do not cost a draw on phones.
  const buckets=new Map<string,Instance[]>();
  for(const entry of list){const cx=Math.floor(entry.position.x/cellSize),cz=Math.floor(entry.position.z/cellSize),key=`${cx},${cz}`;if(!cells.has(key)){const local=new THREE.Group();local.name=`Street detail ${key}`;group.add(local);cells.set(key,{group:local,x:(cx+.5)*cellSize,z:(cz+.5)*cellSize});}const entries=buckets.get(key)??[];entries.push(entry);buckets.set(key,entries);}
  const matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion(),axis=new THREE.Vector3(0,1,0);
  for(const [key,entries] of buckets){
   const mesh=new THREE.InstancedMesh(geometry,mat,entries.length);mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;
   entries.forEach((entry,i)=>{rotation.setFromAxisAngle(axis,entry.yaw);matrix.compose(entry.position,rotation,entry.scale);mesh.setMatrixAt(i,matrix);if(entry.color)mesh.setColorAt(i,new THREE.Color(entry.color));});
   mesh.computeBoundingSphere();cells.get(key)!.group.add(mesh);
  }
 }
 instances('Rooftop water tanks',new THREE.CylinderGeometry(1,1,1,12),'#292e2d',tanks);
 instances('Tank lids and ribbing',new THREE.CylinderGeometry(1,1,1,12),'#414745',caps);
 instances('Tank concrete plinths',new THREE.BoxGeometry(1,1,1),'#c7c4b8',bases);
 instances('Street shop shutters',new THREE.BoxGeometry(1,1,1),'#ffffff',shutters);
 instances('Shutter horizontal slats',new THREE.BoxGeometry(1,1,1),'#515a59',slats);
 instances('Shop shade canopies',new THREE.BoxGeometry(1,1,1),'#ffffff',awnings);
 instances('Facade air conditioners',new THREE.BoxGeometry(1,1,1),'#d9d6ca',acUnits);
 return {group,update(focus:{x:number;z:number}){for(const cell of cells.values())cell.group.visible=Math.hypot(cell.x-focus.x,cell.z-focus.z)<310;},dispose(){group.removeFromParent();group.traverse(o=>{if(o instanceof THREE.InstancedMesh)o.dispose();});for(const r of resources)r.dispose();}};
}
