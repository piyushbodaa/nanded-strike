import test from 'node:test';
import assert from 'node:assert/strict';
import { drawDistrictFacade } from '../lib/district-facades';
import { DISTRICT_LANDMARKS } from '../lib/district-landmark-data';
import geodata from '../lib/geodata.json';
import { insidePolygon, raySolid } from '../lib/geometry';
import { BUILDINGS, roadDistance } from '../lib/map';
import { isWalkable } from '../lib/simulation';
import type { FacadeDraw } from '../lib/iib-facade';

test('district facade geometry fits its authoritative exterior collider',()=>{
 for(const landmark of DISTRICT_LANDMARKS) {
  const width=landmark.facadeWidth!,height=landmark.height!;
  let primitiveCount=0,labelCount=0;
  const bounds=(min:number[],max:number[])=>{
   primitiveCount++;
   assert.ok([...min,...max].every(Number.isFinite),`${landmark.id} contains nonfinite geometry`);
   assert.ok(min[0]>=-width/2-1e-6&&max[0]<=width/2+1e-6,`${landmark.id} exceeds collider width: ${min[0]}..${max[0]}`);
   assert.ok(min[1]>=-1e-6&&max[1]<=height+1e-6,`${landmark.id} exceeds collider height`);
   // LANDMARK_COLLIDERS uses local z=.24 and depth=.64: [-.08,.56].
   assert.ok(min[2]>=-.08-1e-6&&max[2]<=.56+1e-6,`${landmark.id} exceeds collider depth: ${min[2]}..${max[2]}`);
  };
  const draw:FacadeDraw={
   box(x,y,z,w,h,d,color){assert.ok(w>0&&h>0&&d>0&&color);bounds([x-w/2,y-h/2,z-d/2],[x+w/2,y+h/2,z+d/2]);},
   text(value,x,y,z,w,h){assert.ok(value.trim());labelCount++;bounds([x-w/2,y-h/2,z],[x+w/2,y+h/2,z]);},
   rail(a,b,r){assert.ok(r>0);bounds(a.map((v,i)=>Math.min(v,b[i])-r),a.map((v,i)=>Math.max(v,b[i])+r));},
  };
  assert.equal(drawDistrictFacade(landmark.id,width,height,draw),true,`${landmark.id} has no renderer`);
  assert.ok(primitiveCount>0,`${landmark.id} must render exterior geometry`);
  assert.ok(labelCount>0,`${landmark.id} needs its photographed name fascia`);
 }
});

test('district facades sit just outside retained source edges and face their viewing approach',()=>{
 for(const landmark of DISTRICT_LANDMARKS) {
  const source=geodata.buildings.find(b=>b.id===landmark.buildingId)!;
  const polygon=source.points.map(([x,z])=>({x,z}));
  const nx=Math.sin(landmark.yaw),nz=Math.cos(landmark.yaw);
  for(const t of [-.49,0,.49]) {
   const x=landmark.x+t*landmark.facadeWidth!*Math.cos(landmark.yaw);
   const z=landmark.z-t*landmark.facadeWidth!*Math.sin(landmark.yaw);
   assert.ok(insidePolygon(x-nx*.20,z-nz*.20,polygon),`${landmark.id} is not aligned with its source wall`);
   assert.equal(insidePolygon(x+nx*.20,z+nz*.20,polygon),false,`${landmark.id} faces into its building`);
  }
  const v=landmark.viewpoint,dx=landmark.x-v.x,dz=landmark.z-v.z,distance=Math.hypot(dx,dz);
  assert.ok((v.x-landmark.x)*nx+(v.z-landmark.z)*nz>0,`${landmark.id} viewpoint is behind its facade`);
  assert.ok(isWalkable(v.x,v.z),`${landmark.id} viewpoint is blocked`);
  assert.ok(roadDistance(v)<1,`${landmark.id} viewpoint is off the public-road approach`);
  for(const building of BUILDINGS.filter(b=>b.id!==landmark.buildingId)) {
   assert.ok(raySolid(v.x,1.58,v.z,dx/distance,0,dz/distance,building)>=distance,`${landmark.id} entrance sightline blocked by ${building.id}`);
  }
 }
});

test('unrecognized district landmarks render no substitute building',()=>{
 let calls=0;
 assert.equal(drawDistrictFacade('unverified-location',10,10,{box(){calls++;},text(){calls++;},rail(){calls++;}}),false);
 assert.equal(calls,0);
});

// A facade can fit its collider yet flicker if two materials share a visible
// plane. Check real overlapping face areas, including columns and shutters.
test('district facade panels do not have overlapping coplanar front faces',()=>{
 for(const landmark of DISTRICT_LANDMARKS) {
  const faces:{x:number,y:number,z:number,w:number,h:number,color:string}[]=[];
  drawDistrictFacade(landmark.id,landmark.facadeWidth!,landmark.height!,{
   box(x,y,z,w,h,d,color){faces.push({x,y,z:z+d/2,w,h,color});},
   text(){},rail(){},
  });
  for(let i=0;i<faces.length;i++)for(let j=i+1;j<faces.length;j++) {
   const a=faces[i],b=faces[j];
   if(a.color===b.color||Math.abs(a.z-b.z)>1e-6)continue;
   const overlapWidth=Math.min(a.x+a.w/2,b.x+b.w/2)-Math.max(a.x-a.w/2,b.x-b.w/2);
   const overlapHeight=Math.min(a.y+a.h/2,b.y+b.h/2)-Math.max(a.y-a.h/2,b.y-b.h/2);
   assert.ok(overlapWidth<=1e-6||overlapHeight<=1e-6,`${landmark.id} has overlapping coplanar panels ${i} and ${j}`);
  }
 }
});
