import test from 'node:test';
import assert from 'node:assert/strict';
import { LANDMARKS } from '../lib/landmark-data';
import { LOCATIONS } from '../lib/locations';
import { BUILDINGS } from '../lib/map';
import geodata from '../lib/geodata.json';
import { isWalkable } from '../lib/simulation';

test('the Kaman twin openings and open college gate remain traversable',()=>{
  for(const landmark of LANDMARKS.filter(l=>!l.buildingId))for(const lane of landmark.id==='bhagya-kaman'?[-3.7,3.7]:[0]) {
    for(let along=-3;along<=3;along+=.1) {
      const x=landmark.x+lane*Math.cos(landmark.yaw)+along*Math.sin(landmark.yaw);
      const z=landmark.z-lane*Math.sin(landmark.yaw)+along*Math.cos(landmark.yaw);
      assert.ok(isWalkable(x,z),`${landmark.id} passage blocked at ${x},${z}`);
    }
  }
});

test('the Kaman memorial blocks movement while both landmark viewpoints have clear approaches',()=>{
  const kaman=LANDMARKS.find(l=>l.id==='bhagya-kaman')!;
  assert.equal(isWalkable(kaman.x,kaman.z),false);
  for(const id of ['bhagya','baba']) {
    const location=LOCATIONS.find(l=>l.id===id)!;
    for(let distance=0;distance<=3;distance+=.1)assert.ok(isWalkable(location.x-Math.sin(location.yaw)*distance,location.z-Math.cos(location.yaw)*distance),`${id} view blocked`);
  }
});

test('coaching landmarks retain mapped footprints and have reachable road viewpoints',()=>{
  for(const landmark of LANDMARKS.filter(l=>l.buildingId)) {
    const location=LOCATIONS.find(l=>l.id===landmark.locationId)!;
    const building=BUILDINGS.find(b=>b.id===landmark.buildingId)!;
    const source=geodata.buildings.find(b=>b.id===landmark.buildingId)!;
    assert.deepEqual(building.polygon,source.points.map(([x,z])=>({x,z})),`${landmark.id} footprint changed`);
    assert.ok(location,`${landmark.id} needs a selectable starting sector`);
    const view=landmark.viewpoint;
    assert.ok(isWalkable(view.x,view.z),`${landmark.id} viewpoint is obstructed`);
    for(let d=0;d<=2;d+=.25)assert.ok(isWalkable(view.x-Math.sin(view.yaw)*d,view.z-Math.cos(view.yaw)*d),`${landmark.id} has no clear approach`);
    assert.equal(isWalkable(landmark.x+Math.sin(landmark.yaw)*.2,landmark.z+Math.cos(landmark.yaw)*.2),false,`${landmark.id} facade must block movement`);
  }
});
