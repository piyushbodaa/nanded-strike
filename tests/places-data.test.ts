import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PLACES } from '../lib/places';

type Candidate = {sourceId:string;status:string;duplicateOf?:string;latitude?:number;longitude?:number};
type Source = {osmSha256:string;raw:{overture:{features:{id:string;geometry:{coordinates:number[]};properties:{confidence?:number}}[]}};reconciliation:Candidate[]};
const source = JSON.parse(readFileSync(new URL('../public/place-source.json',import.meta.url),'utf8')) as Source;
const reference = JSON.parse(readFileSync(new URL('../public/place-reference.json',import.meta.url),'utf8')) as {counts:{candidates:number;places:number;dispositions:Record<string,number>}};
const candidates = new Map(source.reconciliation.map(candidate=>[candidate.sourceId,candidate]));

test('every source candidate has a disposition and retained places have unique traceable IDs',()=>{
  assert.equal(new Set(PLACES.map(place=>place.id)).size,PLACES.length);
  assert.equal(candidates.size,source.reconciliation.length);
  assert.equal(reference.counts.places,PLACES.length);
  assert.equal(reference.counts.candidates,source.reconciliation.length);
  assert.equal(Object.values(reference.counts.dispositions).reduce((sum,count)=>sum+count,0),source.reconciliation.length);
  const retainedIds=new Set(PLACES.flatMap(place=>place.sourceIds??[]));
  for(const candidate of source.reconciliation) {
    assert.ok(candidate.status,`${candidate.sourceId} has no decision`);
    assert.equal(retainedIds.has(candidate.sourceId),['included','duplicate'].includes(candidate.status),candidate.sourceId);
    if(candidate.status==='duplicate')assert.ok(PLACES.some(place=>place.id===candidate.duplicateOf),`${candidate.sourceId} has a missing duplicate target`);
  }
  for(const place of PLACES)for(const id of place.sourceIds??[])assert.ok(candidates.has(id),`${place.name} has no source record`);
});

test('retained positions stay in the source bounds and Overture positions and scores are not invented',()=>{
  const overture=new Map(source.raw.overture.features.map(feature=>[`overture:${feature.id}`,feature]));
  for(const place of PLACES) {
    assert.ok(place.latitude>=19.1678&&place.latitude<=19.1808,place.name);
    assert.ok(place.longitude>=77.3018&&place.longitude<=77.3204,place.name);
    assert.ok(Number.isFinite(place.x)&&Number.isFinite(place.z),place.name);
    assert.ok(place.sourceUrl.startsWith('https://')||place.sourceUrl.startsWith('http://'),place.name);
    if(place.source==='overture') {
      const original=overture.get(place.sourceIds![0]);
      assert.ok(original,place.name);
      assert.deepEqual([place.longitude,place.latitude],original.geometry.coordinates,place.name);
      assert.equal(place.confidence,original.properties.confidence,place.name);
      assert.equal(place.verification,'listed',place.name);
    }
  }
});

test('known location conflicts and reported closures remain in audit instead of active places',()=>{
  for(const id of ['overture:eadaaebf-be0e-43a1-8a1b-0348d12a89a5','overture:e3329cd0-5933-49ac-af12-b90018562024','overture:8f67cb21-8824-4dbf-a87c-a78ed613dfb4','overture:c6e7e579-e81d-4cf4-90db-eefcc79b0642']) {
    assert.equal(candidates.get(id)?.status,'address-coordinate-conflict');
    assert.ok(!PLACES.some(place=>place.sourceIds?.includes(id)));
  }
  assert.equal(candidates.get('overture:bdec0d6d-86dd-402a-9486-534e8b28b801')?.status,'reported-closed');
  assert.ok(!PLACES.some(place=>place.name.toLowerCase().includes('kake di hatti')));
});

test('every custom landmark remains discoverable and merged hotel aliases do not create duplicate places',()=>{
  for(const candidate of source.reconciliation.filter(candidate=>candidate.sourceId.startsWith('landmark:'))) {
    const matches=PLACES.filter(place=>place.sourceIds?.includes(candidate.sourceId));
    assert.equal(matches.length,1,candidate.sourceId);
    assert.equal(matches[0].verification,'photo-reference');
  }
  assert.equal(PLACES.filter(place=>place.name==='Hotel Grand Tulsi').length,1);
  assert.equal(PLACES.filter(place=>place.name==='Amrut Cafe').length,1);
});

test('shared area coordinates are flagged and raw OSM extract provenance matches',()=>{
  const shared=PLACES.filter(place=>place.locationQuality==='shared-coordinate');
  assert.ok(shared.length>0);
  for(const place of shared)assert.ok((place.sharedCoordinateCount??0)>=3,place.name);
  const hash=createHash('sha256').update(readFileSync(new URL('../public/map-source.osm',import.meta.url))).digest('hex');
  assert.equal(source.osmSha256,hash);
});
