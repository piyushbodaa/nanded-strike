import test from 'node:test';
import assert from 'node:assert/strict';
import { getPlaceLayouts, placeViewpoint } from '../lib/place-layout';
import { isWalkable } from '../lib/simulation';
import { PLACES } from '../lib/places';
import { LANDMARKS } from '../lib/landmark-data';

test('uncertain and shared source positions are never assigned a building facade',()=>{
 for(const layout of getPlaceLayouts()){
  const p=layout.place;
  if(['shared-coordinate','area-centroid'].includes(p.locationQuality??'')||(p.source==='overture'&&p.confidence!==undefined&&p.confidence<.6))assert.equal(layout.placement,'map-pin',p.name);
 }
});

test('every directory visit starts outside solid buildings with a clear forward approach',()=>{
 for(const place of PLACES){
  const view=placeViewpoint(place.id);assert.ok(view,`Missing approach: ${place.name}`);
  assert.ok(isWalkable(view.x,view.z),`Blocked approach: ${place.name}`);
  assert.ok(Number.isFinite(view.yaw)&&Number.isFinite(view.pitch),place.name);
  for(let d=0;d<=2;d+=.25)assert.ok(isWalkable(view.x-Math.sin(view.yaw)*d,view.z-Math.cos(view.yaw)*d),`Forward approach blocked: ${place.name}`);
 }
});

test('photo-referenced places use their inspected landmark approach rather than a centroid',()=>{
 for(const landmark of LANDMARKS){
  const place=PLACES.find(p=>p.sourceIds?.includes(`landmark:${landmark.id}`));assert.ok(place,landmark.name);
  const view=placeViewpoint(place.id);assert.ok(view);assert.equal(view.x,landmark.viewpoint.x);assert.equal(view.z,landmark.viewpoint.z);
 }
});
