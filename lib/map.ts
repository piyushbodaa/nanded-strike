/** Actual Nanded street centre-lines and building footprints, at one metre per unit.
 * OSM / Overture / Google Open Buildings. Estimated heights and road widths.
 * Inspect provenance and the unchanged geographic source at /map-reference.json. */
import data from './geodata.json';
import { DEFAULT_LOCATION_ID } from './locations';
import SPAWN_LAYOUTS from './spawn-layouts.json';
import { LANDMARKS, LANDMARK_COLLIDERS } from './landmark-data';
import { DISTRICT_SUPERSEDED_FOOTPRINTS } from './district-landmark-data';
import { touchesSolid } from './geometry';
export { LOCATIONS, DEFAULT_LOCATION_ID, LOCATION } from './locations';
export type MapPoint = { x:number; z:number };
export type Collider = MapPoint & { w:number; d:number; h:number; polygon?:MapPoint[] };
export type Road = {id:string;osmId:string;name:string;kind:string;width:number;points:MapPoint[]};
export type Building = Collider & {id:string;polygon:MapPoint[];name:string;color:string;accent:string;kind:'home'|'shop'|'apartment';front:number;label:string};
export const MAP_BOUNDS=data.bounds;
export const ROADS:Road[]=data.roads;
const palette=['#e3dfd3','#d0d8d3','#d9d2c7','#cbd4dc','#ddd9c5','#d0c5ba'];
const landmarkBuildings=new Map(LANDMARKS.filter(l=>l.buildingId).map(l=>[l.buildingId,l]));
// The two original Amrut forecourt roof polygons are preserved in geodata, but
// newer inspected photographs show this frontage rebuilt. See source override notes.
export const BUILDINGS:Building[]=data.buildings.filter(b=>!DISTRICT_SUPERSEDED_FOOTPRINTS.includes(b.id)).map((b,i)=>({id:b.id,x:b.x,z:b.z,w:b.w,d:b.d,h:landmarkBuildings.get(b.id)?.height??b.h,polygon:b.points.map(([x,z])=>({x,z})),name:b.name??'',color:landmarkBuildings.get(b.id)?.wallColor??palette[i%palette.length],accent:'#627f85',kind:'home',front:1,label:b.name??''}));
export const SURFACES:{id:string;name:string;kind:string;points:MapPoint[]}[]=data.surfaces;
export const COMPOUND_WALLS:Collider[]=[];
export const COVER:(Collider&{kind:'crate'|'barrels'|'cart'|'planter'|'car'|'barrier'})[]=[];
export const UTILITY_POLES:MapPoint[]=[];
export const LAMP_POLES:MapPoint[]=[];
export const PLANT_POTS:MapPoint[]=[];
export const COLLIDERS:Collider[]=[...BUILDINGS,...LANDMARK_COLLIDERS];
// Landmark piers change walkability, never the underlying source street lines.
export const WAYPOINTS:MapPoint[]=data.waypoints.filter(p=>!LANDMARK_COLLIDERS.some(c=>touchesSolid(p.x,p.z,c,.48)));
// Prevalidated road clusters: eight slots/team, 80–160m separation, building occlusion.
export const SPAWNS=SPAWN_LAYOUTS[DEFAULT_LOCATION_ID].spawns;
export const SPAWN_YAWS=SPAWN_LAYOUTS[DEFAULT_LOCATION_ID].spawnYaws;
export function roadDistance(p:MapPoint) {
 let best=Infinity;
 for(const r of ROADS)for(let i=1;i<r.points.length;i++) {
  const a=r.points[i-1],b=r.points[i],dx=b.x-a.x,dz=b.z-a.z;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
  best=Math.min(best,Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz)-r.width/2);
 }
 return best;
}
