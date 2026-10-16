import test from 'node:test';
import assert from 'node:assert/strict';
import { raySolid,touchesSolid,type Solid } from '../lib/geometry';
import { SpatialGrid } from '../lib/spatial';
const diamond:Solid={x:0,z:0,w:2,d:2,h:4,polygon:[{x:-1,z:0},{x:0,z:-1},{x:1,z:0},{x:0,z:1}]};
test('mapped polygon collision keeps empty bounding-box corners walkable',()=>{
 assert.equal(touchesSolid(.9,.9,diamond,.1),false);
 assert.equal(touchesSolid(.45,.45,diamond,.1),true);
 assert.equal(touchesSolid(0,1.1,diamond,.2),true);
});
test('hitscan uses actual footprint edges and building height',()=>{
 assert.ok(Math.abs(raySolid(-3,1,.9,1,0,0,diamond)-2.9)<1e-6);
 assert.equal(raySolid(-3,5,0,1,0,0,diamond),Infinity);
 assert.equal(raySolid(-3,1,1.1,1,0,0,diamond),Infinity);
 assert.ok(raySolid(-3,1,1.1,1,0,0,diamond,.2)<3);
});
test('spatial ray query retains crossed and boundary-touching footprints',()=>{
 const boxes=[diamond,{x:47.9,z:48.1,w:.3,d:.3,h:5},{x:500,z:500,w:5,d:5,h:2}];
 const grid=new SpatialGrid(boxes,24);
 const candidates=grid.along(-48,-48,Math.SQRT1_2,Math.SQRT1_2,150,.4);
 assert.ok(candidates.includes(boxes[1]));assert.ok(!candidates.includes(boxes[2]));
 assert.ok(grid.around(.9,.9,.4).includes(diamond));
});
