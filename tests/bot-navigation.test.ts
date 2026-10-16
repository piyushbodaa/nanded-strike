import test from 'node:test';
import assert from 'node:assert/strict';
import { botLineWalkable, botNavigationStats, findBotPath } from '../lib/bot-navigation';
import { MAP_BOUNDS, type MapPoint } from '../lib/map';
import { LOCATIONS } from '../lib/locations';
import { addPlayer, createMatch, isWalkable, movePlayer, type Input } from '../lib/simulation';

const distance=(a:MapPoint,b:MapPoint)=>Math.hypot(a.x-b.x,a.z-b.z);

test('every real sector spawn can route to both bomb sites without crossing a building',()=>{
  let checked=0;
  for(const location of LOCATIONS){
    const match=createMatch(1_700_000_000_000,{mode:'classic',locationId:location.id});
    for(const team of ['blue','orange'] as const)for(const start of match.spawns![team])for(const goal of match.classic!.sites){
      const label=`${location.id}/${team}/${goal.id} from ${start.x},${start.z}`;
      const path=findBotPath(start,goal);assert.ok(path.length,label);
      assert.equal(distance(path.at(-1)!,goal),0,label);
      let previous=start,length=0;
      for(const point of path){
        assert.ok(botLineWalkable(previous,point),label);
        const segment=distance(previous,point);length+=segment;
        // An independent check against the actual movement collider at 25 cm
        // intervals catches disagreement between nav rays and player movement.
        const steps=Math.ceil(segment/.25);
        for(let step=0;step<=steps;step++){
          const t=steps?step/steps:0;
          assert.ok(isWalkable(previous.x+(point.x-previous.x)*t,previous.z+(point.z-previous.z)*t),label);
        }
        previous=point;
      }
      assert.ok(length<1200,`${label}: unreasonable detour ${length}`);checked++;
    }
  }
  assert.ok(checked>=300);
  const stats=botNavigationStats();
  assert.ok(stats.cachedNodes<=stats.waypoints);
  assert.ok(stats.cachedEdges<=stats.waypoints*24);
  assert.ok(stats.cachedRoutes<=256);
});

test('a planned street route is traversable using the actual collision movement',()=>{
  for(const locationId of ['bhagya','shrinagar','iib','rcc','workshop']){
    const match=createMatch(1_700_000_000_000,{locationId});
    const player=addPlayer(match,'NAV TEST','orange');
    // This particular slot needs a local corner connector before reaching a road.
    if(locationId==='workshop')Object.assign(player,match.spawns!.orange[7]);
    const goal=createMatch(match.time,{mode:'classic',locationId}).classic!.sites[1];
    const route=findBotPath(player,goal);assert.ok(route.length);
    for(const target of route){
      const limit=Math.ceil(distance(player,target)/.20)+100;
      for(let tick=0;distance(player,target)>.03&&tick<limit;tick++){
        player.yaw=Math.atan2(-(target.x-player.x),-(target.z-player.z));
        const input:Input={forward:1,strafe:0,yaw:player.yaw,pitch:0,shoot:false,reload:false,sprint:false,jump:false,seq:tick};
        movePlayer(match,player,input,Math.min(.05,distance(player,target)/4.8));
      }
      assert.ok(distance(player,target)<.03,`${locationId}: movement stuck near ${target.x},${target.z}`);
    }
    assert.ok(distance(player,goal)<.03);
  }
});

test('local corner connectors work in both directions for the Workshop spawn pocket',()=>{
  const match=createMatch(1_700_000_000_000,{mode:'classic',locationId:'workshop'});
  const pocket=match.spawns!.orange[7],site=match.classic!.sites[0];
  for(const [start,goal] of [[pocket,site],[site,pocket]]){
    const path=findBotPath(start,goal);assert.ok(path.length>1);let previous=start;
    for(const point of path){assert.ok(botLineWalkable(previous,point));previous=point;}
    assert.equal(distance(previous,goal),0);
  }
});

test('navigation caches routes without sharing mutable path objects or growing without bounds',()=>{
  const match=createMatch(1_700_000_000_000,{mode:'classic'}),start=match.spawns!.orange[0],goal=match.classic!.sites[0];
  const route=findBotPath(start,goal),before=botNavigationStats();assert.ok(route.length>1);
  const repeated=findBotPath(start,goal),after=botNavigationStats();
  assert.deepEqual(repeated,route);
  assert.equal(after.segmentChecks,before.segmentChecks);
  assert.equal(after.searches,before.searches);
  route[0].x=Infinity;route.splice(1);
  assert.deepEqual(findBotPath(start,goal),repeated);
  assert.ok(after.cachedRoutes<=256);
});

test('unsafe direct segments and invalid endpoints fail without unbounded searches',()=>{
  const match=createMatch(1_700_000_000_000,{mode:'classic'}),start=match.spawns!.orange[0],goal=match.classic!.sites[0];
  assert.equal(botLineWalkable(start,goal),false,'buildings block the direct spawn-to-site shortcut');
  for(const invalid of [{x:NaN,z:0},{x:0,z:Infinity},{x:MAP_BOUNDS.maxX+10,z:0},{x:-1e15,z:-1e15}]){
    assert.equal(botLineWalkable(start,invalid),false);
    assert.deepEqual(findBotPath(start,invalid),[]);
    assert.deepEqual(findBotPath(invalid,goal),[]);
  }
  assert.deepEqual(findBotPath(start,start),[{...start}]);
});
