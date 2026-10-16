"""Reproducible projection of OSM roads and Overture footprints; requires shapely.

Inputs are unchanged upstream downloads, not a hand-drawn replacement street grid.
uv run --with shapely python scripts/build-geodata.py
"""
import json, math, shutil, xml.etree.ElementTree as ET
from pathlib import Path
from collections import defaultdict, deque
from shapely.geometry import Polygon, LineString, Point, box, shape, mapping
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
LAT, LON = 19.1743, 77.3111
SX, SZ = 111320 * math.cos(math.radians(LAT)), 111320
BBOX = [77.3018, 19.1678, 77.3204, 19.1808]
def xy(lon, lat): return ((lon-LON)*SX, -(lat-LAT)*SZ)
def point(p): return {'x':round(p[0],2), 'z':round(p[1],2)}
west,south,east,north=BBOX
xmin,zmax=xy(west,south);xmax,zmin=xy(east,north)
limits=box(xmin,zmin,xmax,zmax)
osm=ET.parse(ROOT/'public/map-source.osm').getroot()
nodes={n.get('id'):(float(n.get('lon')),float(n.get('lat'))) for n in osm.findall('node')}
buildings=[]; polys=[]; surfaces=[]; roads=[]; road_source=[]
overture=json.load(open(ROOT/'public/map-source.json'))
for f in overture['features']:
    prop=f['properties'];name=prop.get('names',{}).get('primary','')
    coords=[xy(*p) for p in f['geometry']['coordinates'][0][:-1]]
    poly=Polygon(coords)
    if not poly.is_valid: poly=poly.buffer(0)
    if poly.geom_type!='Polygon' or poly.area<2:continue
    if name.lower()=='homeguard police ground':
        surfaces.append({'id':f['id'],'name':name,'kind':'ground','points':[point(p) for p in coords]});continue
    loX,loZ,hiX,hiZ=poly.bounds
    # Source has no measured heights: explicit, conservative estimated massing.
    floors=prop.get('num_floors')
    if not floors: floors=1 if poly.area<55 else 2 if poly.area<230 else 3 if poly.area<850 else 2
    height=round(min(18, max(3.2,float(floors)*3.2)),2)
    buildings.append({'id':f['id'],'x':round((loX+hiX)/2,2),'z':round((loZ+hiZ)/2,2),'w':round(hiX-loX,2),'d':round(hiZ-loZ,2),'h':height,'points':[[round(x,2),round(z,2)] for x,z in coords],**({'name':name} if name else {})})
    polys.append(poly)

widths={'primary':7.0,'secondary':6.5,'tertiary':6.0,'unclassified':5.8,'residential':5.4,'service':4.0,'footway':1.8,'path':1.7,'track':3.2,'pedestrian':3.2,'living_street':4.5,'steps':1.8}
for way in osm.findall('way'):
    tags={t.get('k'):t.get('v') for t in way.findall('tag')}
    ll=[nodes[n.get('ref')] for n in way.findall('nd') if n.get('ref') in nodes]
    if len(ll)<2:continue
    wid=way.get('id');highway=tags.get('highway')
    if highway in widths:
        line=LineString([xy(*p) for p in ll]).intersection(limits)
        parts=list(line.geoms) if line.geom_type=='MultiLineString' else [line] if line.geom_type=='LineString' else []
        name=tags.get('name','')
        # Names supported by the locality addresses/official references in map-reference.json.
        if wid in ['102662429','841309108']:name='Bhagya Nagar Road'
        if wid=='267213583':name='Yashwant College Road'
        if wid=='475845759':name='Shri Nagar Road'
        for idx,part in enumerate(parts):
            if part.length<1:continue
            rid=wid if len(parts)==1 else f'{wid}.{idx}'
            roads.append({'id':rid,'osmId':wid,'name':name,'kind':highway,'width':widths[highway],'points':[point(p) for p in part.coords]})
        road_source.append({'type':'Feature','id':'way/'+wid,'properties':tags,'geometry':{'type':'LineString','coordinates':ll}})
    elif tags.get('amenity') in ['college','school','university'] or tags.get('leisure') in ['park','pitch','garden']:
        if ll[0]==ll[-1]:
            poly=Polygon([xy(*p) for p in ll]).intersection(limits)
            if poly.geom_type=='Polygon':surfaces.append({'id':wid,'name':tags.get('name',''),'kind':'campus' if tags.get('amenity') else tags.get('leisure'),'points':[point(p) for p in list(poly.exterior.coords)[:-1]]})

tree=STRtree(polys)
def clear(p, radius=.48):
    shape=Point(p).buffer(radius)
    return not any(polys[int(i)].intersects(shape) for i in tree.query(shape))
def free_segment(a,b,radius=.40):
    s=LineString([a,b]).buffer(radius)
    return not any(polys[int(i)].intersects(s) for i in tree.query(s))

# Split lines at every original bend/intersection; <=18 m leaves room for 22 m graph edges.
waypoints=[]; seen=set()
for road in roads:
    if road['kind'] in ['steps']:continue
    pts=road['points']
    for a,b in zip(pts,pts[1:]):
        a=(a['x'],a['z']);b=(b['x'],b['z']);dx=b[0]-a[0];dz=b[1]-a[1];length=math.hypot(dx,dz)
        steps=max(1,math.ceil(length/17.5))
        for k in range(steps+1):
            p=(a[0]+dx*k/steps,a[1]+dz*k/steps)
            if not (xmin+1<p[0]<xmax-1 and zmin+1<p[1]<zmax-1):continue
            # Satellite footprints occasionally overlap centerlines. Navigation may move
            # sideways inside the estimated road width; the mapped line stays unchanged.
            if not clear(p):
                candidates=[(p[0]-dz/length*o,p[1]+dx/length*o) for o in [1,-1,2,-2] if length and abs(o)<road['width']/2-.5]
                p=next((q for q in candidates if clear(q)),None)
                if p is None:continue
            key=(round(p[0]/1.2),round(p[1]/1.2))
            if key not in seen:seen.add(key);waypoints.append(p)

# Largest connected public street component, using the same 22 m neighbor rule as gameplay.
bins=defaultdict(list)
for i,p in enumerate(waypoints):bins[(math.floor(p[0]/22),math.floor(p[1]/22))].append(i)
adj=[[] for _ in waypoints]
for i,p in enumerate(waypoints):
    bx,bz=math.floor(p[0]/22),math.floor(p[1]/22)
    for xx in range(bx-1,bx+2):
      for zz in range(bz-1,bz+2):
       for j in bins[(xx,zz)]:
        if j>i and math.dist(p,waypoints[j])<21.9 and free_segment(p,waypoints[j]):adj[i].append(j);adj[j].append(i)
components=[];visited=set()
for i in range(len(waypoints)):
    if i in visited:continue
    comp=[];q=deque([i]);visited.add(i)
    while q:
        n=q.popleft();comp.append(n)
        for j in adj[n]:
            if j not in visited:visited.add(j);q.append(j)
    components.append(comp)
components.sort(key=len,reverse=True)
waypoints=[waypoints[i] for i in components[0]]

anchors=[
 ('bhagya','Bhagya Nagar','भाग्यनगर',19.1772071,77.3093858,'At the mapped Bhagya Nagar Road junction; nearby OSM addresses identify Bhagya Nagar Kaman.',-2.16),
 ('workshop','Workshop Corner','वर्कशॉप कॉर्नर',19.1800057,77.3041901,'Workshop Corner approach on the Vazirabad Road junction, supported by mapped local addresses.',-2.3),
 ('shrinagar','Shri Nagar','श्रीनगर',19.1758001,77.3058,'Along the OSM street named SRINAGAR, west of Yashwant College Road.',-1.6),
 ('anand','Anand Nagar','आनंदनगर',19.17275,77.3157,'Bhagya Nagar Road near mapped Anand Nagar addresses; locality boundaries are approximate.',.9),
 ('college-road','Yashwant College Road','यशवंत कॉलेज रोड',19.1742657,77.3090828,'The mapped north–south road beside the college corridor; road name supported by public addresses.',3.05),
 ('baba','Baba Nagar','बाबानगर',19.1699,77.3098,'Public frontage by Yeshwant College and Government Polytechnic; official addresses place these in Baba Nagar.',-.12),
 ('iti','ITI Shri Nagar','शासकीय आयटीआय',19.1697,77.30445,'Public road approach to the mapped Government ITI campus; campus massing uses actual footprint geometry.',-.2),
]
locations=[]
for id,name,label,lat,lon,description,yaw in anchors:
    desired=xy(lon,lat)
    # Choose a clear sampled public road point in the connected navigation graph.
    available=[p for p in waypoints if free_segment(p,(p[0]-math.sin(yaw)*3,p[1]-math.cos(yaw)*3))]
    p=min(available,key=lambda p:math.dist(p,desired))
    # Photo-referenced landmark viewpoints; geographic anchor coordinates stay documented.
    if id=='bhagya':
        p=(-187.8,-311.5);yaw=-.241
        description='View Bhagya Nagar Kaman from the public road south of its entrance; the gate is reconstructed from an inspected photograph.'
    if id=='baba':
        yaw=1.913
        description='Face the photo-referenced Yeshwant College entrance from its public-road approach in Baba Nagar.'
    locations.append({'id':id,'name':name,'label':label,**point(p),'yaw':yaw,'description':description,'latitude':lat,'longitude':lon,'sourceOffsetMetres':round(math.dist(p,desired),1)})

data={'bounds':{'minX':round(xmin,2),'maxX':round(xmax,2),'minZ':round(zmin,2),'maxZ':round(zmax,2)},'roads':roads,'buildings':buildings,'surfaces':surfaces,'waypoints':[point(p) for p in waypoints]}
(ROOT/'lib/geodata.json').write_text(json.dumps(data,separators=(',',':')))
locations_ts='''import { LANDMARKS } from './landmark-data';
/** Verified public-road starting sectors. Locality labels are not surveyed boundaries.
 * x=east, -z=north; projected at 19.1743N, 77.3111E. Source: /map-reference.json. */
export type MapLocation = {id:string;name:string;label:string;x:number;z:number;yaw:number;pitch?:number;description:string;latitude:number;longitude:number;sourceOffsetMetres:number};
export const DEFAULT_LOCATION_ID = 'bhagya';
export const LOCATIONS: MapLocation[] = '''+json.dumps(locations,ensure_ascii=False,indent=2)+''';
// Photo-referenced institutions get public-road viewpoints, never spawns inside a building.
for(const landmark of LANDMARKS.filter(l=>l.buildingId&&!LOCATIONS.some(location=>location.id===l.locationId)))LOCATIONS.push({
 id:landmark.locationId,name:landmark.name,label:landmark.name,
 ...landmark.viewpoint,pitch:Math.atan2((landmark.height??10)*.46-1.58,Math.hypot(landmark.viewpoint.x-landmark.x,landmark.viewpoint.z-landmark.z)),description:landmark.description,latitude:landmark.latitude,longitude:landmark.longitude,sourceOffsetMetres:Math.round(Math.hypot(landmark.viewpoint.x-(landmark.longitude-77.3111)*111320*Math.cos(19.1743*Math.PI/180),landmark.viewpoint.z+(landmark.latitude-19.1743)*111320)*10)/10,
});
export const LOCATION = {name:'Nanded neighbourhoods',city:'Nanded',latitude:19.1743,longitude:77.3111,source:'/map-reference.json'};
'''
(ROOT/'lib/locations.ts').write_text(locations_ts)
overture['source']={'release':'2026-09-23.1','bbox':BBOX,'attribution':'© OpenStreetMap contributors, Overture Maps Foundation; Google Open Buildings','license':'https://docs.overturemaps.org/attribution/','downloaded':'2026-10-16'}
(ROOT/'public/map-source.json').write_text(json.dumps(overture,separators=(',',':')))
(ROOT/'public/map-roads.geojson').write_text(json.dumps({'type':'FeatureCollection','features':road_source,'attribution':'© OpenStreetMap contributors; ODbL-1.0'},separators=(',',':')))
print(json.dumps({'buildings':len(buildings),'roads':len(roads),'surfaces':len(surfaces),'waypoints':len(waypoints),'components':list(map(len,components))[:20],'locations':locations},ensure_ascii=False,indent=2))
