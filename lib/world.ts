import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BUILDINGS, COVER, COMPOUND_WALLS, UTILITY_POLES, ROADS } from './map';

/** Bhagya Nagar, Nanded. OSM-derived streets; illustrative architecture. See /map-reference.json. */
export function createWorld(scene: THREE.Scene) {
  const root = new THREE.Group();
  root.name = 'Bhagya Nagar — Nanded';
  scene.add(root);
  scene.background = new THREE.Color('#cbd5d0');
  scene.fog = new THREE.Fog('#cbd5d0', 85, 210);
  const resources: { dispose(): void }[] = [];
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const materialCache = new Map<string, THREE.MeshStandardMaterial>();
  let seed = 1709;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  function texture(size: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat = 1) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) draw(ctx);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 4;
    resources.push(t);
    return t;
  }

  const plaster = texture(256, ctx => {
    ctx.fillStyle = '#e9e4d6'; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 12500; i++) {
      ctx.fillStyle = `rgba(${rand() > .5 ? '255,255,255' : '77,65,48'},${rand() * .055})`;
      ctx.fillRect(rand() * 256, rand() * 256, 1 + rand() * 3, 1 + rand() * 3);
    }
    for (let i = 0; i < 25; i++) {
      ctx.fillStyle = 'rgba(91,74,53,.018)';
      ctx.fillRect(rand() * 256, rand() * 256, rand() * 70, rand() * 12);
    }
  });
  const groundTexture = texture(512, ctx => {
    ctx.fillStyle = '#c0af93'; ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 22000; i++) {
      const light = rand() > .5;
      ctx.fillStyle = light ? 'rgba(255,242,211,.12)' : 'rgba(54,45,34,.08)';
      ctx.fillRect(rand() * 512, rand() * 512, 1 + rand() * 3, 1 + rand() * 3);
    }
    ctx.strokeStyle = '#aa9c83'; ctx.lineWidth = 1;
    for (let y = 0; y < 512; y += 64) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke();
      for (let x = (y / 64) % 2 * 64; x < 512; x += 128) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 64); ctx.stroke();
      }
    }
  }, 9);
  const asphaltTexture = texture(256, ctx => {
    ctx.fillStyle = '#827b6b'; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 13000; i++) {
      ctx.fillStyle = rand() > .5 ? 'rgba(235,220,190,.12)' : 'rgba(30,26,19,.12)';
      ctx.fillRect(rand() * 256, rand() * 256, 1, 1);
    }
    ctx.strokeStyle = '#6f6b5c'; ctx.lineWidth = .7;
    for (let i = 0; i < 8; i++) {
      let x = rand() * 256; let y = rand() * 256;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let j = 0; j < 6; j++) { x += rand() * 15 - 7; y += rand() * 17; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }, 12);
  const woodTexture = texture(128, ctx => {
    ctx.fillStyle = '#c3a777'; ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 300; i++) {
      ctx.strokeStyle = `rgba(70,47,23,${rand() * .18})`;
      const y = rand() * 128;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(40, y + rand() * 5, 90, y - rand() * 5, 128, y); ctx.stroke();
    }
    ctx.strokeStyle = '#8d734c'; ctx.lineWidth = 2;
    for (let y = 0; y < 128; y += 25.6) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(128, y); ctx.stroke(); }
  });

  function mat(color: string, map?: THREE.Texture, roughness = .94, metalness = 0) {
    const key = `${color}-${map?.uuid ?? ''}-${roughness}-${metalness}`;
    let m = materialCache.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness, metalness, ...(map ? { map } : {}) });
      materialCache.set(key, m); resources.push(m);
    }
    return m;
  }
  const dark = mat('#303d39');
  const iron = mat('#354d4a', undefined, .65, .25);
  const wood = mat('#d3b17c', woodTexture);
  const oldWood = mat('#96845d', woodTexture);
  const orange = mat('#ce713b');
  const offWhite = mat('#ece0b9');
  const foliage = [mat('#637b44'), mat('#798a49'), mat('#8a9951'), mat('#4f693e')];

  function add(g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
    if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    const items = batches.get(m) ?? [];
    items.push(g.index ? g.toNonIndexed() : g);
    if (g.index) g.dispose();
    batches.set(m, items);
  }
  function box(x: number, y: number, z: number, w: number, h: number, d: number, m: THREE.Material, ry = 0) {
    add(new THREE.BoxGeometry(w, h, d), m, x, y, z, 0, ry);
  }
  function cylinder(x: number, y: number, z: number, top: number, bottom: number, h: number, m: THREE.Material, radial = 10, rz = 0) {
    add(new THREE.CylinderGeometry(top, bottom, h, radial), m, x, y, z, 0, 0, rz);
  }
  function wire(points: THREE.Vector3[], radius = .025, material: THREE.Material = dark) {
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 16, radius, 4, false), material, 0, 0, 0);
  }
  function plane(x: number, y: number, z: number, w: number, h: number, m: THREE.Material, rx = -Math.PI / 2, ry = 0) {
    add(new THREE.PlaneGeometry(w, h), m, x, y, z, rx, ry);
  }
  function label(main: string, sub: string, background: string, foreground = '#efdfb7', aspect = 4) {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = background; ctx.fillRect(0, 0, 1024, 256);
      ctx.strokeStyle = foreground; ctx.globalAlpha = .6; ctx.lineWidth = 5; ctx.strokeRect(13, 13, 998, 230);
      ctx.globalAlpha = 1; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = foreground; ctx.font = 'bold 92px "Noto Sans Devanagari", "Arial", sans-serif';
      ctx.fillText(main, 512, 99, 950);
      ctx.font = '500 34px Arial, sans-serif'; ctx.fillText(sub, 512, 198, 940);
      for (let i = 0; i < 90; i++) { ctx.fillStyle = 'rgba(20,25,19,.07)'; ctx.fillRect(rand() * 1024, rand() * 256, rand() * 50, rand() * 4); }
    }
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; resources.push(tex);
    const material = new THREE.MeshStandardMaterial({ map: tex, roughness: .95, side: THREE.DoubleSide });
    resources.push(material);
    return { material, aspect };
  }

  function crate(x: number, z: number, w: number, h: number, d: number, y = 0) {
    box(x, y + h / 2, z, w, h, d, wood);
    for (const side of [-1, 1]) {
      for (const level of [.12, h - .12]) box(x, y + level, z + side * (d / 2 + .02), w + .06, .13, .09, oldWood);
      box(x - w / 2 + .12, y + h / 2, z + side * (d / 2 + .05), .14, h, .08, oldWood);
      box(x + w / 2 - .12, y + h / 2, z + side * (d / 2 + .05), .14, h, .08, oldWood);
      box(x + side * (w / 2 + .02), y + .16, z, .08, .13, d, oldWood);
      box(x + side * (w / 2 + .02), y + h - .16, z, .08, .13, d, oldWood);
    }
    for (const side of [-1, 1]) box(x + side * w * .28, y + h + .03, z, .1, .05, d, oldWood);
  }
  function tree(x: number, z: number, size = 1, baseY = 0) {
    cylinder(x, baseY + 1.9 * size, z, .14 * size, .25 * size, 3.8 * size, mat('#7b6546'), 7);
    cylinder(x + .38 * size, baseY + 3 * size, z, .065 * size, .12 * size, 1.7 * size, mat('#7b6546'), 6, -.5);
    for (let j = 0; j < 8; j++) {
      const angle = j * 2.399; const r = j === 0 ? 0 : 1.2 * size;
      const geometry = new THREE.IcosahedronGeometry((1.3 + rand() * .4) * size, 1);
      geometry.scale(1, .8, 1);
      add(geometry, foliage[j % foliage.length], x + Math.cos(angle) * r, baseY + (4 + rand() * .65) * size, z + Math.sin(angle) * r);
    }
  }
  root.add(new THREE.HemisphereLight('#e7f0ef','#7a806a',2));
  const sun=new THREE.DirectionalLight('#fff0d4',2.8);sun.position.set(-44,68,35);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-80,right:80,top:80,bottom:-80,near:1,far:190});sun.shadow.normalBias=.035;sun.shadow.bias=-.0002;root.add(sun);root.add(sun.target);
  const skyGeometry=new THREE.SphereGeometry(250,24,12);
  const skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color('#87b7ce')},bottom:{value:new THREE.Color('#e3e1cd')}},vertexShader:'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform vec3 top;uniform vec3 bottom;varying vec3 p;void main(){gl_FragColor=vec4(mix(bottom,top,smoothstep(-5.,140.,p.y)),1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'});
  root.add(new THREE.Mesh(skyGeometry,skyMaterial));resources.push(skyGeometry,skyMaterial);
  plane(0,-.055,0,190,190,mat('#b5b6a5',groundTexture));
  const roadMat=mat('#a4a6a0',asphaltTexture),shoulder=mat('#bab9a8',plaster),concrete=mat('#d3d3c6',plaster),paint=mat('#e3dfc6');
  // Exact geodetic OSM centerlines; widths are an illustrative road-design assumption.
  for(const road of ROADS)for(let i=1;i<road.points.length;i++) {
    const a=road.points[i-1],b=road.points[i],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz),angle=Math.atan2(dx,dz);
    box((a.x+b.x)/2,-.025,(a.z+b.z)/2,road.width+2,.05,len+1,shoulder,angle);
    box((a.x+b.x)/2,.005,(a.z+b.z)/2,road.width,.035,len+.15,roadMat,angle);
    if(road.kind==='main')for(let d=2;d<len;d+=7){const t=d/len;box(a.x+dx*t,.03,a.z+dz*t,.11,.018,2.8,paint,angle);}
  }
  for(const b of BUILDINGS) {
    const wall=mat(b.color,plaster),accent=mat(b.accent),face=b.z+b.front*(b.d/2+.03);
    box(b.x,b.h/2,b.z,b.w,b.h,b.d,wall);
    box(b.x,.12,b.z,b.w+.3,.24,b.d+.3,concrete);
    for(let y=3.1;y<b.h;y+=3.1)box(b.x,y,b.z,b.w+.22,.18,b.d+.22,concrete);
    box(b.x,b.h+.12,b.z,b.w+.4,.24,b.d+.4,concrete);
    for(const side of [-1,1]){box(b.x,b.h+.5,b.z+side*b.d/2,b.w,.75,.22,wall);box(b.x+side*b.w/2,b.h+.5,b.z,.22,.75,b.d,wall);}
    // Narrow residential windows, boxed balconies, domestic tanks and solar hot-water panels.
    for(let y=1.65;y<b.h-1;y+=3.1)for(const xoff of [-b.w*.3,0,b.w*.3]) {
      box(b.x+xoff,y,face,1.55,1.65,.12,concrete);box(b.x+xoff,y,face+b.front*.08,1.32,1.42,.12,mat('#405c62',undefined,.4,.1));
      box(b.x+xoff,y,face+b.front*.17,.07,1.4,.05,offWhite);
      box(b.x+xoff,y,face+b.front*.17,1.3,.06,.05,offWhite);
      if(y>3){box(b.x+xoff,y-.95,face+b.front*.3,2.1,.15,.85,concrete);box(b.x+xoff,y-.65,face+b.front*.67,2.05,.06,.05,iron);for(let j=0;j<7;j++)box(b.x+xoff-.9+j*.3,y-.79,face+b.front*.67,.035,.3,.035,iron);}
    }
    for(const side of [-1,1])for(let y=1.6;y<b.h-1;y+=3.1)for(const zoff of [-2.8,2.8]){box(b.x+side*(b.w/2+.03),y,b.z+zoff,.12,1.6,1.45,concrete);box(b.x+side*(b.w/2+.11),y,b.z+zoff,.08,1.35,1.2,accent);}
    if(b.kind==='shop') {
      for(const dx of [-2.6,2.6]){box(b.x+dx,1.4,face+b.front*.1,4.2,2.7,.15,accent);for(let y=.2;y<2.7;y+=.17)box(b.x+dx,y,face+b.front*.19,4.2,.025,.025,iron);}
      const sign=label(b.name,b.label,b.accent);plane(b.x,3.15,face+b.front*.23,b.w-.2,.85,sign.material,0,b.front===1?0:Math.PI);
      box(b.x,2.68,face+b.front*.65,b.w,.12,1.5,concrete);
    } else {
      box(b.x,.95,face+b.front*.1,1.25,1.9,.18,mat('#665b4e'));
      box(b.x,b.h*.5,face+b.front*.1,.22,b.h, .25,accent);
    }
    cylinder(b.x-2,b.h+.85,b.z+1,.7,.7,1.5,dark,12);cylinder(b.x-2,b.h+1.63,b.z+1,.72,.72,.1,dark,12);
    for(let j=0;j<3;j++)cylinder(b.x-2,b.h+.3+j*.47,b.z+1,.715,.715,.04,iron,12);
    if(b.kind==='home') {
      add(new THREE.BoxGeometry(2.8,.1,1.5),mat('#496e7b',undefined,.3,.1),b.x+2,b.h+.48,b.z-.5,-.3);
      cylinder(b.x+2,b.h+.8,b.z+.25,.24,.24,2.3,concrete,10,Math.PI/2);
    }
    box(b.x+b.w*.35,4.6,face+b.front*.35,1.2,.65,.55,mat('#babdb2'));
    for(let j=0;j<5;j++)box(b.x+b.w*.35,4.4+j*.1,face+b.front*.65,1,.025,.025,iron);
    cylinder(b.x-b.w*.44,b.h/2,face+b.front*.16,.04,.04,b.h,mat('#999f92'),6);
  }
  for(const c of COMPOUND_WALLS){box(c.x,c.h/2,c.z,c.w,c.h,c.d,concrete);box(c.x,c.h+.04,c.z,c.w+.06,.08,c.d+.06,mat('#9aaca1'));}
  for(const b of BUILDINGS.filter(b=>b.kind==='home')){
    for(const s of [-1,1])box(b.x+s*1.8,.85,b.z+b.front*6.8,.3,1.7,.4,concrete);
    // Gate opening stays traversable; side garden greenery sits inside the compound.
    tree(b.x+5.4,b.z-5.4,.65);
  }
  const tire=mat('#242e2d'),glass=mat('#6d8f98',undefined,.25,.15);
  for(const c of COVER){
    if(c.kind==='crate'){crate(c.x,c.z,c.w,c.h,c.d);continue;}
    if(c.kind==='planter'){box(c.x,.45,c.z,c.w,.9,c.d,concrete);box(c.x,.92,c.z,c.w-.2,.04,c.d-.2,mat('#706f4d'));tree(c.x,c.z,.9,.9);continue;}
    if(c.kind==='barrier'){box(c.x,.55,c.z,c.w,1.1,c.d,concrete);for(let x=-c.w/2+.25;x<c.w/2;x+=.6)box(c.x+x,.6,c.z+c.d/2+.01,.25,.55,.025,orange);continue;}
    if(c.kind==='car'){
      const body=mat(c.x>40?'#e0dfd1':'#80989c',undefined,.45,.2);
      box(c.x,.63,c.z,2.05,.65,4.3,body);box(c.x,1.15,c.z-.1,1.8,.7,2.3,glass);box(c.x,1.55,c.z-.1,1.85,.15,2.35,body);
      for(const side of [-1,1]){for(const end of [-1,1]){add(new THREE.CylinderGeometry(.36,.36,.22,12),tire,c.x+side*1.02,.38,c.z+end*1.3,0,0,Math.PI/2);box(c.x+side*.7,.75,c.z+end*2.16,.45,.18,.05,end===1?offWhite:orange);}box(c.x+side*.9,1.15,c.z,.08,.85,.1,body);}
    }else if(c.kind==='cart'){
      const yellow=mat('#dfb23f');box(c.x,.68,c.z,3.7,.5,1.8,yellow);box(c.x+.75,1.25,c.z,1.8,.8,1.75,mat('#53766c'));box(c.x+.55,2.13,c.z,2.65,.35,1.9,tire);box(c.x-1.25,1.07,c.z,.7,1.05,1.72,yellow);box(c.x-1.25,1.8,c.z,.07,.62,1.7,glass);
      for(const side of [-1,1]){box(c.x-.8,1.7,c.z+side*.85,.07,1.05,.07,tire);box(c.x+1.7,1.65,c.z+side*.85,.08,1.1,.08,tire);add(new THREE.CylinderGeometry(.4,.4,.2,12),tire,c.x+1.1,.43,c.z+side*.9,Math.PI/2);box(c.x-1.64,1,c.z+side*.55,.07,.2,.28,offWhite);}
      add(new THREE.CylinderGeometry(.4,.4,.23,12),tire,c.x-1.35,.43,c.z,Math.PI/2);
    }
  }
  for(const {x,z} of UTILITY_POLES){cylinder(x,4.25,z,.11,.15,8.5,mat('#83877e'),8);box(x,7.75,z,1.9,.12,.12,iron);for(const dx of [-.65,0,.65])cylinder(x+dx,7.95,z,.07,.07,.25,offWhite,6);}
  for(let i=1;i<UTILITY_POLES.length;i++){const a=UTILITY_POLES[i-1],b=UTILITY_POLES[i];if(Math.hypot(a.x-b.x,a.z-b.z)>50)continue;for(const dx of [-.5,.5])wire([new THREE.Vector3(a.x+dx,8,a.z),new THREE.Vector3((a.x+b.x)/2+dx,6.5,(a.z+b.z)/2),new THREE.Vector3(b.x+dx,8,b.z)],.024);}
  const district=label('भाग्यनगर','BHAGYA NAGAR  ·  NANDED','#36636c');
  plane(-6,2.8,9,4.1,1.05,district.material,0,0);box(-8.1,1.8,9,.1,3.4,.1,iron);box(-3.9,1.8,9,.1,3.4,.1,iron);
  // A readable neighborhood sign marks the mapped entrance; no invented monument is claimed.
  const roadSign=label('भाग्यनगर रोड','BHAGYA NAGAR ROAD','#355e68');plane(-29,2.8,-10,4.1,.9,roadSign.material,0,0);box(-29,1.4,-10,.12,2.8,.12,iron);
  // Continued residential fabric frames every arena edge, without inventing water or ghats.
  for(let i=0;i<26;i++){
    const side=i%4,t=-83+Math.floor(i/4)*26,x=side===0?-77:side===1?77:t,z=side===2?-77:side===3?77:t,h=6+(i%4)*3;
    box(x,h/2,z,13,h,13,mat(['#bccac4','#d3d4c7','#c5c0b2','#c9d3d1'][i%4],plaster));box(x,h+.1,z,13.4,.2,13.4,concrete);
    for(let y=2;y<h;y+=3)for(const dx of [-4,0,4])box(x+dx,y,z+6.55,1.4,1.5,.1,glass);
    if(i%3===0)tree(x+9,z+2,1.5);
  }
  // Boundary is explicit through simple low peripheral walls and open street approaches.
  for(const side of [-1,1]){box(side*61.2,.6,0,.5,1.2,123,concrete);box(0,.6,side*61.2,123,1.2,.5,concrete);}
  for(let i=0;i<70;i++){const x=-58+rand()*116,z=-58+rand()*116;plane(x,.04,z,.07+rand()*.12,.1+rand()*.2,mat('#9d9a82'),-Math.PI/2,rand()*6);}
  for(const [material,geometries]of batches){const merged=mergeGeometries(geometries,false);for(const g of geometries)g.dispose();if(!merged)continue;merged.computeBoundingSphere();const mesh=new THREE.Mesh(merged,material);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);resources.push(merged);}batches.clear();
  const birds=new THREE.Group();const birdMat=new THREE.MeshBasicMaterial({color:'#617067',side:THREE.DoubleSide});resources.push(birdMat);
  for(let i=0;i<5;i++){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([-.4,.04,.12,0,0,0,-.17,.02,-.06,0,0,0,.4,.04,.12,.17,.02,-.06],3));const b=new THREE.Mesh(g,birdMat);b.position.set((i%3)*2,i%2,i*1.5);birds.add(b);resources.push(g);}root.add(birds);
  return{update(time:number){birds.position.set(15+Math.cos(time*.035)*30,28+Math.sin(time*.13),-10+Math.sin(time*.035)*22);birds.rotation.y=-time*.035;},dispose(){scene.remove(root);for(const r of resources)r.dispose();sun.shadow.dispose();}};
}
