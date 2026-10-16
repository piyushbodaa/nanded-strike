import * as THREE from 'three';
import { BUILDINGS, MAP_BOUNDS, ROADS, SURFACES, type MapPoint } from './map';
import { LOCATIONS } from './locations';
import { createLandmarks } from './landmarks';

const textureCache = new Map<string, THREE.Texture>();
let texturePromise: Promise<void> | undefined;
/** Await real 1K surface assets before presenting the first playable frame. */
export function preloadWorldAssets(): Promise<void> {
  if (!texturePromise) {
    const loader = new THREE.TextureLoader();
    texturePromise = Promise.allSettled(['asphalt_02','plastered_wall_02','concrete_floor_02'].flatMap(id =>
      ['diff','normal','rough'].map(async kind => {
        const key=`${id}_${kind}`;
        if(textureCache.has(key))return;
        const texture=await loader.loadAsync(`/textures/${key}.jpg`);
        texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
        texture.anisotropy=16;
        if(kind==='diff')texture.colorSpace=THREE.SRGBColorSpace;
        textureCache.set(key,texture);
      })
    )).then(results=>{
      const failed=results.find(r=>r.status==='rejected');
      if(failed?.status==='rejected')throw failed.reason;
    }).catch(error=>{texturePromise=undefined;throw error;});
  }
  return texturePromise;
}

type V3=[number,number,number];
type UV=[number,number];
type Batch={positions:number[];normals:number[];uvs:number[];colors:number[]};
type Tile={group:THREE.Group;x:number;z:number;batches:Map<THREE.Material,Batch>};
const TILE=128;

/** Georeferenced Nanded. Source footprint outlines are exact; heights/façades are estimates. */
export function createWorld(scene:THREE.Scene) {
  const root=new THREE.Group();root.name='Nanded — mapped neighbourhoods';scene.add(root);
  scene.background=new THREE.Color('#bed2e1');
  scene.fog=new THREE.Fog('#bed2e1',380,700);
  const resources:{dispose():void}[]=[];
  const tiles=new Map<string,Tile>();
  const materials:THREE.Material[]=[];
  const colorCache=new Map<string,THREE.Color>();
  const color=(value:string)=>{let c=colorCache.get(value);if(!c){c=new THREE.Color(value);colorCache.set(value,c);}return c;};
  const material=(parameters:THREE.MeshStandardMaterialParameters)=>{
    const m=new THREE.MeshStandardMaterial(parameters);materials.push(m);return m;
  };
  const surfaceMaterial=(id:string,tint:string,normalStrength=.45)=>material({
    color:tint,vertexColors:true,roughness:.9,
    ...(textureCache.get(`${id}_diff`)?{map:textureCache.get(`${id}_diff`)}:{}),
    ...(textureCache.get(`${id}_normal`)?{normalMap:textureCache.get(`${id}_normal`),normalScale:new THREE.Vector2(normalStrength,normalStrength)}:{}),
    ...(textureCache.get(`${id}_rough`)?{roughnessMap:textureCache.get(`${id}_rough`)}:{}),
  });
  const walls=surfaceMaterial('plastered_wall_02','#ffffff',.48);
  const concrete=surfaceMaterial('concrete_floor_02','#e4e0d7',.4);
  const asphalt=surfaceMaterial('asphalt_02','#a3a6a8',.55);
  const earth=surfaceMaterial('concrete_floor_02','#a6a08e',.5);
  const trim=material({color:'#ffffff',vertexColors:true,roughness:.88});
  const windows=material({color:'#ffffff',vertexColors:true,roughness:.28,metalness:.28});
  const paint=material({color:'#ffffff',vertexColors:true,roughness:.9});

  function tile(x:number,z:number) {
    const tx=Math.floor(x/TILE),tz=Math.floor(z/TILE),key=`${tx},${tz}`;
    let t=tiles.get(key);
    if(!t){const group=new THREE.Group();group.name=`Mapped tile ${key}`;root.add(group);t={group,x:(tx+.5)*TILE,z:(tz+.5)*TILE,batches:new Map()};tiles.set(key,t);}
    return t;
  }
  function batch(t:Tile,m:THREE.Material) {
    let b=t.batches.get(m);if(!b){b={positions:[],normals:[],uvs:[],colors:[]};t.batches.set(m,b);}return b;
  }
  function triangle(b:Batch,a:V3,c:V3,d:V3,tint:string,uvA?:UV,uvC?:UV,uvD?:UV) {
    const ux=c[0]-a[0],uy=c[1]-a[1],uz=c[2]-a[2],vx=d[0]-a[0],vy=d[1]-a[1],vz=d[2]-a[2];
    const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,l=Math.hypot(nx,ny,nz)||1;
    const rgb=color(tint);
    for(const [p,uv] of [[a,uvA],[c,uvC],[d,uvD]] as [V3,UV|undefined][]){
      b.positions.push(...p);b.normals.push(nx/l,ny/l,nz/l);b.colors.push(rgb.r,rgb.g,rgb.b);
      b.uvs.push(...(uv??[p[0]/3,p[2]/3]));
    }
  }
  function quad(b:Batch,a:V3,c:V3,d:V3,e:V3,tint:string,uv?:[UV,UV,UV,UV]) {
    triangle(b,a,c,d,tint,uv?.[0],uv?.[1],uv?.[2]);triangle(b,a,d,e,tint,uv?.[0],uv?.[2],uv?.[3]);
  }
  function flat(t:Tile,m:THREE.Material,points:MapPoint[],y:number,tint:string) {
    const pts=points.map(p=>new THREE.Vector2(p.x,p.z));
    for(const indices of THREE.ShapeUtils.triangulateShape(pts,[])) {
      const [a,b,c]=indices.map(i=>points[i]);
      const cross=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
      const vertices:V3[]=[[a.x,y,a.z],[b.x,y,b.z],[c.x,y,c.z]];
      if(cross>0)[vertices[1],vertices[2]]=[vertices[2],vertices[1]];
      triangle(batch(t,m),vertices[0],vertices[1],vertices[2],tint);
    }
  }
  function ribbon(a:MapPoint,b:MapPoint,width:number,y:number,m:THREE.Material,tint:string) {
    const dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz);if(l<.01)return;
    const px=-dz/l*width/2,pz=dx/l*width/2;
    quad(batch(tile((a.x+b.x)/2,(a.z+b.z)/2),m),[a.x+px,y,a.z+pz],[b.x+px,y,b.z+pz],[b.x-px,y,b.z-pz],[a.x-px,y,a.z-pz],tint);
  }
  function disk(p:MapPoint,r:number,y:number,m:THREE.Material,tint:string) {
    const t=tile(p.x,p.z),pts=Array.from({length:10},(_,i)=>({x:p.x+Math.cos(i*Math.PI/5)*r,z:p.z+Math.sin(i*Math.PI/5)*r}));flat(t,m,pts,y,tint);
  }
  // Continuous metric UVs: the same square of concrete/asphalt remains ~3m everywhere.
  const ground=new THREE.PlaneGeometry(MAP_BOUNDS.maxX-MAP_BOUNDS.minX+2000,MAP_BOUNDS.maxZ-MAP_BOUNDS.minZ+2000);
  ground.rotateX(-Math.PI/2);ground.translate(0,-.045,0);
  const guv=ground.getAttribute('uv'),gp=ground.getAttribute('position');
  for(let i=0;i<guv.count;i++)guv.setXY(i,gp.getX(i)/4,gp.getZ(i)/4);
  ground.setAttribute('color',new THREE.Float32BufferAttribute(Array.from({length:gp.count*3},()=>1),3));
  const groundMesh=new THREE.Mesh(ground,earth);groundMesh.receiveShadow=true;root.add(groundMesh);resources.push(ground);

  for(const s of SURFACES) {
    const p=s.points[0];if(!p)continue;
    const green=s.kind==='park'||s.kind==='garden';
    flat(tile(p.x,p.z),earth,s.points,.005,green?'#82936b':s.kind==='pitch'?'#b4a68b':'#c5c0ae');
  }
  for(const road of ROADS) {
    const main=['primary','secondary','tertiary'].includes(road.kind);
    for(let i=1;i<road.points.length;i++) {
      const a=road.points[i-1],b=road.points[i];
      ribbon(a,b,road.width+1.3,.018,concrete,'#b9b6ac');
      ribbon(a,b,road.width,.035,asphalt,'#ffffff');
      if(main) {
        const length=Math.hypot(b.x-a.x,b.z-a.z),dx=(b.x-a.x)/length,dz=(b.z-a.z)/length;
        for(let k=2;k<length-2;k+=12)ribbon({x:a.x+dx*k,z:a.z+dz*k},{x:a.x+dx*Math.min(k+3,length),z:a.z+dz*Math.min(k+3,length)},.12,.048,paint,'#d9d6bd');
      }
    }
    for(const p of road.points)disk(p,road.width/2,.035,asphalt,'#ffffff');
  }

  for(const building of BUILDINGS) {
    const t=tile(building.x,building.z),pts=[...building.polygon];
    let area=0;for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];area+=a.x*b.z-b.x*a.z;}
    if(area<0)pts.reverse();
    const h=building.h,roof=h-.22;
    const detail=Boolean(building.name)||LOCATIONS.some(l=>Math.hypot(l.x-building.x,l.z-building.z)<115);
    const wallBatch=batch(t,walls),trimBatch=batch(t,trim);
    for(let i=0;i<pts.length;i++) {
      const a=pts[i],b=pts[(i+1)%pts.length],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<.04)continue;
      const normal={x:dz/len,z:-dx/len};
      const coords=(p:MapPoint,y:number,offset=0):V3=>[p.x+normal.x*offset,y,p.z+normal.z*offset];
      quad(wallBatch,coords(a,0),coords(a,h),coords(b,h),coords(b,0),building.color,[[0,0],[0,h/3],[len/3,h/3],[len/3,0]]);
      // Coping and plinth are on the original outline, never invented replacement blocks.
      quad(trimBatch,coords(a,h-.3,.009),coords(a,h,.009),coords(b,h,.009),coords(b,h-.3,.009),'#b8b5ac');
      quad(trimBatch,coords(a,0,.01),coords(a,.42,.01),coords(b,.42,.01),coords(b,0,.01),'#99978f');
      if(detail && len>2.4) {
        const count=Math.max(1,Math.floor(len/3.4)),floors=Math.max(1,Math.round(h/3.2));
        for(let floor=0;floor<floors;floor++)for(let k=0;k<count;k++) {
          const center=(k+.5)/count,half=Math.min(.68,len/(count*3))/len;
          const p={x:a.x+dx*(center-half),z:a.z+dz*(center-half)},q={x:a.x+dx*(center+half),z:a.z+dz*(center+half)};
          const low=floor*3.2+1.05,high=Math.min(low+1.28,h-.5);if(high<=low)continue;
          quad(batch(t,windows),coords(p,low,.024),coords(p,high,.024),coords(q,high,.024),coords(q,low,.024),floor%2?'#33434c':'#40515a');
          ribbon({x:p.x+normal.x*.08,z:p.z+normal.z*.08},{x:q.x+normal.x*.08,z:q.z+normal.z*.08},.17,low-.05,trim,'#d8d7cb');
          const middle={x:(p.x+q.x)/2,z:(p.z+q.z)/2},frameHalf=.035/len;
          const f1={x:middle.x-dx*frameHalf,z:middle.z-dz*frameHalf},f2={x:middle.x+dx*frameHalf,z:middle.z+dz*frameHalf};
          quad(trimBatch,coords(f1,low,.028),coords(f1,high,.028),coords(f2,high,.028),coords(f2,low,.028),'#b6b9b5');
        }
      }
    }
    flat(t,concrete,pts,roof,'#cbc8bf');
    // Narrow interior coping faces avoid an invisible open roof while keeping footprint exact.
    flat(t,concrete,pts,h,'#cfccc2');
  }

  // Place readable locality markers on existing facades close to the verified sector starts.
  // These are wayfinding overlays, not a claim that an identical physical sign exists.
  function sign(text:string,subtext:string,building:typeof BUILDINGS[number],near:MapPoint) {
    const pts=building.polygon;
    let best:{a:MapPoint;b:MapPoint;d:number}|undefined;
    for(let i=0;i<pts.length;i++) {
      const a=pts[i],b=pts[(i+1)%pts.length],length=Math.hypot(b.x-a.x,b.z-a.z);if(length<3.5)continue;
      const d=Math.hypot((a.x+b.x)/2-near.x,(a.z+b.z)/2-near.z);if(!best||d<best.d)best={a,b,d};
    }
    if(!best)return;
    const {a,b}=best,dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),x=(a.x+b.x)/2,z=(a.z+b.z)/2;
    let nx=dz/length,nz=-dx/length;if(nx*(near.x-x)+nz*(near.z-z)<0){nx=-nx;nz=-nz;}
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const ctx=canvas.getContext('2d');if(!ctx)return;
    ctx.fillStyle='#184f62';ctx.fillRect(0,0,1024,256);ctx.strokeStyle='#f3d57b';ctx.lineWidth=10;ctx.strokeRect(12,12,1000,232);
    ctx.textAlign='center';ctx.fillStyle='#fff9e9';
    const font="'Noto Devanagari', 'Noto Sans Devanagari', sans-serif";
    ctx.font=`bold ${text.length>24?49:58}px ${font}`;ctx.fillText(text,512,107,940);
    ctx.fillStyle='#f3d57b';ctx.font=`500 31px ${font}`;ctx.fillText(subtext,512,181,940);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=16;resources.push(texture);
    const mat=new THREE.MeshStandardMaterial({map:texture,roughness:.8,side:THREE.DoubleSide});materials.push(mat);
    const width=Math.min(6.5,length-.3),geo=new THREE.PlaneGeometry(width,width/4);resources.push(geo);
    const mesh=new THREE.Mesh(geo,mat);mesh.position.set(x+nx*.05,Math.min(3.7,building.h-1),z+nz*.05);mesh.rotation.y=Math.atan2(nx,nz);tile(x,z).group.add(mesh);
  }
  for(const l of LOCATIONS.filter(l=>!['bhagya','baba'].includes(l.id))) {
    const b=[...BUILDINGS].filter(b=>b.w>4&&b.d>3).sort((a,b)=>Math.hypot(a.x-l.x,a.z-l.z)-Math.hypot(b.x-l.x,b.z-l.z))[0];
    if(b)sign(l.label,l.name.toUpperCase()+' · NANDED',b,l);
  }
  // Verified institutions get exterior wayfinding at their mapped footprints/campus frontage.
  for(const campus of SURFACES.filter(s=>['912075883','1258365919'].includes(s.id))) {
    const center={x:campus.points.reduce((v,p)=>v+p.x,0)/campus.points.length,z:campus.points.reduce((v,p)=>v+p.z,0)/campus.points.length};
    const b=[...BUILDINGS].filter(b=>b.w>8&&b.d>6).sort((a,b)=>Math.hypot(a.x-center.x,a.z-center.z)-Math.hypot(b.x-center.x,b.z-center.z))[0];
    const label=campus.id==='993255388'?'यशवंत महाविद्यालय':campus.id==='1258365919'?'शासकीय औद्योगिक प्रशिक्षण संस्था':'शासकीय तंत्रनिकेतन';
    if(b)sign(label,campus.id==='1258365919'?'GOVERNMENT ITI · NANDED':campus.name.toUpperCase(),b,{x:center.x+100,z:center.z});
  }

  let triangles=0,meshes=0;
  for(const t of tiles.values())for(const [m,b] of t.batches) {
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(b.normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(b.uvs,2));g.setAttribute('color',new THREE.Float32BufferAttribute(b.colors,3));g.computeBoundingSphere();
    const mesh=new THREE.Mesh(g,m);mesh.castShadow=m===walls||m===concrete;mesh.receiveShadow=true;t.group.add(mesh);resources.push(g);triangles+=b.positions.length/9;meshes++;
    b.positions.length=b.normals.length=b.uvs.length=b.colors.length=0;
  }
  const landmarks=createLandmarks();root.add(landmarks.group);
  landmarks.group.traverse(object=>{if(object instanceof THREE.Mesh){meshes++;triangles+=(object.geometry.index?.count??object.geometry.getAttribute('position').count)/3;}});
  const hemi=new THREE.HemisphereLight('#d5e6f4','#747567',1.65);root.add(hemi);
  const sun=new THREE.DirectionalLight('#fff3dc',2.8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-72;sun.shadow.camera.right=72;sun.shadow.camera.top=72;sun.shadow.camera.bottom=-72;sun.shadow.camera.near=1;sun.shadow.camera.far=260;sun.shadow.bias=-.00012;sun.shadow.normalBias=.035;root.add(sun,sun.target);
  const initial=LOCATIONS[0];sun.position.set(initial.x-65,100,initial.z+45);sun.target.position.set(initial.x,0,initial.z);
  root.userData.stats={buildings:BUILDINGS.length,roadPaths:ROADS.length,tiles:tiles.size,landmarks:landmarks.group.children.length,meshes,triangles};
  let lastX=Infinity,lastZ=Infinity;
  return {
    update(_time:number,focus?:MapPoint) {
      const p=focus??initial;
      if(Math.hypot(p.x-lastX,p.z-lastZ)<12)return;
      lastX=p.x;lastZ=p.z;
      for(const t of tiles.values())t.group.visible=Math.hypot(t.x-p.x,t.z-p.z)<790;
      for(const landmark of landmarks.group.children)landmark.visible=Math.hypot(landmark.position.x-p.x,landmark.position.z-p.z)<790;
      const sx=Math.round(p.x/8)*8,sz=Math.round(p.z/8)*8;sun.position.set(sx-65,100,sz+45);sun.target.position.set(sx,0,sz);sun.target.updateMatrixWorld();
    },
    dispose(){landmarks.dispose();scene.remove(root);for(const resource of resources)resource.dispose();for(const m of materials)m.dispose();sun.shadow.map?.dispose();},
  };
}
