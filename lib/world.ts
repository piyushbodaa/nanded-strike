import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BUILDINGS, COVER, UTILITY_POLES, LAMP_POLES, PLANT_POTS } from './map';

/** A wholly original, fictional Godavari riverside bazaar. No downloaded assets. */
export function createWorld(scene: THREE.Scene) {
  const root = new THREE.Group();
  root.name = 'Nanded — Godavari Quarter';
  scene.add(root);
  scene.background = new THREE.Color('#ddc5a7');
  scene.fog = new THREE.Fog('#ddc5a7', 58, 155);
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
  const sand = mat('#cbb68e', plaster);
  const stone = mat('#a38f6c', plaster);
  const trim = mat('#e4caa0', plaster);
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

  // Sunlit dust, long shadows and atmospheric silhouettes give the quarter its evening character.
  root.add(new THREE.HemisphereLight('#f5e0bd', '#766c51', 2.15));
  const sun = new THREE.DirectionalLight('#ffdfad', 3.15);
  sun.position.set(-34, 49, 30); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 140 });
  sun.shadow.normalBias = .035; sun.shadow.bias = -.0002;
  root.add(sun); root.add(sun.target);
  const skyGeometry = new THREE.SphereGeometry(190, 24, 12);
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color('#93b6b4') }, bottom: { value: new THREE.Color('#efd3ad') } },
    vertexShader: 'varying vec3 vPosition; void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform vec3 top;uniform vec3 bottom;varying vec3 vPosition;void main(){float f=smoothstep(-10.0,125.0,vPosition.y);gl_FragColor=vec4(mix(bottom,top,f),1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
  });
  root.add(new THREE.Mesh(skyGeometry, skyMaterial)); resources.push(skyGeometry, skyMaterial);

  plane(0, -.055, 0, 64, 64, mat('#ffffff', groundTexture));
  plane(0, -.035, 0, 62, 11.5, mat('#c8baa0', asphaltTexture));
  plane(2.9, -.028, 0, 9.7, 61, mat('#c9baa1', asphaltTexture));
  // Soft sandy shoulders, small drains and faded lane paint.
  box(0, -.03, 6.1, 60, .06, .45, sand);
  box(0, -.03, -6.1, 60, .06, .45, sand);
  for (let z = -27; z < 29; z += 6) plane(2.9, .002, z, .13, 2.3, mat('#d8c89b'));
  for (let x = -27; x < 29; x += 8) {
    box(x, .015, -7.1, .9, .04, .55, iron);
    for (let n = 0; n < 6; n++) box(x - .37 + n * .15, .044, -7.1, .035, .015, .52, dark);
  }

  for (let index = 0; index < BUILDINGS.length; index++) {
    const b = BUILDINGS[index];
    const wall = mat(b.color, plaster);
    const accent = mat(b.accent, plaster);
    box(b.x, b.h / 2, b.z, b.w, b.h, b.d, wall);
    box(b.x, .16, b.z, b.w + .35, .32, b.d + .35, stone);
    box(b.x, b.h + .15, b.z, b.w + .5, .3, b.d + .5, trim);
    // Flat roofs and low parapets; water tanks and clothes lines create a local skyline.
    box(b.x, b.h + .48, b.z - b.d / 2, b.w + .25, .6, .25, wall);
    box(b.x, b.h + .48, b.z + b.d / 2, b.w + .25, .6, .25, wall);
    box(b.x - b.w / 2, b.h + .48, b.z, .25, .6, b.d, wall);
    box(b.x + b.w / 2, b.h + .48, b.z, .25, .6, b.d, wall);
    box(b.x - b.w * .24, b.h + .24, b.z + 1.5, 2, .25, 2, stone);
    cylinder(b.x - b.w * .24, b.h + 1.1, b.z + 1.5, .78, .78, 1.5, dark, 12);
    cylinder(b.x - b.w * .24, b.h + 1.9, b.z + 1.5, .8, .8, .13, dark, 12);
    for (let k = 0; k < 3; k++) cylinder(b.x - b.w * .24, b.h + .6 + k * .42, b.z + 1.5, .795, .795, .05, iron, 12);
    cylinder(b.x + b.w * .28, b.h + 1.7, b.z - 1, .035, .04, 3.1, iron, 6);
    box(b.x + b.w * .28, b.h + 2.9, b.z - 1, 1.4, .04, .04, iron);
    box(b.x + b.w * .28, b.h + 2.45, b.z - 1, .8, .04, .04, iron);

    const facing = b.z > 8 ? -1 : 1;
    const faceZ = b.z + facing * (b.d / 2 + .025);
    const width = b.w > 10 ? 3.1 : 2.1;
    const count = Math.max(1, Math.floor(b.w / 4));
    for (let j = 0; j < count; j++) {
      const x = b.x + (j - (count - 1) / 2) * (b.w / count);
      box(x, 1.55, faceZ, width + .25, 3.1, .13, trim);
      box(x, 1.48, faceZ + facing * .08, width, 2.85, .13, accent);
      for (let k = 0; k < 17; k++) box(x, .18 + k * .16, faceZ + facing * .15, width, .025, .04, iron);
      box(x, .5, faceZ + facing * .19, .32, .05, .05, offWhite);
      // Upper residential windows are inset dark shutters, with simple iron railings.
      for (let floor = 4.8; floor < b.h - .5; floor += 2.8) {
        box(x, floor, faceZ, 1.55, 1.8, .16, trim);
        box(x, floor, faceZ + facing * .09, 1.3, 1.55, .16, dark);
        box(x, floor, faceZ + facing * .2, .065, 1.55, .06, accent);
        box(x, floor, faceZ + facing * .2, 1.3, .07, .06, accent);
        box(x, floor - 1, faceZ + facing * .2, 1.8, .15, .6, trim);
        if (j % 2 === 0) {
          box(x, floor - .55, faceZ + facing * .48, 1.75, .07, .045, iron);
          for (let n = 0; n < 6; n++) box(x - .76 + n * .3, floor - .75, faceZ + facing * .48, .035, .45, .035, iron);
        }
      }
    }
    const sign = label(b.name, b.label, b.accent);
    plane(b.x, 3.65, faceZ + facing * .23, Math.min(b.w - .6, 10.8), 1.05, sign.material, 0, facing === 1 ? 0 : Math.PI);
    box(b.x, 4.24, faceZ, b.w + .35, .15, .55, trim);
    // Striped bazaar canvas awnings stay above head height and inside the facade cover line.
    const awningWidth = b.w - .3;
    const stripeCount = Math.ceil(awningWidth / .7);
    for (let j = 0; j < stripeCount; j++) {
      const x = b.x - awningWidth / 2 + (j + .5) * awningWidth / stripeCount;
      add(new THREE.BoxGeometry(awningWidth / stripeCount, .055, 1.65), j % 2 ? offWhite : accent,
        x, 2.96, faceZ + facing * .72, facing * .13);
      box(x, 2.72, faceZ + facing * 1.48, awningWidth / stripeCount, .25, .055, j % 2 ? offWhite : accent);
    }
    for (const side of [-1, 1]) {
      // Side windows make every angle feel finished.
      for (let k = 0; k < Math.floor(b.d / 3); k++) {
        const z = b.z + (k - (Math.floor(b.d / 3) - 1) / 2) * 3;
        box(b.x + side * (b.w / 2 + .035), 5.2, z, .1, 1.6, 1.25, trim);
        box(b.x + side * (b.w / 2 + .1), 5.2, z, .08, 1.35, 1.02, accent);
        box(b.x + side * (b.w / 2 + .145), 5.2, z, .04, .06, 1.02, dark);
      }
    }
    // Sun-faded plaster repair patches and the external downpipe.
    box(b.x + b.w * .4, 1.2, faceZ + facing * .02, .75, 1.7, .08, mat('#bd9a74', plaster));
    cylinder(b.x - b.w / 2 + .25, b.h / 2, faceZ + facing * .19, .055, .055, b.h, iron, 6);
    if (index % 2 === 0) {
      box(b.x + b.w * .27, 5, faceZ + facing * .32, 1.35, .7, .5, mat('#ccc7ae'));
      for (let k = 0; k < 5; k++) box(b.x + b.w * .27, 4.78 + k * .105, faceZ + facing * .6, 1.1, .025, .02, iron);
    }
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
  function barrel(x: number, z: number, h: number, r: number, color: THREE.Material) {
    cylinder(x, h / 2, z, r * .94, r, h, color, 12);
    for (const p of [.08, .28, .74, .96]) cylinder(x, h * p, z, r + .015, r + .015, .045, iron, 12);
    cylinder(x, h + .012, z, r * .9, r * .9, .025, iron, 12);
    cylinder(x + .18, h + .035, z, .07, .07, .03, dark, 8);
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
  for (const c of COVER) {
    if (c.kind === 'crate') {
      if (c.h > 2) {
        crate(c.x, c.z, c.w, c.h * .53, c.d);
        crate(c.x - .15, c.z + .1, c.w * .65, c.h * .47, c.d * .8, c.h * .53);
      } else crate(c.x, c.z, c.w, c.h, c.d);
    } else if (c.kind === 'barrels') {
      for (let n = 0; n < 3; n++) barrel(c.x + (n - 1) * .98, c.z, c.h, .46, n % 2 ? orange : mat('#687e72'));
    } else if (c.kind === 'planter') {
      box(c.x, .5, c.z, c.w, 1, c.d, trim);
      box(c.x, 1.015, c.z, c.w - .22, .04, c.d - .22, mat('#635a3b'));
      tree(c.x, c.z, .9, .95);
    } else {
      // A parked, unbranded black-and-yellow auto rickshaw doubles as street cover.
      const rubber = mat('#252e2a'); const yellow = mat('#d6a33f');
      box(c.x, .68, c.z, 3.7, .5, 1.8, yellow);
      box(c.x + .75, 1.25, c.z, 1.8, .8, 1.75, mat('#66785e'));
      box(c.x + .55, 2.13, c.z, 2.65, .35, 1.9, rubber);
      box(c.x - 1.25, 1.07, c.z, .7, 1.05, 1.72, yellow);
      box(c.x - 1.25, 1.8, c.z, .07, .62, 1.7, mat('#8ba6a0', undefined, .3, .15));
      for (const side of [-1, 1]) {
        box(c.x - .8, 1.7, c.z + side * .85, .07, 1.05, .07, rubber);
        box(c.x + 1.7, 1.65, c.z + side * .85, .08, 1.1, .08, rubber);
        box(c.x + .7, 1.6, c.z + side * .85, .08, 1.1, .08, rubber);
        add(new THREE.CylinderGeometry(.4, .4, .2, 12), rubber, c.x + 1.1, .43, c.z + side * .9, Math.PI / 2);
        add(new THREE.CylinderGeometry(.21, .21, .22, 10), iron, c.x + 1.1, .43, c.z + side * .9, Math.PI / 2);
        box(c.x - 1.64, 1, c.z + side * .55, .07, .2, .28, offWhite);
      }
      add(new THREE.CylinderGeometry(.4, .4, .23, 12), rubber, c.x - 1.35, .43, c.z, Math.PI / 2);
      box(c.x + .7, 1.25, c.z, 1.35, .2, 1.55, rubber);
    }
  }

  // Electricity lines frame the main lane, leaving clear sightlines at player height.
  for (const { x, z } of UTILITY_POLES) {
    cylinder(x, 4.75, z, .11, .15, 9.5, mat('#756f58'), 8);
    box(x, 8.7, z, 1.8, .12, .12, iron);
    for (const dx of [-.6, .6]) cylinder(x + dx, 8.9, z, .09, .09, .23, offWhite, 6);
    wire([new THREE.Vector3(x, 9, z), new THREE.Vector3(x - 3, 7.4, z + 9.8), new THREE.Vector3(x, 8.7, z + 19.6)]);
  }
  for (const y of [8.9, 8.65]) wire([new THREE.Vector3(-21.5, y, -8.8), new THREE.Vector3(0, y - 2.3, -7.4), new THREE.Vector3(21.5, y, -8.8)]);
  // Faded bunting across the market; tiny geometric pennants stay inexpensive.
  wire([new THREE.Vector3(-16, 6.5, 11.8), new THREE.Vector3(-2, 5.8, 10.9), new THREE.Vector3(12, 6.4, 13.1)], .018);
  for (let i = 0; i < 22; i++) {
    const t = i / 21; const x = -16 + 28 * t; const y = 6.5 - .7 * Math.sin(Math.PI * t);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-.24, 0, 0, .24, 0, 0, 0, -.55, .04], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, .5, 0], 2)); g.computeVertexNormals();
    const flag = [orange, offWhite, mat('#608879')][i % 3]; flag.side = THREE.DoubleSide;
    add(g, flag, x, y, 11.8 + t * 1.3);
  }

  // The playable precinct overlooks the Godavari. Steps and water lie beyond its edge.
  box(32.1, -.7, 0, 3.8, 1.2, 78, stone);
  for (let n = 0; n < 7; n++) box(34 + n * 1.05, -1.15 - n * .23, 0, 1.13, .4, 95, n % 2 ? sand : trim);
  box(31.75, .48, 0, .45, .96, 62, trim);
  for (let z = -30; z <= 30; z += 5) box(31.75, .68, z, .75, 1.36, .75, sand);
  const waterUniforms = { time: { value: 0 }, deep: { value: new THREE.Color('#416e6a') }, light: { value: new THREE.Color('#9ba68a') } };
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: waterUniforms, transparent: false, side: THREE.DoubleSide,
    vertexShader: 'varying vec3 wp;void main(){wp=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform float time;uniform vec3 deep;uniform vec3 light;varying vec3 wp;void main(){float a=sin(wp.x*1.4+wp.z*.32+time*.5)*sin(wp.z*3.2-wp.x*.6-time*.7);float b=pow(max(0.,sin(wp.z*7.+wp.x*1.7-time*.8)),18.)*.16;float haze=clamp(abs(wp.z)/180.,0.,.5);vec3 c=mix(deep,light,a*.12+.25+b+haze);gl_FragColor=vec4(c,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
  });
  const waterGeometry = new THREE.PlaneGeometry(160, 280);
  const water = new THREE.Mesh(waterGeometry, waterMaterial); water.rotation.x = -Math.PI / 2; water.position.set(119, -2.65, -5);
  root.add(water); resources.push(waterGeometry, waterMaterial);
  // Far bank and discreet trees beyond the river.
  box(114, -2.45, -9, 10, .4, 250, sand);
  for (let z = -95; z < 95; z += 9) tree(112 + rand() * 5, z, 1.4 + rand() * .5, -2.2);

  // Boundary architecture and distant everyday city buildings.
  for (const x of [-32.2]) box(x, 1.45, 0, .8, 2.9, 65, mat('#ad9471', plaster));
  box(0, 1.4, -31.1, 65, 2.8, .7, mat('#ba9d77', plaster));
  box(0, .62, 31.4, 65, 1.24, .7, sand);
  for (let i = 0; i < 18; i++) {
    const x = -60 + i * 7.6; const z = -40 - rand() * 13;
    const h = 5 + rand() * 11; const w = 5 + rand() * 5;
    const color = ['#c2aa8b', '#d4b68c', '#b9aa91', '#bb9879'][i % 4];
    box(x, h / 2, z, w, h, 9, mat(color, plaster));
    box(x, h + .1, z, w + .3, .25, 9.2, trim);
    for (let floor = 3; floor < h; floor += 2.7) for (let n = -1; n <= 1; n++) box(x + n * 1.8, floor, z + 4.55, .8, 1.25, .1, mat('#777e70'));
    if (i % 3 === 0) cylinder(x, h + .6, z, .7, .7, 1.2, dark, 8);
  }
  for (let i = 0; i < 5; i++) tree(-36 - rand() * 2, -21 + i * 12, 1.3 + rand() * .3);
  for (let i = 0; i < 7; i++) tree(36, -40 - i * 7, 1.15, -.6);

  // Gate signage and route markers give the fictional map its own identity.
  const district = label('गोदावरी बाजार', 'GODAVARI QUARTER  ·  NANDED', '#324e4b');
  plane(9, 2.05, -30.68, 8.2, 1.6, district.material, 0, 0);
  const blueMark = label('A  ←', 'WEST BAZAAR', '#3b6b70', '#eee1b8');
  plane(-24.38, 1.75, -.9, 2, .8, blueMark.material, 0, Math.PI / 2);
  const orangeMark = label('B  →', 'RIVER WALK', '#ab603a', '#eee1b8');
  plane(24.53, 2, -17, 2, .8, orangeMark.material, 0, Math.PI / 2);

  // Lamp posts on the promenade; pale warm glass is readable without expensive point lights.
  const lampGlass = new THREE.MeshStandardMaterial({ color: '#f9dda3', emissive: '#ffc66e', emissiveIntensity: .55, roughness: .45 }); resources.push(lampGlass);
  for (const { x, z } of LAMP_POLES) {
    cylinder(x, 2.6, z, .055, .1, 5.2, iron, 8);
    wire([new THREE.Vector3(x, 5, z), new THREE.Vector3(x - .3, 5.5, z), new THREE.Vector3(x - 1, 5.3, z)], .055, iron);
    box(x - .95, 5.15, z, .75, .13, .35, iron); box(x - .95, 5.07, z, .64, .035, .27, lampGlass);
  }

  // Leaf litter, paper, road scuffs and pots supply scale at ground level.
  for (let i = 0; i < 65; i++) {
    const x = -28 + rand() * 56; const z = -11 + rand() * 22;
    plane(x, .012, z, .08 + rand() * .2, .1 + rand() * .22, i % 4 ? mat('#a0926f') : offWhite, -Math.PI / 2, rand() * 6);
  }
  for (const { x, z } of PLANT_POTS) {
    cylinder(x, .3, z, .31, .2, .6, mat('#ae6746'), 8);
    for (let i = 0; i < 3; i++) add(new THREE.ConeGeometry(.2, .6, 5), foliage[i], x + (rand() - .5) * .2, .77, z + (rand() - .5) * .2);
  }

  // Batch all stationary objects by material: a few dozen draw calls, even with rich facades.
  for (const [material, geometries] of batches) {
    const merged = mergeGeometries(geometries, false);
    for (const geometry of geometries) geometry.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material); mesh.castShadow = true; mesh.receiveShadow = true;
    root.add(mesh); resources.push(merged);
  }
  batches.clear();

  const birds = new THREE.Group();
  const birdMaterial = new THREE.MeshBasicMaterial({ color: '#626958', side: THREE.DoubleSide }); resources.push(birdMaterial);
  for (let i = 0; i < 6; i++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-.4, .04, .12, 0, 0, 0, -.17, .02, -.06, 0, 0, 0, .4, .04, .12, .17, .02, -.06], 3));
    const bird = new THREE.Mesh(g, birdMaterial); bird.position.set((i % 3) * 2, (i % 2) * 1.5, i * 1.5); birds.add(bird); resources.push(g);
  }
  birds.position.set(15, 23, -13); root.add(birds);

  return {
    /** Time in seconds. Water and a distant flock are the only moving environment objects. */
    update(time: number) {
      waterUniforms.time.value = time;
      birds.position.set(10 + Math.cos(time * .035) * 29, 24 + Math.sin(time * .13), -16 + Math.sin(time * .035) * 18);
      birds.rotation.y = -time * .035;
      birds.children.forEach((bird, i) => { bird.rotation.z = Math.sin(time * 3 + i) * .09; });
    },
    dispose() {
      scene.remove(root);
      for (const resource of resources) resource.dispose();
      sun.shadow.dispose();
    },
  };
}
