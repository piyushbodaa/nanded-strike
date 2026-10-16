// Real HTTP objective journey; no clock injection, database edits or player teleportation.
// Run: TEST_URL=https://your-deployment.vercel.app node --import tsx tests/classic-objective-browser.mjs
// PLAN_ONLY=1 performs the same collision-checked route planning without any HTTP requests.
import assert from 'node:assert/strict';
import { WAYPOINTS } from '../lib/map.ts';
import { addPlayer, createMatch, isWalkable } from '../lib/simulation.ts';

const baseURL=(process.env.TEST_URL||process.env.BASE_URL||'http://127.0.0.1:5175').replace(/\/$/,'');
const locationId=process.env.TEST_LOCATION||'bhagya';
const started=Date.now(),deadline=started+100_000;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const key=point=>`${Math.floor(point.x/30)},${Math.floor(point.z/30)}`;
const buckets=new Map();
for(const [index,point]of WAYPOINTS.entries()){
  const cell=key(point);if(!buckets.has(cell))buckets.set(cell,[]);buckets.get(cell).push(index);
}
function clearLine(a,b){
  const count=Math.ceil(distance(a,b)/.35);
  for(let step=0;step<=count;step++){
    const t=count?step/count:0;
    if(!isWalkable(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t))return false;
  }
  return true;
}
function route(start,end){
  const nodes=[...WAYPOINTS,{x:start.x,z:start.z},{x:end.x,z:end.z}],origin=nodes.length-2,target=nodes.length-1;
  const open=new Set([origin]),cost=new Map([[origin,0]]),parent=new Map(),visited=new Set();
  while(open.size){
    let current=-1,best=Infinity;
    for(const index of open){const score=cost.get(index)+distance(nodes[index],end);if(score<best){best=score;current=index;}}
    if(current===target){
      const path=[];for(let index=target;index!==undefined;index=parent.get(index))path.push(nodes[index]);
      path.reverse();return path;
    }
    open.delete(current);visited.add(current);
    const point=nodes[current],cellX=Math.floor(point.x/30),cellZ=Math.floor(point.z/30),nearby=[target];
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)nearby.push(...(buckets.get(`${cellX+dx},${cellZ+dz}`)||[]));
    for(const candidate of nearby){
      if(candidate===current||visited.has(candidate))continue;
      const gap=distance(point,nodes[candidate]);if(gap>38||!clearLine(point,nodes[candidate]))continue;
      const nextCost=cost.get(current)+gap;if(nextCost>=(cost.get(candidate)??Infinity))continue;
      parent.set(candidate,current);cost.set(candidate,nextCost);open.add(candidate);
    }
  }
  throw new Error(`No collision-free route in ${locationId}: ${JSON.stringify({start,end,visited:visited.size})}`);
}
const pathLength=path=>path.slice(1).reduce((sum,point,index)=>sum+distance(path[index],point),0);

if(process.env.PLAN_ONLY==='1'){
  const match=createMatch(Date.now(),{mode:'classic',locationId}),blue=addPlayer(match,'ROUTE BLUE','blue'),orange=addPlayer(match,'ROUTE ORANGE','orange');
  const site=match.classic.sites[0];
  for(const player of [blue,orange]){
    const path=route(player,site);
    console.log(JSON.stringify({team:player.team,site:site.id,points:path.length,metres:Number(pathLength(path).toFixed(1)),estimatedSprintSeconds:Number((pathLength(path)/7.2).toFixed(1))}));
  }
  process.exit(0);
}

const sessions=[];
let state;
async function request(payload){
  const response=await fetch(`${baseURL}/api/game`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)});
  const result=await response.json();
  assert.ok(response.ok,`${payload.action} failed: HTTP ${response.status} ${result.error||''}`);
  return result;
}
function idle(session,extra={}){
  return {seq:session.seq++,forward:0,strafe:0,yaw:session.yaw??0,pitch:0,shoot:false,reload:false,sprint:false,jump:false,aim:false,crouch:false,walk:false,secondary:false,interact:false,...extra};
}
async function cycle(extras=new Map()){
  assert.ok(Date.now()<deadline,`Objective test exceeded 100seconds: ${JSON.stringify({phase:state?.classic?.phase,bomb:state?.classic?.bomb?.status,positions:state?.players.map(({id,team,x,z,health})=>({id,team,x,z,health}))})}`);
  const tickStarted=Date.now();
  const results=await Promise.all(sessions.map(session=>request({action:'input',room:session.room,token:session.token,input:idle(session,extras.get(session.playerId))})));
  state=results.map(result=>result.state).sort((a,b)=>b.time-a.time)[0];
  await sleep(Math.max(0,125-(Date.now()-tickStarted)));
  return results;
}

try{
  const host=await request({action:'create',mode:'classic',locationId,name:'OBJECTIVE BLUE'});
  sessions.push({...host,seq:0});
  const guest=await request({action:'join',room:host.room,name:'OBJECTIVE ORANGE'});
  sessions.push({...guest,seq:0});state=guest.state;
  assert.equal(state.mode,'classic');assert.equal(state.classic.phase,'freeze');
  const defender=sessions.find(session=>state.players.find(player=>player.id===session.playerId)?.team==='blue');
  const attacker=sessions.find(session=>state.players.find(player=>player.id===session.playerId)?.team==='orange');
  assert.ok(defender&&attacker);
  await cycle(new Map([[defender.playerId,{buy:'kit'}]]));
  assert.equal(state.players.find(player=>player.id===defender.playerId).defuseKit,true);
  const site=state.classic.sites[0],routes=new Map();
  for(const session of sessions){
    const player=state.players.find(player=>player.id===session.playerId),path=route(player,site);
    routes.set(session.playerId,{path,index:1,metres:pathLength(path),lastPosition:{x:player.x,z:player.z},lastProgress:Date.now()});
    console.log(JSON.stringify({stage:'route',team:player.team,site:site.id,metres:Number(pathLength(path).toFixed(1)),points:path.length}));
  }
  while(state.classic.phase==='freeze')await cycle();
  assert.equal(state.classic.phase,'live');
  for(const navigation of routes.values())navigation.lastProgress=Date.now();
  while(sessions.some(session=>distance(state.players.find(player=>player.id===session.playerId),site)>1.1)){
    const commands=new Map();
    for(const session of sessions){
      const player=state.players.find(candidate=>candidate.id===session.playerId),navigation=routes.get(session.playerId);
      assert.equal(player.health,100,'navigation must remain harmless');
      if(distance(player,site)<=1.1)continue;
      if(distance(player,navigation.lastPosition)>.25){navigation.lastPosition={x:player.x,z:player.z};navigation.lastProgress=Date.now();}
      assert.ok(Date.now()-navigation.lastProgress<5000,`Navigation stuck: ${JSON.stringify({team:player.team,position:{x:player.x,z:player.z},target:navigation.path[navigation.index]})}`);
      while(navigation.index<navigation.path.length-1&&distance(player,navigation.path[navigation.index])<.9)navigation.index++;
      // Shorten the current route only when the actual current position has a clear segment.
      for(let candidate=navigation.path.length-1;candidate>navigation.index;candidate--){
        if(distance(player,navigation.path[candidate])<=38&&clearLine(player,navigation.path[candidate])){navigation.index=candidate;break;}
      }
      const target=navigation.path[navigation.index],gap=distance(player,target);
      session.yaw=Math.atan2(-(target.x-player.x),-(target.z-player.z));
      commands.set(session.playerId,{yaw:session.yaw,forward:Math.min(1,gap/4),sprint:true});
    }
    await cycle(commands);assert.equal(state.classic.phase,'live','round must stay live through navigation');
  }
  await cycle();
  console.log(JSON.stringify({stage:'arrived',elapsedSeconds:Number(((Date.now()-started)/1000).toFixed(1)),site:site.id}));
  while(state.classic.bomb.status!=='planted'){
    await cycle(new Map([[attacker.playerId,{interact:true}]]));
    assert.equal(state.classic.phase,'live','planting must finish before the round deadline');
  }
  assert.equal(state.classic.bomb.siteId,site.id);
  const plantedViews=await cycle();
  assert.ok(plantedViews.every(view=>view.state.classic.bomb.status==='planted'),'both independently authenticated sessions must observe the planted bomb');
  const defuseStarted=Date.now();
  while(state.classic.bomb.status!=='defused'){
    await cycle(new Map([[defender.playerId,{interact:true}]]));
    assert.notEqual(state.classic.bomb.status,'exploded','defuse must finish before detonation');
  }
  const defusedViews=await cycle();
  assert.ok(Date.now()-defuseStarted>=4900,'defuse cannot bypass the five-second kit timer');
  assert.ok(defusedViews.every(view=>view.state.classic.bomb.status==='defused'&&view.state.scores.blue===1));
  assert.equal(state.classic.roundWinner,'blue');assert.equal(state.classic.phase,'over');
  assert.ok(state.events.some(event=>event.type==='plant'));assert.ok(state.events.some(event=>event.type==='defuse'));
  console.log(JSON.stringify({result:'passed',baseURL,site:site.id,elapsedSeconds:Number(((Date.now()-started)/1000).toFixed(1)),roundWinner:state.classic.roundWinner,score:state.scores,players:state.players.length}));
}finally{
  await Promise.allSettled(sessions.map(session=>request({action:'leave',room:session.room,token:session.token})));
}
