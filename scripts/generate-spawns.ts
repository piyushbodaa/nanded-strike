// Deterministic layouts derived from the unchanged mapped roads/building footprints.
// Every cross-team pair has intervening building geometry at eye height.
import {writeFileSync} from 'node:fs';
import {COLLIDERS,WAYPOINTS,MAP_BOUNDS} from '../lib/map';
import {LOCATIONS} from '../lib/locations';
import {SpatialGrid} from '../lib/spatial';
import {raySolid,touchesSolid} from '../lib/geometry';
type Point={x:number,z:number};const cg=new SpatialGrid(COLLIDERS);const dist=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
function walk(p:Point){return p.x>MAP_BOUNDS.minX+.4&&p.x<MAP_BOUNDS.maxX-.4&&p.z>MAP_BOUNDS.minZ+.4&&p.z<MAP_BOUNDS.maxZ-.4&&!cg.around(p.x,p.z,.42).some(c=>touchesSolid(p.x,p.z,c,.42));}
function clear(a:Point,b:Point,padding=.42,height=.6){const d=dist(a,b);const dx=(b.x-a.x)/d,dz=(b.z-a.z)/d;return !cg.along(a.x,a.z,dx,dz,d,padding).some(c=>raySolid(a.x,height,a.z,dx,0,dz,c,padding)<d);}
function slots(base:Point,yaw:number){const out:Point[]=[];for(const back of [0,3,6,-3,-6])for(const side of [0,-2.8,2.8,-5.6,5.6]){const p={x:base.x+Math.sin(yaw)*back+Math.cos(yaw)*side,z:base.z+Math.cos(yaw)*back-Math.sin(yaw)*side};const ahead={x:p.x-Math.sin(yaw)*6,z:p.z-Math.cos(yaw)*6};if(walk(p)&&walk(ahead)&&clear(p,ahead)&&out.every(q=>dist(p,q)>2.5))out.push(p);if(out.length===8)return out;}return null;}
type Layout={spawns:{blue:Point[];orange:Point[]};spawnYaws:{blue:number;orange:number}};
const output:Record<string,Layout>={};
for(const l of LOCATIONS){let chosen:Layout|null=null;const blueBases=[l,...WAYPOINTS.filter(p=>dist(p,l)<14).sort((a,b)=>dist(a,l)-dist(b,l))];for(const blue of blueBases){if(chosen)break;for(const turn of [0,.25,-.25,.5,-.5,Math.PI,-Math.PI/2,Math.PI/2]){const yaw=l.yaw+turn,b=slots(blue,yaw);if(!b)continue;const target={x:l.x-Math.sin(l.yaw)*110,z:l.z-Math.cos(l.yaw)*110};const candidates=WAYPOINTS.filter(p=>dist(p,blue)>97&&dist(p,blue)<140).sort((a,b)=>dist(a,target)-dist(b,target));for(const orange of candidates){if(clear(blue,orange,0,1.8))continue;const facing=Math.atan2(-(blue.x-orange.x),-(blue.z-orange.z));for(const offset of [0,.4,-.4,.8,-.8,Math.PI/2,-Math.PI/2,Math.PI,...Array.from({length:16},(_,i)=>i*Math.PI/8)]){const oy=facing+offset,o=slots(orange,oy);if(!o)continue;if(b.every(a=>o.every(z=>dist(a,z)>=80&&dist(a,z)<=160&&!clear(a,z,0,1.8)))){chosen={spawns:{blue:b,orange:o},spawnYaws:{blue:yaw,orange:oy}};break;}}if(chosen)break;}if(chosen)break;}}if(!chosen)throw new Error('No safe layout '+l.id);output[l.id]=chosen;console.log(l.id,'dist',dist(chosen.spawns.blue[0],chosen.spawns.orange[0]).toFixed(1),'offset',dist(chosen.spawns.blue[0],l).toFixed(1));}
writeFileSync(new URL('../lib/spawn-layouts.json',import.meta.url),JSON.stringify(output,null,2));
