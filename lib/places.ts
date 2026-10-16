import placeData from './place-data.json';
import { LOCATIONS } from './locations';

export const PLACE_CATEGORIES = [
  {id:'food',label:'Food & drink',color:'#e8b466'},
  {id:'shop',label:'Shops',color:'#a6c874'},
  {id:'hotel',label:'Hotels',color:'#bdacf0'},
  {id:'education',label:'Education',color:'#8bc6e5'},
  {id:'health',label:'Health',color:'#f0a6ac'},
  {id:'landmark',label:'Landmarks',color:'#f3d77c'},
  {id:'service',label:'Services',color:'#9ad5c5'},
  {id:'other',label:'Other places',color:'#c2cbb8'},
] as const;
export type PlaceCategory = typeof PLACE_CATEGORIES[number]['id'];
export const PLACE_SECTORS = LOCATIONS.filter(location=>['bhagya','workshop','anand','shrinagar','college-road'].includes(location.id)).map(location=>({id:location.id,name:location.name,x:location.x,z:location.z}));

type RawPlace = {
  id:string;name:string;category:string;rawCategory?:string;
  latitude:number;longitude:number;x:number;z:number;address?:string;
  sourceUrl:string;source:string;verification:string;sourceIds?:string[];confidence?:number;sourceUpdated?:string;updatedAt?:string;lifecycle?:string;locationQuality?:'source-point'|'area-centroid'|'shared-coordinate'|'photo-reference';sharedCoordinateCount?:number;
  sectorId?:string;sector?:string;
};
export type Place = Omit<RawPlace,'category'> & {category:PlaceCategory;categoryLabel:string;sectorId:string;sectorName:string;sourceLabel:string};

/** These are nearest locality labels, not surveyed neighbourhood boundaries. */
export const PLACES:Place[] = (placeData as RawPlace[]).map(place=>{
  const category=PLACE_CATEGORIES.find(category=>category.id===place.category)??PLACE_CATEGORIES[7];
  const sector=PLACE_SECTORS.find(sector=>sector.id===(place.sectorId??place.sector))??PLACE_SECTORS.reduce((nearest,sector)=>Math.hypot(place.x-sector.x,place.z-sector.z)<Math.hypot(place.x-nearest.x,place.z-nearest.z)?sector:nearest);
  return {...place,category:category.id,categoryLabel:category.label,sectorId:sector.id,sectorName:sector.name,sourceLabel:place.source==='osm'?'OpenStreetMap':place.source==='overture'?'Overture Maps':place.source==='official'?'Official source':place.source==='reference'?'Photo reference':place.source};
}).sort((a,b)=>a.name.localeCompare(b.name));

const placeIndex = new Map(PLACES.map(place=>[place.id,place]));
export const getPlace = (id:string|undefined)=>id?placeIndex.get(id):undefined;
export const placeSearchText = (place:Place)=>`${place.name} ${place.address??''} ${place.categoryLabel} ${place.rawCategory??''} ${place.sectorName}`.toLocaleLowerCase().normalize('NFKC');
