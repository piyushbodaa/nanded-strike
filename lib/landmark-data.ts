/** Photo-observed landmark forms. Coordinates share the map's metre projection.
 * Pillar/gate dimensions and exact frontage offsets are estimates, not survey data.
 * No source photograph is redistributed as a game texture. */
export type LandmarkPoint={x:number;z:number};
export type LandmarkSolid=LandmarkPoint&{w:number;d:number;h:number;polygon:LandmarkPoint[]};
export type Landmark={
 id:string;name:string;locationId:string;x:number;z:number;yaw:number;
 latitude:number;longitude:number;description:string;sourceUrl:string;photoUrl:string;
 modelStatus:'photo-referenced';viewpoint:LandmarkPoint&{yaw:number};
};
export const LANDMARKS:Landmark[]=[
 {
  id:'bhagya-kaman',name:'Bhagya Nagar Kaman',locationId:'bhagya',x:-184.47,z:-325.06,yaw:-.245,
  latitude:19.17722,longitude:77.3093456,modelStatus:'photo-referenced',
  description:'Dark memorial pier, bronze-coloured relief, cream crossbeam and large Marathi lettering, reconstructed from a real place photograph. Dimensions are estimated.',
  sourceUrl:'https://krotravel.com/itinerary/nanded-waghala',
  photoUrl:'https://krotravel.com/storage/public/cities/nanded-waghala/gallery/04_attraction_bhagya-nagar-kaman__ChIJ8QaWYdzX0TsRW8Oay9ckK7Y.webp',
  viewpoint:{x:-187.8,z:-311.5,yaw:-.241},
 },
 {
  id:'yeshwant-entrance',name:'Yeshwant College entrance',locationId:'baba',x:-168,z:502,yaw:Math.PI/2,
  latitude:19.1697908,longitude:77.3095022,modelStatus:'photo-referenced',
  description:'Orange grooved piers, cream Marathi name lintel and geometric metal gates, based on an inspected college photograph. Gate placement along the college frontage and dimensions are approximate.',
  sourceUrl:'https://findmycollege.com/colleges/yeshwant-mahavidyalaya-nanded-13259/gallery',
  photoUrl:'https://content.findmycollege.com/colleges/13259-yeshwant-mahavidyalaya-nanded-infrastructure-1777628300307-e72e3a6a-d37a-458f-b7db-f1de4c91f7ae.jpg',
  viewpoint:{x:-149.32,z:495.35,yaw:1.913},
 },
];
function solid(l:Landmark,x:number,z:number,w:number,d:number,h:number):LandmarkSolid {
 const c=Math.cos(l.yaw),s=Math.sin(l.yaw);
 const polygon=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([xx,zz])=>({x:l.x+(x+xx)*c+(z+zz)*s,z:l.z-(x+xx)*s+(z+zz)*c}));
 const minX=Math.min(...polygon.map(p=>p.x)),maxX=Math.max(...polygon.map(p=>p.x)),minZ=Math.min(...polygon.map(p=>p.z)),maxZ=Math.max(...polygon.map(p=>p.z));
 return {x:(minX+maxX)/2,z:(minZ+maxZ)/2,w:maxX-minX,d:maxZ-minZ,h,polygon};
}
/** Deliberately excludes overhead lintels so the arch passages stay walkable. */
export const LANDMARK_COLLIDERS:LandmarkSolid[]=[
 solid(LANDMARKS[0],0,0,2.8,1.5,5.25),
 solid(LANDMARKS[0],0,.65,3.4,3.2,.3),
 solid(LANDMARKS[0],0,1.25,1.05,.95,1.55),
 solid(LANDMARKS[0],-6,0,.8,1.2,5.5),solid(LANDMARKS[0],6,0,.8,1.2,5.5),
 solid(LANDMARKS[0],-2,1.5,.15,.15,3.9),solid(LANDMARKS[0],2,1.5,.15,.15,3.9),
 solid(LANDMARKS[1],-4.25,0,.92,.92,4.35),solid(LANDMARKS[1],4.25,0,.92,.92,4.35),
 // Open gate leaves lie inside the campus, along the two sides of the entrance.
 solid(LANDMARKS[1],-3.76,-1.8,.1,3.6,1.85),solid(LANDMARKS[1],3.76,-1.8,.1,3.6,1.85),
];
