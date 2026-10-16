import test from 'node:test';
import assert from 'node:assert/strict';
import { LANDMARKS } from '../lib/landmark-data';
import { LOCATIONS } from '../lib/locations';
import { isWalkable } from '../lib/simulation';

test('the Kaman twin openings and open college gate remain traversable',()=>{
  for(const landmark of LANDMARKS)for(const lane of landmark.id==='bhagya-kaman'?[-3.7,3.7]:[0]) {
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
