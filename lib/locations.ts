/** Verified public-road starting sectors. Locality labels are not surveyed boundaries.
 * x=east, -z=north; projected at 19.1743N, 77.3111E. Source: /map-reference.json. */
export type MapLocation = {id:string;name:string;label:string;x:number;z:number;yaw:number;description:string;latitude:number;longitude:number;sourceOffsetMetres:number};
export const DEFAULT_LOCATION_ID = 'bhagya';
export const LOCATIONS: MapLocation[] = [
  {
    "id": "bhagya",
    "name": "Bhagya Nagar",
    "label": "भाग्यनगर",
    "x": -180.24,
    "z": -323.62,
    "yaw": -2.16,
    "description": "At the mapped Bhagya Nagar Road junction; nearby OSM addresses identify Bhagya Nagar Kaman.",
    "latitude": 19.1772071,
    "longitude": 77.3093858,
    "sourceOffsetMetres": 0.0
  },
  {
    "id": "workshop",
    "name": "Workshop Corner",
    "label": "वर्कशॉप कॉर्नर",
    "x": -726.54,
    "z": -635.16,
    "yaw": -2.3,
    "description": "Workshop Corner approach on the Vazirabad Road junction, supported by mapped local addresses.",
    "latitude": 19.1800057,
    "longitude": 77.3041901,
    "sourceOffsetMetres": 0.0
  },
  {
    "id": "shrinagar",
    "name": "Shri Nagar",
    "label": "श्रीनगर",
    "x": -563.36,
    "z": -165.47,
    "yaw": -1.6,
    "description": "Along the OSM street named SRINAGAR, west of Yashwant College Road.",
    "latitude": 19.1758001,
    "longitude": 77.3058,
    "sourceOffsetMetres": 6.3
  },
  {
    "id": "anand",
    "name": "Anand Nagar",
    "label": "आनंदनगर",
    "x": 488.19,
    "z": 163.89,
    "yaw": 0.9,
    "description": "Bhagya Nagar Road near mapped Anand Nagar addresses; locality boundaries are approximate.",
    "latitude": 19.17275,
    "longitude": 77.3157,
    "sourceOffsetMetres": 9.8
  },
  {
    "id": "college-road",
    "name": "Yashwant College Road",
    "label": "यशवंत कॉलेज रोड",
    "x": -212.1,
    "z": 3.82,
    "yaw": 3.05,
    "description": "The mapped north–south road beside the college corridor; road name supported by public addresses.",
    "latitude": 19.1742657,
    "longitude": 77.3090828,
    "sourceOffsetMetres": 0.0
  },
  {
    "id": "baba",
    "name": "Baba Nagar",
    "label": "बाबानगर",
    "x": -149.32,
    "z": 495.35,
    "yaw": -0.12,
    "description": "Public frontage by Yeshwant College and Government Polytechnic; official addresses place these in Baba Nagar.",
    "latitude": 19.1699,
    "longitude": 77.3098,
    "sourceOffsetMetres": 13.8
  },
  {
    "id": "iti",
    "name": "ITI Shri Nagar",
    "label": "शासकीय आयटीआय",
    "x": -703.16,
    "z": 513.29,
    "yaw": -0.2,
    "description": "Public road approach to the mapped Government ITI campus; campus massing uses actual footprint geometry.",
    "latitude": 19.1697,
    "longitude": 77.30445,
    "sourceOffsetMetres": 4.1
  }
];
export const LOCATION = {name:'Nanded neighbourhoods',city:'Nanded',latitude:19.1743,longitude:77.3111,source:'/map-reference.json'};
