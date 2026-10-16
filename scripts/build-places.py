#!/usr/bin/env python3
"""Reconcile all named POIs in the bundled geographic sources without moving geometry.

First acquisition (official client reads latest Overture STAC release):
  uvx overturemaps download --bbox=77.3018,19.1678,77.3204,19.1808 -f geojson --type=place -o /tmp/nanded-places.geojson
  python scripts/build-places.py --overture /tmp/nanded-places.geojson --release 2026-09-23.1
Offline reproducible rebuild:
  python scripts/build-places.py

No claim of completeness, current operation, surveyed entrances or photographic
facades is made. Source point positions and source confidence are retained.
"""
from __future__ import annotations
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import unicodedata
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
BBOX = (77.3018, 19.1678, 77.3204, 19.1808)
ORIGIN = (19.1743, 77.3111)
SCALE = 111320 * math.cos(math.radians(ORIGIN[0]))
SECTORS = {
 'bhagya': (19.1772071, 77.3093858), 'workshop': (19.1800057,77.3041901),
 'shrinagar': (19.1758001,77.3058), 'anand': (19.17275,77.3157),
 'college-road': (19.1742657,77.3090828),
}
POI_KEYS = {'amenity','shop','tourism','leisure','historic','office','healthcare','craft','building','landuse','place','man_made'}
EXCLUDED_LOCALITIES = {'nagpur','samastipur','parbhani'}

def write(path, obj, compact=False):
 path.write_text(json.dumps(obj, ensure_ascii=False, indent=None if compact else 2, separators=(',',':') if compact else None)+'\n')

def project(lat,lon):
 return (round((lon-ORIGIN[1])*SCALE,2), round(-(lat-ORIGIN[0])*111320,2))

def in_bbox(lat,lon):
 return BBOX[0]<=lon<=BBOX[2] and BBOX[1]<=lat<=BBOX[3]

def normalize(name):
 name=unicodedata.normalize('NFKD',name.casefold()).replace('&','and')
 return ' '.join(re.findall(r'\w+',name,flags=re.UNICODE))

def distance(a,b):
 return math.hypot(a['x']-b['x'], a['z']-b['z'])

def clean_name(name):
 # One inspected OSM record contains copied map-interface text before the actual name.
 if name == '\ue5c4 Nanded \ue8b6   17 photos Mochi Shoes': return 'Mochi Shoes'
 return ' '.join(name.split())

def polygon_center(points):
 if len(points)>3 and points[0]==points[-1]:
  # Work relative to the first coordinate to avoid cancellation with degree values.
  ox,oy=points[0]; p=[(x-ox,y-oy) for x,y in points]
  cross=[p[i][0]*p[i+1][1]-p[i+1][0]*p[i][1] for i in range(len(p)-1)]
  area=sum(cross)
  if abs(area)>1e-15:
   return (ox+sum((p[i][0]+p[i+1][0])*c for i,c in enumerate(cross))/(3*area),oy+sum((p[i][1]+p[i+1][1])*c for i,c in enumerate(cross))/(3*area))
 return tuple(sum(p[i] for p in points)/len(points) for i in (0,1))

def classify(raw, name='', hierarchy=()):
 key=raw.lower(); tree=set(hierarchy)
 if key in {'hostel','hotel','motel','guest_house','lodging','bed_and_breakfast'} or 'lodging' in tree:return 'hotel'
 if key in {'restaurant','fast_food','ice_cream','cafe','bar','pub','food_court','coffee_shop','bakery','tea_room','dessert_shop','patisserie_cake_shop'} or tree & {'eat_and_drink','restaurant','casual_eatery','non_alcoholic_beverage_venue'}:return 'food'
 if key in {'hospital','clinic','doctors','dentist','pharmacy','healthcare'} or tree & {'health_care','specialized_health_care','pharmacy_and_drug_store','dental_clinic','complementary_and_alternative_medicine','diagnostics_imaging_or_lab_service'}:return 'health'
 if key in {'school','college','university','kindergarten','prep_school','education','institute','library','schoolyard'} or tree & {'education','educational_service','place_of_learning','specialty_school','tutoring_service','college_university'}:return 'education'
 if key in {'place_of_worship','memorial','museum','park','pitch','statue','monument','attraction','historic_site','schoolyard','nature_reserve'} or tree & {'religious_organization','hindu_place_of_worship','park','historic_site'}:return 'landmark'
 if tree & {'shopping','vehicle_dealer'}:return 'shop'
 if tree & {'services_and_business','travel_and_transportation','community_and_government','sports_and_recreation','personal_or_beauty_service','sport_or_fitness_facility'}:return 'service'
 if key in {'fuel','bank','atm','telephone','post_office','police','government','association','services','fitness_centre','sports_hall','amusement_arcade','rest_area','office'}:return 'service'
 return 'other'

def row(source_id,name,category,raw,lat,lon,source,url,verification,address='',confidence=None):
 x,z=project(lat,lon)
 sector=min(SECTORS,key=lambda s:math.hypot((SECTORS[s][1]-lon)*SCALE,(SECTORS[s][0]-lat)*111320))
 out={'id':source_id.replace('/','-').replace(':','-'),'name':clean_name(name),'category':category,'rawCategory':raw,'latitude':lat,'longitude':lon,'x':x,'z':z,'sector':sector,'sourceUrl':url,'source':source,'verification':verification,'sourceIds':[source_id]}
 if address:out['address']=address
 if confidence is not None:out['confidence']=confidence
 return out

def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--overture',type=Path)
 parser.add_argument('--release')
 args=parser.parse_args()
 old=json.loads((PUBLIC/'place-source.json').read_text()) if (PUBLIC/'place-source.json').exists() else {}
 if args.overture:
  overture=json.loads(args.overture.read_text())
  if not args.release: parser.error('--release is required for a new download')
  release=args.release; accessed=datetime.now(timezone.utc).isoformat(timespec='seconds')
 else:
  overture=old['raw']['overture'];release=old['release'];accessed=old['accessed']
 candidates=[]; rows=[]; osm_raw=[]
 coordinate_counts=Counter(tuple(f['geometry']['coordinates']) for f in overture['features'] if f.get('geometry',{}).get('type')=='Point')
 osm=ET.parse(PUBLIC/'map-source.osm').getroot()
 nodes={n.get('id'):(float(n.get('lon')),float(n.get('lat'))) for n in osm.findall('node')}
 all_elements=Counter(e.tag for e in osm)
 structural=0
 for e in osm:
  if e.tag not in {'node','way','relation'}:continue
  tags={t.get('k'):t.get('v') for t in e.findall('tag')}
  if not (tags.get('name') or (POI_KEYS & tags.keys())):
   structural+=1;continue
  sid=f"osm:{e.tag}/{e.get('id')}"; name=tags.get('name','')
  rec={'sourceId':sid,'source':'osm','name':name,'status':'included'}
  osm_raw.append({'sourceId':sid,'element':e.tag,'id':e.get('id'),'attributes':dict(e.attrib),'tags':tags})
  coord=None
  if e.tag=='node':coord=nodes[e.get('id')]
  elif e.tag=='way':
   pts=[nodes[n.get('ref')] for n in e.findall('nd') if n.get('ref') in nodes]
   if pts:coord=polygon_center(pts)
  if e.tag=='relation' or tags.get('boundary')=='administrative':rec['status']='administrative-boundary'
  elif tags.get('highway') and tags['highway'] not in {'services','rest_area'}:rec['status']='road-not-place'
  elif tags.get('place') in {'city','neighbourhood','suburb','town','hamlet'}:rec['status']='locality-not-building'
  elif not name:rec['status']='no-name'
  elif coord is None:rec['status']='missing-coordinate'
  elif not in_bbox(coord[1],coord[0]):rec['status']='outside-bounds'
  if coord:rec.update(longitude=coord[0],latitude=coord[1])
  if rec['status']=='included':
   raw=next((tags[k] for k in ['amenity','shop','tourism','historic','leisure','office','healthcare','building','landuse','highway'] if tags.get(k)), 'unspecified')
   cat=classify(raw,name)
   if 'shop' in tags and cat=='other':cat='shop'
   address=tags.get('addr:full') or ', '.join(tags.get(k,'') for k in ['addr:housenumber','addr:street','addr:city'] if tags.get(k))
   item=row(sid,name,cat,raw,coord[1],coord[0],'osm',f"https://www.openstreetmap.org/{e.tag}/{e.get('id')}",'mapped',address)
   item['locationQuality']='area-centroid' if e.tag=='way' else 'source-point'
   if e.get('timestamp'):item['updatedAt']=e.get('timestamp')
   if clean_name(name)!=name:rec['nameCleaning']='Whitespace normalized; removed copied map interface prefix if present.'
   if e.tag=='way':rec['coordinateBasis']='Centroid of the mapped polygon, not a surveyed entrance.'
   rows.append(item)
  candidates.append(rec)
 for feature in overture['features']:
  p=feature['properties']; sid='overture:'+feature['id'];name=(p.get('names') or {}).get('primary','')
  geometry=feature.get('geometry') or {};coords=geometry.get('coordinates')
  rec={'sourceId':sid,'source':'overture','name':name,'status':'included'}
  addresses=p.get('addresses') or []; taxonomy=p.get('taxonomy') or {}
  if not name.strip():rec['status']='no-name'
  elif geometry.get('type')!='Point' or not coords:rec['status']='missing-coordinate'
  elif not in_bbox(coords[1],coords[0]):rec['status']='outside-bounds'
  elif any((a.get('locality') or '').casefold() in EXCLUDED_LOCALITIES for a in addresses):
   rec['status']='address-coordinate-conflict';rec['reason']='Source address explicitly names a different city; retain for review instead of placing it in Nanded.'
  elif feature['id']=='bdec0d6d-86dd-402a-9486-534e8b28b801':
   rec.update(status='reported-closed',reason='Live Google Maps inspected 2026-10-16 reports permanently closed. Official locator still lists it, so conflicting status is retained for review.',statusSource='https://www.google.com/maps/search/?api=1&query=Kake%20Di%20Hatti%20Nanded')
  elif feature['id']=='c6e7e579-e81d-4cf4-90db-eefcc79b0642':
   rec.update(status='address-coordinate-conflict',reason='Source address contains Plus Code 58G6+CCV. Recovering it near Nanded using Google Open Location Code gives 19.1761125,77.311046875, about 914m from the source point. Campus identity/location needs review; do not assign a false precise frontage.',addressCoordinate={'latitude':19.1761125,'longitude':77.311046875},addressCode='7JFV58G6+CCV',coordinateMethod='openlocationcode 1.0.1 recoverNearest with reference 19.1743,77.3111; https://github.com/google/open-location-code')
  if coords:rec.update(longitude=coords[0],latitude=coords[1])
  if rec['status']=='included':
   raw=taxonomy.get('primary') or p.get('basic_category') or 'unspecified'
   address=', '.join(str(addresses[0].get(k)) for k in ['freeform','locality','postcode'] if addresses and addresses[0].get(k))
   urls=[u for u in (p.get('websites') or [])+(p.get('socials') or []) if u.startswith(('https://','http://'))]
   url=urls[0] if urls else 'https://docs.overturemaps.org/guides/places/'
   item=row(sid,name,classify(raw,name,taxonomy.get('hierarchy') or []),raw,coords[1],coords[0],'overture',url,'listed',address,p.get('confidence'))
   updates=[s['update_time'] for s in p.get('sources',[]) if s.get('update_time') and s.get('dataset')!='Overture']
   if updates:item['updatedAt']=max(updates)
   shared=coordinate_counts[tuple(coords)]
   item['locationQuality']='shared-coordinate' if shared>=3 else 'source-point'
   if shared>=3:
    item['sharedCoordinateCount']=shared
    rec['coordinateCaution']='Three or more records share exactly this coordinate; this may be an area geocode, not the storefront.'
   rows.append(item)
  candidates.append(rec)
 # Previously inspected photo references remain separate from directory-only listings.
 models=json.loads((PUBLIC/'landmark-reference.json').read_text())['models']
 district_path=PUBLIC/'district-landmark-reference.json'
 district=json.loads(district_path.read_text()) if district_path.exists() else {'models':[],'notModelled':[]}
 models+=district['models']
 for model in models:
  c=model['coordinate']; sid='landmark:'+model['id']
  cat=model.get('category') or ('education' if model['id']!='bhagya-kaman' else 'landmark')
  source_kind='official' if model.get('officialLocation') and 'google.com/' not in model['officialLocation'] else 'reference'
  item=row(sid,model['name'],cat,'photo-referenced landmark',c['latitude'],c['longitude'],source_kind,model.get('officialLocation') or model['photoPage'],'photo-reference')
  item['locationQuality']='photo-reference'; item['updatedAt']='2026-10-16'
  rows.append(item)
  candidates.append({'sourceId':sid,'source':source_kind,'name':model['name'],'latitude':c['latitude'],'longitude':c['longitude'],'status':'included'})
 # The official Jockey branch pin is verified, but a matching footprint was not.
 # Keep it searchable without claiming a reconstructed or precisely fitted facade.
 for model in district.get('notModelled',[]):
  if not model['name'].startswith('Jockey Exclusive Store'):continue
  c=model['coordinate'];sid='official:jockey-bhagya'
  item=row(sid,model['name'],'shop','clothing_store',c['latitude'],c['longitude'],'official',model['source'],'listed','Shops 2 and 3, Malhar Sankul, Narhar Kunrudar Marg, opposite IIB Institute, Bhagya Nagar, Nanded 431605')
  item.update(locationQuality='source-point',updatedAt=district['reviewedAt'])
  rows.append(item)
  candidates.append({'sourceId':sid,'source':'official','name':model['name'],'latitude':c['latitude'],'longitude':c['longitude'],'status':'included','placementCaveat':model['reason']})
 # Only exact normalized names within 35 m are merged automatically. Branches and
 # dissimilar names remain separate; their coordinates are never averaged.
 # Photo references, then OSM, then higher confidence Overture take precedence.
 rows.sort(key=lambda r:({'official':0,'reference':0,'osm':1,'overture':2}[r['source']],-(r.get('confidence') or 0),r['id']))
 merged=[]; audit={r['sourceId']:r for r in candidates}
 for item in rows:
  key=normalize(item['name']).replace(' ','')
  match=next((r for r in merged if normalize(r['name']).replace(' ','')==key and distance(r,item)<=35),None)
  if match:
   match['sourceIds']+=item['sourceIds']
   audit[item['sourceIds'][0]].update(status='duplicate',duplicateOf=match['id'],reason='Exact normalized name within 35 metres; preferred source coordinates retained.')
  else:merged.append(item)
 aliases=json.loads((ROOT/'scripts/place-aliases.json').read_text())
 for pair in aliases['pairs']:
  keep=next((r for r in merged if pair['keep'] in r['sourceIds']),None)
  remove=next((r for r in merged if pair['merge'] in r['sourceIds']),None)
  if not keep or not remove or keep is remove:continue
  assert distance(keep,remove)<35, f"Reviewed alias moved: {pair}"
  for sid in remove['sourceIds']:
   audit[sid].update(status='duplicate',duplicateOf=keep['id'],reason=pair['reason'])
  keep['sourceIds']+=remove['sourceIds']
  merged.remove(remove)
 merged.sort(key=lambda r:(r['name'].casefold(),r['id']))
 counts=Counter(c['status'] for c in candidates)
 source_counts={source:dict(Counter(c['status'] for c in candidates if c['source']==source)) for source in ['osm','overture','official','reference']}
 digest=hashlib.sha256((PUBLIC/'map-source.osm').read_bytes()).hexdigest()
 source={'title':'Nanded named place source records and reconciliation','accessed':accessed,'release':release,'boundingBox':dict(zip(['west','south','east','north'],BBOX)),'osmSha256':digest,'raw':{'overture':overture,'osmCandidates':osm_raw,'photoReferences':models,'unmodelledReferences':district.get('notModelled',[])},'reviewedAliases':aliases,'reconciliation':candidates}
 write(PUBLIC/'place-source.json',source,True)
 write(ROOT/'lib/place-data.json',merged,True)
 low=sum(r['source']=='overture' and r.get('confidence',1)<.5 for r in merged)
 reference={'title':'Nanded places directory: coverage and source notes','accessed':accessed,'release':release,'boundingBox':source['boundingBox'],'counts':{'candidates':len(candidates),'places':len(merged),'buildingFootprints':len(json.loads((ROOT/'lib/geodata.json').read_text())['buildings']),'sourceReconciliation':source_counts,'dispositions':dict(counts),'categories':dict(sorted(Counter(r['category'] for r in merged).items())),'sectors':dict(sorted(Counter(r['sector'] for r in merged).items())),'verification':dict(Counter(r['verification'] for r in merged)),'overtureConfidenceBelowHalf':low,'sharedCoordinatePlaces':sum(r.get('locationQuality')=='shared-coordinate' for r in merged),'osmElements':dict(all_elements),'osmStructuralElementsWithoutPlaceTags':structural},'coverage':'Every named point, building, campus and mapped facility candidate in the bundled OSM extract and every Overture place in the same bounding box was reconciled. This is not an exhaustive survey of every operating business. The 5,887 source building footprints and the named places are different datasets; one building can contain multiple businesses.','statusLabels':{'mapped':'Name and position appear in OpenStreetMap; not checked as currently open.','listed':'Name and position appear in a directory or official store listing; source confidence retained when provided. Not checked as currently open.','photo-reference':'A photograph was inspected for the existing custom landmark model. Dimensions and some frontage offsets remain approximate; this is not a current opening-status check.'},'quality':{'pointGeometry':'Original source point coordinates are retained. Mapped areas use their polygon centroid, not a measured entrance. Labels or visiting viewpoints may be offset for visibility and public-road access.','confidence':'Overture confidence is a source model score, not a probability measured by this project. Low scores are retained and visibly identified as unverified listings; no confidence threshold silently removes a business.','duplicates':'Exact normalized names within 35 metres are merged automatically. Additional nearby name aliases and matching telephone numbers were manually reviewed in scripts/place-aliases.json. Every merge decision and original coordinate remains in place-source.json. Uncertain aliases and branches can remain duplicated.','sector':'Nearest of five existing locality anchors, solely for browsing; not an administrative boundary or asserted postal address.','sharedCoordinates':'Three or more records at identical coordinates are marked shared-coordinate and should not be attached to a precise building frontage. This is a review flag, not proof they are co-located.','categories':'Broad display category comes from the source taxonomy or OSM tags; source category is retained. Source tagging mistakes remain possible.','excluded':'Roads, administrative/locality areas, unnamed objects, out-of-bounds geometry and explicit different-city address conflicts and a reported permanently closed listing are retained in reconciliation but not displayed as businesses.','facades':'New place labels do not establish a photo-accurate business facade. Source footprint geometry remains available unchanged; display corrections are documented in /district-landmark-reference.json. No missing shop or building has been invented.'},'gaps':['No complete door-to-door business or building survey is available.','No current opening-status verification; source listings may be stale or misplaced.','Most of the 5,887 source building footprints have no verified business or building name.',f'No photographic reconstruction of every street frontage; {len(models)} custom landmarks have inspected image references.','Duplicate aliases, ambiguous categories and source coordinates can require local correction.'],'sources':[{'name':'OpenStreetMap contributors','url':'https://api.openstreetmap.org/api/0.6/map?bbox=77.3018,19.1678,77.3204,19.1808','raw':'/map-source.osm','license':'ODbL-1.0','attribution':'© OpenStreetMap contributors','licenseUrl':'https://www.openstreetmap.org/copyright'},{'name':'Overture Maps Foundation places','url':'https://docs.overturemaps.org/guides/places/','catalog':'https://stac.overturemaps.org/catalog.json','release':release,'raw':'/place-source.json','license':'Per-record CDLA-Permissive-2.0, Apache-2.0 or CC0-1.0; retained on raw source records','attribution':'Overture Maps Foundation; source providers identified on each record','licenseUrl':'https://docs.overturemaps.org/attribution/'},{'name':'Existing photo references','url':'/landmark-reference.json'},{'name':'Additional street and store references','url':'/district-landmark-reference.json'}],'reproduce':'python scripts/build-places.py rebuilds all outputs offline from bundled raw source records; script header documents acquisition with the official Overture client.','sourceRecords':'/place-source.json','licenseFiles':['/place-licenses/CDLA-Permissive-2.0.txt','/place-licenses/Apache-2.0.txt','/place-licenses/Foursquare-NOTICE.txt']}
 write(PUBLIC/'place-reference.json',reference)
 assert len(merged)+sum(v for k,v in counts.items() if k!='included')==len(candidates)
 print(json.dumps(reference['counts'],indent=2))

if __name__=='__main__':main()
