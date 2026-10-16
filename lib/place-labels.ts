import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getPlaceLayouts, type PlaceLayout } from './place-layout';
import { PLACE_CATEGORIES } from './places';
import type { MapPoint } from './map';

/** Original map labels, not photographic shopfront reconstructions. Labels for
 * ambiguous/co-located pins remain on the map, never assigned to a guessed facade. */
export function createPlaceLabels(){
 const group=new THREE.Group();group.name='Source-mapped place signs';
 const resources:{dispose():void}[]=[];
 const layouts=getPlaceLayouts().filter(l=>l.buildingId&&!l.photoModel&&l.place.verification!=='photo-reference');
 const byBuilding=new Map<string,PlaceLayout[]>();
 for(const l of layouts){const list=byBuilding.get(l.buildingId!)??[];list.push(l);byBuilding.set(l.buildingId!,list);}
 const signs=[...byBuilding.values()].map(list=>({layout:list[0],names:list.map(l=>l.place.name),categories:[...new Set(list.map(l=>l.place.categoryLabel))],count:list.length}));
 const tiles:{group:THREE.Group;x:number;z:number}[]=[];
 const CELL_W=256,CELL_H=96,COLS=8,ROWS=16,PER_PAGE=COLS*ROWS;
 let triangles=0;
 for(let start=0;start<signs.length;start+=PER_PAGE){
  const page=signs.slice(start,start+PER_PAGE),canvas=document.createElement('canvas');canvas.width=CELL_W*COLS;canvas.height=CELL_H*Math.ceil(page.length/COLS);
  const ctx=canvas.getContext('2d');if(!ctx)continue;
  const batches=new Map<string,{geometries:THREE.BufferGeometry[];x:number;z:number}>();
  for(let i=0;i<page.length;i++){
   const {layout:l,names,categories,count}=page[i],ox=(i%COLS)*CELL_W,oy=Math.floor(i/COLS)*CELL_H;
   const color=PLACE_CATEGORIES.find(c=>c.id===l.place.category)!.color;
   ctx.fillStyle='#172d30';ctx.fillRect(ox,oy,CELL_W,CELL_H);ctx.fillStyle=color;ctx.fillRect(ox+3,oy+3,CELL_W-6,5);
   ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff9e9';
   const title=count===1?names[0]:names.slice(0,2).join(' · ');
   let fontSize=count===1?22:18;
   const font="'Noto Devanagari', 'Noto Sans Devanagari', sans-serif";
   const split=()=>{ctx.font=`700 ${fontSize}px ${font}`;const words=title.split(/\s+/),lines=[''];for(const word of words){const line=lines.length-1;if(ctx.measureText(lines[line]+' '+word).width>238&&lines[line])lines.push(word);else lines[line]+=(lines[line]?' ':'')+word;}return lines;};
   let lines=split();while(lines.length>2&&fontSize>12){fontSize--;lines=split();}
   if(lines.length>2)lines=[lines[0],lines[1].slice(0,-2)+'…'];
   lines.forEach((line,index)=>ctx.fillText(line,ox+128,oy+(lines.length===1?37:27+index*24),238));
   ctx.fillStyle=color;ctx.font=`500 11px ${font}`;
   ctx.fillText(count>2?`${count} PLACES · SEE PLACES MAP`:categories.join(' · ').toUpperCase(),ox+128,oy+69,238);
   ctx.fillStyle='#b8cbc8';ctx.font=`500 9px ${font}`;ctx.fillText('MAP LISTING · ILLUSTRATIVE SIGN',ox+128,oy+84,238);
   const width=Math.min(l.width,6),height=width*.32;
   const geo=new THREE.PlaneGeometry(width,height),uv=geo.getAttribute('uv');
   for(let v=0;v<uv.count;v++)uv.setXY(v,(ox+2+uv.getX(v)*(CELL_W-4))/canvas.width,1-(oy+2+(1-uv.getY(v))*(CELL_H-4))/canvas.height);
   geo.rotateY(l.yaw);geo.translate(l.x,Math.max(height/2+.3,Math.min(l.y,l.buildingHeight-height/2-.15)),l.z);
   const tx=Math.floor(l.x/100),tz=Math.floor(l.z/100),key=`${tx},${tz}`;
   let batch=batches.get(key);if(!batch){batch={geometries:[],x:(tx+.5)*100,z:(tz+.5)*100};batches.set(key,batch);}batch.geometries.push(geo);
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;resources.push(texture);
  const material=new THREE.MeshBasicMaterial({map:texture,side:THREE.FrontSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});resources.push(material);
  for(const batch of batches.values()){
   const geometry=mergeGeometries(batch.geometries);batch.geometries.forEach(g=>g.dispose());if(!geometry)continue;
   geometry.computeBoundingSphere();resources.push(geometry);triangles+=(geometry.index?.count??0)/3;
   const tile=new THREE.Group();tile.add(new THREE.Mesh(geometry,material));group.add(tile);tiles.push({group:tile,x:batch.x,z:batch.z});
  }
 }
 return {group,stats:{listedPlaces:getPlaceLayouts().length,frontagePlaces:layouts.length,frontageSigns:signs.length,signMeshes:tiles.length,signTriangles:triangles},update(p:MapPoint){for(const tile of tiles)tile.group.visible=Math.hypot(tile.x-p.x,tile.z-p.z)<220;},dispose(){for(const resource of resources)resource.dispose();}};
}
