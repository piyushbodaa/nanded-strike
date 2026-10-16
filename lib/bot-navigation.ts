import { COLLIDERS, MAP_BOUNDS, WAYPOINTS, type MapPoint } from './map';
import { raySolid, touchesSolid } from './geometry';
import { SpatialGrid } from './spatial';

// Keep the simulation's 0.36 m player footprint without importing simulation
// (the simulation imports bot AI). Navigation remains entirely on sourced roads.
const RADIUS = .36;
const CELL = 48, NEIGHBOR_RADIUS = 48, MAX_NEIGHBORS = 24;
const CONNECTOR_RADIUS = 144, MAX_CONNECTORS = 8, MAX_CANDIDATES = 48;
const CACHE_LIMIT = 256;
const solids = new SpatialGrid(COLLIDERS.filter(solid => solid.h > .04));
const distance = (a:MapPoint,b:MapPoint) => Math.hypot(a.x-b.x,a.z-b.z);
const finitePoint = (p:MapPoint) => Number.isFinite(p.x) && Number.isFinite(p.z);
const inBounds = (p:MapPoint) => finitePoint(p) && p.x >= MAP_BOUNDS.minX+RADIUS && p.x <= MAP_BOUNDS.maxX-RADIUS && p.z >= MAP_BOUNDS.minZ+RADIUS && p.z <= MAP_BOUNDS.maxZ-RADIUS;
let segmentChecks = 0, searches = 0, expandedNodes = 0;

/** Swept player footprint, not a sight ray: thin walls and diagonal corners block it. */
export function botLineWalkable(start:MapPoint,goal:MapPoint):boolean {
  segmentChecks++;
  if(!inBounds(start)||!inBounds(goal))return false;
  const length=distance(start,goal);
  if(length<1e-7)return !solids.around(start.x,start.z,RADIUS).some(solid=>touchesSolid(start.x,start.z,solid,RADIUS));
  const dx=(goal.x-start.x)/length,dz=(goal.z-start.z)/length;
  return !solids.along(start.x,start.z,dx,dz,length,RADIUS).some(solid=>
    touchesSolid(start.x,start.z,solid,RADIUS)||touchesSolid(goal.x,goal.z,solid,RADIUS)||
    raySolid(start.x,.001,start.z,dx,0,dz,solid,RADIUS)<=length+1e-7);
}

type Edge = { id:number; cost:number };
type Connector = Edge & { path:MapPoint[] };
const cells = new Map<string,number[]>();
const adjacency = new Map<number,Edge[]>();
const checkedEdges = new Map<string,boolean>();
const pointValidity = new Map<number,boolean>();
const routes = new Map<string,MapPoint[]>();
let indexed = false;

function ensureIndex() {
  if(indexed)return;
  for(let id=0;id<WAYPOINTS.length;id++){
    const point=WAYPOINTS[id],key=`${Math.floor(point.x/CELL)},${Math.floor(point.z/CELL)}`;
    const bucket=cells.get(key);if(bucket)bucket.push(id);else cells.set(key,[id]);
  }
  indexed=true;
}
function validNode(id:number) {
  let valid=pointValidity.get(id);
  if(valid===undefined){valid=botLineWalkable(WAYPOINTS[id],WAYPOINTS[id]);pointValidity.set(id,valid);}
  return valid;
}
function candidates(point:MapPoint,radius:number):Edge[] {
  ensureIndex();const result:Edge[]=[];
  for(let x=Math.floor((point.x-radius)/CELL);x<=Math.floor((point.x+radius)/CELL);x++)
    for(let z=Math.floor((point.z-radius)/CELL);z<=Math.floor((point.z+radius)/CELL);z++)
      for(const id of cells.get(`${x},${z}`)??[]){
        const cost=distance(point,WAYPOINTS[id]);if(cost<=radius)result.push({id,cost});
      }
  return result.sort((a,b)=>a.cost-b.cost||a.id-b.id);
}
function neighbors(id:number):Edge[] {
  const cached=adjacency.get(id);if(cached)return cached;
  const edges:Edge[]=[];
  for(const candidate of candidates(WAYPOINTS[id],NEIGHBOR_RADIUS).filter(other=>other.id!==id).slice(0,MAX_NEIGHBORS)){
    if(!validNode(candidate.id))continue;
    const key=id<candidate.id?`${id}:${candidate.id}`:`${candidate.id}:${id}`;
    let clear=checkedEdges.get(key);
    if(clear===undefined){clear=botLineWalkable(WAYPOINTS[id],WAYPOINTS[candidate.id]);checkedEdges.set(key,clear);}
    if(clear)edges.push(candidate);
  }
  adjacency.set(id,edges);return edges;
}
function connectors(point:MapPoint):Connector[] {
  const result:Connector[]=[],nearby=candidates(point,CONNECTOR_RADIUS).slice(0,MAX_CANDIDATES).filter(candidate=>validNode(candidate.id));
  for(const candidate of nearby){
    if(botLineWalkable(point,WAYPOINTS[candidate.id]))result.push({...candidate,path:[WAYPOINTS[candidate.id]]});
    if(result.length===MAX_CONNECTORS)break;
  }
  return result.length?result:localConnector(point,nearby);
}
class MinHeap {
  private values:{id:number;priority:number}[]=[];
  get length(){return this.values.length;}
  push(value:{id:number;priority:number}) {
    let index=this.values.length;this.values.push(value);
    while(index>0){const parent=(index-1)>>1;if(this.values[parent].priority<=value.priority)break;this.values[index]=this.values[parent];index=parent;}
    this.values[index]=value;
  }
  pop() {
    const first=this.values[0],last=this.values.pop()!;
    if(this.values.length){let index=0;
      while(index*2+1<this.values.length){let child=index*2+1;if(child+1<this.values.length&&this.values[child+1].priority<this.values[child].priority)child++;
        if(last.priority<=this.values[child].priority)break;this.values[index]=this.values[child];index=child;}
      this.values[index]=last;
    }
    return first;
  }
}
/** Some authored spawn slots sit around a corner from the street center-line.
 * A small, bounded local search gets out of that pocket, then rejoins the road
 * graph. It is only used when every direct road connector is obstructed.
 */
function localConnector(start:MapPoint,targets:Edge[]):Connector[] {
  if(!targets.length||!botLineWalkable(start,start))return [];
  const step=.75,radius=32,width=radius*2+1,count=width*width,center=radius*width+radius;
  const point=(id:number):MapPoint=>({x:start.x+(id%width-radius)*step,z:start.z+(Math.floor(id/width)-radius)*step});
  const costs=new Float64Array(count).fill(Infinity),previous=new Int32Array(count).fill(-1),closed=new Uint8Array(count),queue=new MinHeap();
  costs[center]=0;queue.push({id:center,priority:0});let visits=0;
  while(queue.length&&visits<2048){
    const {id}=queue.pop();if(closed[id])continue;closed[id]=1;visits++;
    const position=point(id);
    for(const target of [...targets].sort((a,b)=>distance(position,WAYPOINTS[a.id])-distance(position,WAYPOINTS[b.id])).slice(0,3)){
      if(!botLineWalkable(position,WAYPOINTS[target.id]))continue;
      const path:MapPoint[]=[WAYPOINTS[target.id]];
      for(let node=id;node!==center;node=previous[node])path.push(point(node));
      path.reverse();return [{id:target.id,cost:costs[id]+distance(position,WAYPOINTS[target.id]),path}];
    }
    const x=id%width,z=Math.floor(id/width);
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
      if((dx===0&&dz===0)||x+dx<0||x+dx>=width||z+dz<0||z+dz>=width)continue;
      const next=id+dx+dz*width,cost=costs[id]+Math.hypot(dx,dz)*step;
      if(closed[next]||cost>=costs[next]||!botLineWalkable(position,point(next)))continue;
      costs[next]=cost;previous[next]=id;
      queue.push({id:next,priority:cost+distance(point(next),WAYPOINTS[targets[0].id])});
    }
  }
  return [];
}
function copy(path:MapPoint[]) {return path.map(point=>({...point}));}
function cache(key:string,path:MapPoint[]) {
  if(routes.size>=CACHE_LIMIT)routes.delete(routes.keys().next().value!);
  routes.set(key,copy(path));return path;
}

/** Collision-checked A* over nearby road waypoints. [] means no safe route.
 * The returned route excludes start and ends at the exact requested goal.
 * Call on a changed goal or a stuck bot, not each simulation frame.
 */
export function findBotPath(start:MapPoint,goal:MapPoint):MapPoint[] {
  if(!inBounds(start)||!inBounds(goal))return [];
  const key=`${start.x},${start.z}:${goal.x},${goal.z}`,cached=routes.get(key);
  if(cached)return copy(cached);
  if(botLineWalkable(start,goal))return cache(key,[{...goal}]);
  const starts=connectors(start),ends=connectors(goal);
  if(!starts.length||!ends.length)return cache(key,[]);
  searches++;
  const endCosts=new Map(ends.map(edge=>[edge.id,edge.cost]));
  const costs=new Float64Array(WAYPOINTS.length).fill(Infinity),previous=new Int32Array(WAYPOINTS.length).fill(-1),closed=new Uint8Array(WAYPOINTS.length);
  const queue=new MinHeap();
  for(const edge of starts){costs[edge.id]=edge.cost;queue.push({id:edge.id,priority:edge.cost+distance(WAYPOINTS[edge.id],goal)});}
  let end=-1,best=Infinity,expanded=0;
  while(queue.length&&expanded<WAYPOINTS.length){
    const current=queue.pop();if(current.priority>=best)break;if(closed[current.id])continue;
    closed[current.id]=1;expanded++;
    const last=endCosts.get(current.id);
    if(last!==undefined&&costs[current.id]+last<best){best=costs[current.id]+last;end=current.id;}
    for(const edge of neighbors(current.id)){
      const cost=costs[current.id]+edge.cost;if(closed[edge.id]||cost>=costs[edge.id])continue;
      costs[edge.id]=cost;previous[edge.id]=current.id;queue.push({id:edge.id,priority:cost+distance(WAYPOINTS[edge.id],goal)});
    }
  }
  expandedNodes+=expanded;
  if(end<0)return cache(key,[]);
  const graphPath:number[]=[];
  for(let id=end;id>=0;id=previous[id])graphPath.push(id);
  graphPath.reverse();
  const entry=starts.find(connector=>connector.id===graphPath[0])!,exit=ends.find(connector=>connector.id===end)!;
  const raw:MapPoint[]=[...entry.path,...graphPath.slice(1).map(id=>WAYPOINTS[id]),...exit.path.slice(0,-1).reverse(),{...goal}];
  // Bounded look-ahead removes zigzags without testing all path pairs.
  const path:MapPoint[]=[];let from=start,index=0;
  while(index<raw.length){let next=Math.min(raw.length-1,index+6);
    while(next>index&&!botLineWalkable(from,raw[next]))next--;
    const point=raw[next];if(distance(from,point)>1e-6)path.push({...point});from=point;index=next+1;
  }
  return cache(key,path.length?path:[{...goal}]);
}

/** Bounded-cache counters used by navigation regressions and performance checks. */
export function botNavigationStats() {
  return {waypoints:WAYPOINTS.length,cachedNodes:adjacency.size,cachedEdges:checkedEdges.size,cachedRoutes:routes.size,segmentChecks,searches,expandedNodes};
}
