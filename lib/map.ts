/** Actual Nanded street centre-lines and building footprints, at one metre per unit.
 * OSM / Overture / Google Open Buildings. Estimated heights and road widths.
 * Inspect provenance and the unchanged geographic source at /map-reference.json. */
import data from './geodata.json';
import { LOCATIONS, DEFAULT_LOCATION_ID } from './locations';
export { LOCATIONS, DEFAULT_LOCATION_ID, LOCATION } from './locations';
export type MapPoint = { x:number; z:number };
export type Collider = MapPoint & { w:number; d:number; h:number; polygon?:MapPoint[] };
export type Road = {id:string;osmId:string;name:string;kind:string;width:number;points:MapPoint[]};
export type Building = Collider & {id:string;polygon:MapPoint[];name:string;color:string;accent:string;kind:'home'|'shop'|'apartment';front:number;label:string};
export const MAP_BOUNDS=data.bounds;
export const ROADS:Road[]=data.roads;
const palette=['#e3dfd3','#d0d8d3','#d9d2c7','#cbd4dc','#ddd9c5','#d0c5ba'];
export const BUILDINGS:Building[]=data.buildings.map((b,i)=>({id:b.id,x:b.x,z:b.z,w:b.w,d:b.d,h:b.h,polygon:b.points.map(([x,z])=>({x,z})),name:b.name??'',color:palette[i%palette.length],accent:'#627f85',kind:'home',front:1,label:b.name??''}));
export const SURFACES:{id:string;name:string;kind:string;points:MapPoint[]}[]=data.surfaces;
export const COMPOUND_WALLS:Collider[]=[];
export const COVER:(Collider&{kind:'crate'|'barrels'|'cart'|'planter'|'car'|'barrier'})[]=[];
export const UTILITY_POLES:MapPoint[]=[];
export const LAMP_POLES:MapPoint[]=[];
export const PLANT_POTS:MapPoint[]=[];
export const COLLIDERS:Collider[]=BUILDINGS;
export const WAYPOINTS:MapPoint[]=data.waypoints;
const origin=LOCATIONS.find(l=>l.id===DEFAULT_LOCATION_ID)!;
function closest(x:number,z:number,count=4) {return [...WAYPOINTS].sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z)).slice(0,count);}
export const SPAWNS={blue:closest(origin.x-28,origin.z-18),orange:closest(origin.x+28,origin.z+18)};
export const SPAWN_YAWS={blue:origin.yaw,orange:origin.yaw+Math.PI};
export function roadDistance(p:MapPoint) {
 let best=Infinity;
 for(const r of ROADS)for(let i=1;i<r.points.length;i++) {
  const a=r.points[i-1],b=r.points[i],dx=b.x-a.x,dz=b.z-a.z;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
  best=Math.min(best,Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz)-r.width/2);
 }
 return best;
}
