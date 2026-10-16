/** Bhagya Nagar, Nanded: OSM-derived streets with stylized residential architecture.
 * Source and license: /map-reference.json. x=east, -z=north; one unit=one metre. */
export type MapPoint = { x: number; z: number };
export type Collider = MapPoint & { w: number; d: number; h: number };
export const MAP_BOUNDS = { minX: -60, maxX: 60, minZ: -60, maxZ: 60 };
export const LOCATION = { name: 'Bhagya Nagar', city: 'Nanded', latitude: 19.177350, longitude: 77.309500, source: '/map-reference.json' };
export const ROADS: {id:string;name:string;kind:string;width:number;points:MapPoint[]}[] = [{"id":"102662429","name":"Bhagya Nagar Road","kind":"main","width":8.6,"points":[{"x":-84.0,"z":-33.364},{"x":-45.621,"z":-6.189},{"x":-12.007,"z":15.908},{"x":69.32,"z":75.575},{"x":81.239,"z":84.0}]},{"id":"591472951","name":"Residential lane","kind":"residential","width":6,"points":[{"x":-12.007,"z":15.908},{"x":-3.89,"z":-15.963},{"x":4.344,"z":-84.0}]},{"id":"591472952","name":"Residential lane","kind":"residential","width":6,"points":[{"x":-3.89,"z":-15.963},{"x":44.643,"z":-11.889},{"x":84.0,"z":-8.577}]},{"id":"591472953","name":"Residential lane","kind":"residential","width":6,"points":[{"x":44.643,"z":-11.889},{"x":53.299,"z":-84.0}]},{"id":"591491290","name":"Residential lane","kind":"residential","width":6,"points":[{"x":-45.621,"z":-6.189},{"x":-59.363,"z":-80.674},{"x":-59.966,"z":-84.0}]},{"id":"841309108","name":"Bhagya Nagar Road","kind":"main","width":8.6,"points":[{"x":63.3,"z":84.0},{"x":-44.044,"z":7.035},{"x":-84.0,"z":-23.014}]}];
function distanceToSegment(p: MapPoint, a: MapPoint, b: MapPoint) {
  const dx=b.x-a.x,dz=b.z-a.z;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));
  return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
}
export function roadDistance(p:MapPoint) {
  return Math.min(...ROADS.flatMap(r=>r.points.slice(1).map((b,i)=>distanceToSegment(p,r.points[i],b)-r.width/2)));
}
export type Building = Collider & { color:string;accent:string;kind:'home'|'shop'|'apartment';front:number;name:string;label:string };
export const BUILDINGS: Building[]=[];
// These are designed parcels, not claimed OSM building footprints. Street geometry is preserved.
for(let iz=0;iz<7;iz++)for(let ix=0;ix<7;ix++) {
  const x=-51+ix*17,z=-51+iz*17;
  if(roadDistance({x,z})<11.5)continue;
  const i=BUILDINGS.length;
  const palette=['#e1d7be','#c8d6cc','#d5c5bb','#dedbd1','#b7c9d0','#d6d2ad'];
  const accents=['#658b85','#85675f','#7194a4','#9c8469'];
  const nearest=ROADS.flatMap(r=>r.points).sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z))[0];
  const kind=i%5===0?'shop':i%4===0?'apartment':'home';
  BUILDINGS.push({x,z,w:kind==='apartment'?12:10,d:kind==='apartment'?12:10,h:kind==='apartment'?12.1:kind==='shop'?6.8:6.4+(i%3)*.6,color:palette[i%palette.length],accent:accents[i%accents.length],kind,front:nearest.z>z?1:-1,name:kind==='shop'?'किराणा व जनरल स्टोअर्स':'निवास',label:kind==='shop'?'GENERAL STORES':'RESIDENCE'});
}
export const COMPOUND_WALLS:Collider[]=BUILDINGS.filter(b=>b.kind==='home').flatMap(b=>[
 {x:b.x,z:b.z-b.front*6.8,w:13.6,d:.3,h:1.25},
 {x:b.x-6.8,z:b.z,w:.3,d:13.6,h:1.25},
 {x:b.x+6.8,z:b.z,w:.3,d:13.6,h:1.25},
 {x:b.x-4.2,z:b.z+b.front*6.8,w:5.2,d:.3,h:1.25},
 {x:b.x+4.2,z:b.z+b.front*6.8,w:5.2,d:.3,h:1.25},
]);
export const COVER:(Collider&{kind:'crate'|'barrels'|'cart'|'planter'|'car'|'barrier'})[]=[
 {x:-12,z:4,w:2.4,d:1.2,h:1.1,kind:'barrier'},
 {x:17,z:36,w:2.2,d:4.4,h:1.65,kind:'car'},
 {x:-26,z:-12,w:3.9,d:2.1,h:2.35,kind:'cart'},
 {x:28,z:-15,w:3,d:1.2,h:1.1,kind:'barrier'},
 {x:30,z:5,w:2.2,d:4.3,h:1.6,kind:'car'},
 {x:-8,z:-42,w:2,d:2,h:.9,kind:'planter'},
 {x:-39,z:22,w:2.4,d:2,h:1.3,kind:'crate'},
];
export const UTILITY_POLES=[{x:-34,z:-6},{x:5,z:28},{x:36,z:50},{x:3,z:-30},{x:37,z:-7}];
export const LAMP_POLES:MapPoint[]=[];
export const PLANT_POTS:MapPoint[]=[];
export const COLLIDERS:Collider[]=[
 ...BUILDINGS.map(({x,z,w,d,h})=>({x,z,w,d,h})),...COMPOUND_WALLS,
 ...COVER.map(({x,z,w,d,h})=>({x,z,w,d,h})),
 ...UTILITY_POLES.map(p=>({...p,w:.3,d:.3,h:8.5})),
 ...BUILDINGS.filter(b=>b.kind==='home').map(b=>({x:b.x+5.4,z:b.z-5.4,w:.35,d:.35,h:2.5})),
 ...[{x:-8.1,z:9},{x:-3.9,z:9},{x:-29,z:-10}].map(p=>({...p,w:.12,d:.12,h:3.4})),
 ...COVER.filter(c=>c.kind==='planter').map(({x,z})=>({x,z,w:.4,d:.4,h:4.4})),
];
export const SPAWNS={blue:[{x:-36,z:-5},{x:-39,z:-8},{x:-42,z:-12},{x:-38,z:-12}],orange:[{x:22,z:40},{x:26,z:43},{x:24,z:37},{x:28,z:45}]};
export const SPAWN_YAWS={blue:-2.20,orange:.94};
const clear=(p:MapPoint)=>!COLLIDERS.some(c=>Math.abs(p.x-c.x)<c.w/2+.48&&Math.abs(p.z-c.z)<c.d/2+.48);
export const WAYPOINTS:MapPoint[]=[];
// Sampling the mapped street centerlines keeps AI routes grounded in the actual junction.
for(const road of ROADS)for(let i=1;i<road.points.length;i++){
 const a=road.points[i-1],b=road.points[i],distance=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(distance/7);
 for(let k=0;k<=steps;k++) {const p={x:a.x+(b.x-a.x)*k/steps,z:a.z+(b.z-a.z)*k/steps};if(Math.abs(p.x)<58&&Math.abs(p.z)<58&&clear(p))WAYPOINTS.push(p);}
}
// Courtyard links and footways are adapted for playability, and are not named public roads.
for(let z=-55;z<=55;z+=11)for(let x=-55;x<=55;x+=11){const p={x,z};const insideYard=BUILDINGS.some(b=>b.kind==='home'&&Math.abs(b.x-x)<7.5&&Math.abs(b.z-z)<7.5);if(clear(p)&&!insideYard)WAYPOINTS.push(p);}
