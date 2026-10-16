/** Original fictional riverside precinct inspired by Nanded. Units are metres. */
export type MapPoint = { x: number; z: number };
export type Collider = MapPoint & { w: number; d: number; h: number };

export const MAP_BOUNDS = { minX: -31, maxX: 31, minZ: -30, maxZ: 30 };

export const BUILDINGS = [
  { x: -20, z: -19, w: 17, d: 14, h: 8.6, color: '#d69c68', accent: '#3b797a', name: 'गोदावरी ट्रेडर्स', label: 'GODAVARI TRADERS' },
  { x: -6, z: -22, w: 9, d: 8, h: 6.5, color: '#e5c29b', accent: '#b95738', name: 'नांदेड चहा', label: 'NANDED CHAI' },
  { x: 16, z: -19, w: 17, d: 14, h: 10.1, color: '#c98255', accent: '#517e70', name: 'महाराष्ट्र भंडार', label: 'MAHARASHTRA STORES' },
  { x: -21, z: 19, w: 15, d: 14, h: 7.4, color: '#dba97d', accent: '#657f78', name: 'जुना बाजार', label: 'OLD BAZAAR' },
  { x: -6, z: 23, w: 8, d: 9, h: 9.2, color: '#bd7c56', accent: '#86745a', name: 'सह्याद्री वस्त्र', label: 'SAHYADRI TEXTILES' },
  { x: 16, z: 20, w: 15, d: 13, h: 7.6, color: '#e5b787', accent: '#bb663f', name: 'गोदावरी किराणा', label: 'GODAVARI GROCERS' },
  { x: -27, z: -1, w: 5, d: 12, h: 5.3, color: '#bc8d70', accent: '#496e65', name: 'पान दुकान', label: 'CORNER SHOP' },
];

export const COVER: (Collider & { kind: 'crate' | 'barrels' | 'cart' | 'planter' })[] = [
  { x: -8.8, z: -6.7, w: 2.6, d: 2.3, h: 2.15, kind: 'crate' },
  { x: 5.8, z: -6.8, w: 3.1, d: 1.5, h: 1.35, kind: 'barrels' },
  { x: 12.5, z: 3.9, w: 3.9, d: 2.1, h: 2.5, kind: 'cart' },
  { x: -8, z: 7.2, w: 2.5, d: 2.6, h: 2.2, kind: 'crate' },
  { x: 3.4, z: 15.1, w: 2.6, d: 2.0, h: 1.45, kind: 'crate' },
  { x: 25.8, z: 10.2, w: 2.2, d: 2.2, h: 1.0, kind: 'planter' },
  { x: 26.5, z: -8, w: 2.0, d: 2.0, h: 1.0, kind: 'planter' },
  { x: -18, z: 5.6, w: 3.0, d: 1.5, h: 1.4, kind: 'barrels' },
  { x: -0.4, z: -14.1, w: 2.3, d: 1.7, h: 1.7, kind: 'crate' },
];

export const UTILITY_POLES = [{ x: -21.5, z: -8.8 }, { x: 21.5, z: -8.8 }];
export const LAMP_POLES = [{ x: 30.1, z: -24 }, { x: 30.1, z: -3 }, { x: 30.1, z: 22 }];
export const PLANT_POTS = [{ x: -13, z: 12 }, { x: -25, z: 11 }, { x: 10, z: 13.2 }, { x: 21, z: -11.4 }];

/** x and z are centres; width is the x dimension, depth the z dimension. */
export const COLLIDERS: Collider[] = [
  ...BUILDINGS.map(({ x, z, w, d, h }) => ({ x, z, w, d, h })),
  ...COVER.flatMap(({ x, z, w, d, h, kind }) => kind === 'crate' && h > 2
    ? [{ x, z, w, d, h: h * .53 }, { x: x - .15, z: z + .1, w: w * .65, d: d * .8, h }]
    : [{ x, z, w, d, h }]),
  ...COVER.filter(c => c.kind === 'planter').map(({ x, z }) => ({ x, z, w: .45, d: .45, h: 4.37 })),
  ...UTILITY_POLES.map(p => ({ ...p, w: .3, d: .3, h: 9.5 })),
  ...LAMP_POLES.map(p => ({ ...p, w: .2, d: .2, h: 5.2 })),
  ...PLANT_POTS.map(p => ({ ...p, w: .62, d: .62, h: .6 })),
];

export const SPAWNS = {
  blue: [{ x: -21, z: 28.5 }, { x: -15, z: 28.5 }, { x: -10, z: 29 }, { x: -29, z: 28.5 }],
  orange: [{ x: 15, z: -28.5 }, { x: 21, z: -28.5 }, { x: 27.5, z: -28.5 }, { x: 7, z: -28.5 }],
};

// The open lanes form a complete connected circuit with cross-map shortcuts.
export const WAYPOINTS: MapPoint[] = [
  { x: -29.5, z: 28.5 }, { x: -21, z: 28.5 }, { x: -15, z: 28.5 }, { x: -11, z: 28.5 },
  { x: -1, z: 28.5 }, { x: 5, z: 28.5 }, { x: 16, z: 28.5 }, { x: 27.5, z: 28.5 },
  { x: -30, z: 8.5 }, { x: -21, z: 9 }, { x: -13, z: 9 }, { x: -10.5, z: 14 },
  { x: -10.5, z: 21 }, { x: -2, z: 11 }, { x: 4, z: 10 }, { x: 8, z: 9.5 },
  { x: 17, z: 9.5 }, { x: 23.8, z: 9 }, { x: 29, z: 10 }, { x: 27.5, z: 19 },
  { x: -22, z: 0 }, { x: -15, z: 0 }, { x: -5, z: 0 }, { x: 2, z: 0 },
  { x: 8, z: 0 }, { x: 18, z: 0 }, { x: 27.5, z: 0 },
  { x: -30, z: -9 }, { x: -23, z: -9 }, { x: -14, z: -8.5 }, { x: -4, z: -8.5 },
  { x: 1, z: -8 }, { x: 10, z: -9 }, { x: 18, z: -9 }, { x: 29, z: -9 },
  { x: -10.5, z: -15 }, { x: 3.5, z: -15 }, { x: 3.5, z: -23 }, { x: 27.5, z: -19 },
  { x: -30, z: -28.5 }, { x: -20, z: -28.5 }, { x: -10, z: -28.5 }, { x: 0, z: -28.5 },
  { x: 7, z: -28.5 }, { x: 15, z: -28.5 }, { x: 22, z: -28.5 }, { x: 28, z: -28.5 },
  { x: -30, z: -18 }, { x: -30, z: 18 }, { x: 4, z: 20 },
];
