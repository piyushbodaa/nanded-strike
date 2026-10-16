import { BUILDINGS, COLLIDERS, MAP_BOUNDS, ROADS, WAYPOINTS, type Building, type MapPoint } from './map';
import { insidePolygon, raySolid, touchesSolid } from './geometry';
import { SpatialGrid } from './spatial';
import { PLACES, type Place } from './places';
import { LANDMARKS } from './landmark-data';

const buildingGrid=new SpatialGrid(BUILDINGS,32),solidGrid=new SpatialGrid(COLLIDERS,32);
const distance=(a:MapPoint,b:MapPoint)=>Math.hypot(a.x-b.x,a.z-b.z);
const roadSegments=ROADS.filter(r=>!['steps','footway','path','track'].includes(r.kind)).flatMap(r=>r.points.slice(1).map((b,i)=>({a:r.points[i],b,width:r.width})));
function closestOnSegment(p:MapPoint,a:MapPoint,b:MapPoint) {
 const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
 return {x:a.x+dx*t,z:a.z+dz*t};
}
function nearestStreet(p:MapPoint) {
 let best={x:p.x,z:p.z,distance:Infinity};
 for(const {a,b} of roadSegments){const q=closestOnSegment(p,a,b),d=distance(p,q);if(d<best.distance)best={...q,distance:d};}
 return best;
}
function edgeDistance(p:MapPoint,b:Building){return Math.min(...b.polygon.map((a,i)=>distance(p,closestOnSegment(p,a,b.polygon[(i+1)%b.polygon.length]))));}
export type PlaceLayout={place:Place;buildingId?:string;placement:'footprint'|'near-footprint'|'map-pin';x:number;z:number;y:number;yaw:number;width:number;edgeLength:number;buildingHeight:number;photoModel:boolean;road:MapPoint};

/** A mapped pin can identify a building, but cannot establish the actual shopfront.
 * Frontage direction and sign appearance remain illustrative. Uncertain pins stay pins. */
function layout(place:Place):PlaceLayout {
 const nearby=buildingGrid.around(place.x,place.z,5);
 const inside=nearby.filter(b=>insidePolygon(place.x,place.z,b.polygon)).sort((a,b)=>a.w*a.d-b.w*b.d);
 const scored=nearby.map(b=>({b,d:edgeDistance(place,b)})).sort((a,b)=>a.d-b.d);
 const trusted=!['shared-coordinate','area-centroid'].includes(place.locationQuality??'')&&(place.source!=='overture'||place.confidence===undefined||place.confidence>=.6);
 const contained=trusted?inside[0]:undefined;
 const close=!inside.length&&trusted&&scored[0]?.d<=3&&(!scored[1]||scored[1].d>scored[0].d+2)?scored[0].b:undefined;
 const building=contained??close,road=nearestStreet(place);
 const base:PlaceLayout={place,placement:'map-pin',x:place.x,z:place.z,y:(inside[0]?.h??0)+2.4,yaw:Math.atan2(road.x-place.x,road.z-place.z),width:4.5,edgeLength:4.5,buildingHeight:inside[0]?.h??0,photoModel:false,road};
 if(!building)return base;
 let best:{x:number;z:number;nx:number;nz:number;length:number;score:number}|undefined;
 for(let i=0;i<building.polygon.length;i++){
  const a=building.polygon[i],b=building.polygon[(i+1)%building.polygon.length],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);if(length<2.2)continue;
  const x=(a.x+b.x)/2,z=(a.z+b.z)/2;let nx=dz/length,nz=-dx/length;
  if(insidePolygon(x+nx*.15,z+nz*.15,building.polygon)){nx=-nx;nz=-nz;}
  const street=nearestStreet({x,z}),facing=nx*(street.x-x)+nz*(street.z-z);
  const score=street.distance+(facing<0?100:0)+Math.max(0,3.5-length)*3;
  if(!best||score<best.score)best={x,z,nx,nz,length,score};
 }
 if(!best)return base;
 return {...base,buildingId:building.id,placement:contained?'footprint':'near-footprint',x:best.x+best.nx*.085,z:best.z+best.nz*.085,y:Math.min(building.h-.65,2.95),yaw:Math.atan2(best.nx,best.nz),width:Math.min(6.2,best.length-.3),edgeLength:best.length,buildingHeight:building.h,photoModel:LANDMARKS.some(l=>l.buildingId===building.id)};
}
let cached:PlaceLayout[]|undefined;
export const getPlaceLayouts=()=>cached??=PLACES.map(layout);
export const getPlaceLayout=(id:string)=>getPlaceLayouts().find(l=>l.place.id===id);

export type PlaceView=MapPoint&{yaw:number;pitch:number;distance:number};
const viewCache=new Map<string,PlaceView>();
export function placeViewpoint(id:string):PlaceView|undefined {
 if(viewCache.has(id))return viewCache.get(id);
 const target=getPlaceLayout(id);if(!target)return;
 const safe=(p:MapPoint)=>p.x>MAP_BOUNDS.minX+.5&&p.x<MAP_BOUNDS.maxX-.5&&p.z>MAP_BOUNDS.minZ+.5&&p.z<MAP_BOUNDS.maxZ-.5&&!solidGrid.around(p.x,p.z,.45).some(c=>touchesSolid(p.x,p.z,c,.45));
 const landmark=LANDMARKS.find(l=>target.place.sourceIds?.includes(`landmark:${l.id}`));
 if(landmark&&safe(landmark.viewpoint)){
  const p=landmark.viewpoint,d=distance(p,landmark),view={...p,pitch:Math.atan2((landmark.height??6)*.4-1.58,d),distance:Math.round(distance(p,target.place))};
  viewCache.set(id,view);return view;
 }
 const targetBuilding=BUILDINGS.find(b=>b.id===target.buildingId);
 const candidates=WAYPOINTS.filter(safe).map(p=>({p,d:distance(p,target)})).sort((a,b)=>a.d-b.d).slice(0,64);
 let best:{view:PlaceView;score:number}|undefined;
 for(const {p,d} of candidates){
  if(d<4)continue;
  const yaw=Math.atan2(p.x-target.x,p.z-target.z),dx=-Math.sin(yaw),dz=-Math.cos(yaw);
  if(!safe({x:p.x+dx*2,z:p.z+dz*2}))continue;
  const blocked=solidGrid.along(p.x,p.z,dx,dz,d).some(c=>c!==targetBuilding&&raySolid(p.x,1.58,p.z,dx,0,dz,c)<d-.5);
  const facing=(Math.sin(target.yaw)*(p.x-target.x)+Math.cos(target.yaw)*(p.z-target.z))/d;
  const score=Math.abs(d-17)+(blocked?75:0)+(target.buildingId?Math.max(0,.5-facing)*35:0);
  const view={x:p.x,z:p.z,yaw,pitch:Math.atan2(Math.min(target.y,target.buildingHeight*.4||2.4)-1.58,d),distance:Math.round(distance(p,target.place))};
  if(!best||score<best.score)best={view,score};
 }
 if(!best){const p=candidates[0]?.p;if(!p)return;best={score:0,view:{...p,yaw:Math.atan2(p.x-target.x,p.z-target.z),pitch:0,distance:Math.round(distance(p,target.place))}};}
 viewCache.set(id,best.view);return best.view;
}
