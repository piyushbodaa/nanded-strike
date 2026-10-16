import type { Landmark } from './landmark-data';

/** Older inferred roof fragments on Amrut's reconstructed forecourt. May 2025
 * street imagery shows the cleared construction frontage; August 2026 photos
 * show the completed cafe. Keep these polygons in the raw geodata archive, but
 * omit them from the current derived render/collision map. */
export const DISTRICT_SUPERSEDED_FOOTPRINTS:readonly string[]=[
 '66020beb-6d0b-4699-afba-ab1680d32592',
 '1c5fdea9-4c10-4ec9-9ad1-82c8888f3f36',
];

/** Additional inspected-photo frontages. Footprint outlines are retained from
 * geodata; heights and facade alignment are estimates. Sources and caveats live
 * at /district-landmark-reference.json. No source photograph ships as a texture. */
export const DISTRICT_LANDMARKS:Landmark[]=[
 {
  id:'nanded-pharmacy',name:'Nanded Pharmacy College',locationId:'shrinagar',
  x:-321.001,z:-169.674,yaw:-1.470885,facadeWidth:24,height:8.4,wallColor:'#e3e4c3',
  buildingId:'a301beaa-6aae-4534-9c11-d16c7ac02080',latitude:19.175868,longitude:77.307992,
  modelStatus:'photo-referenced',sourceUrl:'https://nandedpharmacycollege.org/',photoUrl:'https://nandedpharmacycollege.org/images/sli.jpg',
  description:'The college’s cream exterior, barred windows and terracotta entrance portico follow its official real building photograph. Portico width and alignment on the campus footprint are estimated.',
  viewpoint:{x:-340.3765,z:-202.0224,yaw:-2.6057},
 },
 {
  id:'grand-tulsi',name:'Hotel Grand Tulsi',locationId:'anand',
  x:204.6171,z:-55.5225,yaw:-.565882,facadeWidth:16.3011,height:20.4,wallColor:'#d4d2c6',
  buildingId:'251cb0d9-6abe-49af-aa41-d46c4e482fac',latitude:19.1748063,longitude:77.3131097,
  modelStatus:'photo-referenced',sourceUrl:'https://www.google.com/maps?cid=15162140821138501614',photoUrl:'https://r1imghtlak.mmtcdn.com/080e799624a611eab0bc0242ac110002.jpg',
  description:'Reflective glass, warm vertical fins and the broad white geometric screen recreate the photographed Tulsi Comfort facade. The current place listing uses Hotel Grand Tulsi; sign text reflects that current name.',
  viewpoint:{x:189.8765,z:-45.1578,yaw:-.957968},
 },
 {
  id:'amrut-cafe',name:'Amrut Cafe',locationId:'anand',
  x:413.8033,z:80.9283,yaw:-.548257,facadeWidth:8.0967,height:7.6,wallColor:'#f1ecda',
  buildingId:'c3cd1489-39f0-41c5-871a-a1b8afc0a020',latitude:19.1734942,longitude:77.3150503,
  modelStatus:'photo-referenced',sourceUrl:'https://www.google.com/maps?cid=13213604312182751305',
  photoUrl:'https://www.google.com/maps/place/Amrut+Cafe/@19.1734942,77.3150503,3a,75y,90t/data=!3m4!1e2!3m2!1sCIABIhBd3_Ge5XqfRgFEaZ23zpZf!2e10',
  description:'Amrut’s cream two-storey frame, glass front, upper grille and arched entrance follow an August 2026 exterior photograph. May 2025 imagery shows this frontage under construction; two older forecourt roof fragments are omitted while the main footprint is retained.',
  viewpoint:{x:408.6349,z:105.817,yaw:-.20475},
 },
 {
  id:'panasonic-living',name:'Panasonic Living Store',locationId:'workshop',
  x:-625.9834,z:-602.6206,yaw:1.60459,facadeWidth:7.3,height:11.4,wallColor:'#c4c8c3',
  buildingId:'5cc82083-32f2-47bf-bd02-8f797dc840ec',latitude:19.1797134,longitude:77.3051464,
  modelStatus:'photo-referenced',sourceUrl:'https://www.google.com/maps/@?api=1&map_action=pano&pano=R3AsTqDpNPGzdoJjIDzt_Q&heading=270&pitch=12&fov=85',
  photoUrl:'https://www.google.com/maps/@?api=1&map_action=pano&pano=R3AsTqDpNPGzdoJjIDzt_Q&heading=270&pitch=12&fov=85',
  description:'The grey-glass showroom, blue and white Panasonic Living fascia and entrance steps are observed in May 2025 street imagery. Its portion of the larger mapped building is estimated.',
  viewpoint:{x:-618.6696,z:-602.141,yaw:1.5053},
 },
 {
  id:'tekisky-workshop',name:'Tekisky',locationId:'workshop',
  x:-613.245,z:-605.1873,yaw:-1.537014,facadeWidth:11.5466,height:10.2,wallColor:'#e6e2d6',
  buildingId:'fa24bb39-d9bd-4bda-a1d2-2f9dec93b4f9',latitude:19.1797365,longitude:77.3052676,
  modelStatus:'photo-referenced',sourceUrl:'https://tekisky.com/consultancy',
  photoUrl:'https://www.google.com/maps/@?api=1&map_action=pano&pano=R3AsTqDpNPGzdoJjIDzt_Q&heading=90&pitch=20&fov=95',
  description:'Cream and terracotta frontage, metal shutters and blue Tekisky signs follow May 2025 street imagery, corroborated by the company’s Workshop Corner address. Exact storefront extent is estimated.',
  viewpoint:{x:-618.6696,z:-602.141,yaw:-1.0593},
 },
];
