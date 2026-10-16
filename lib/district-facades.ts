import type { FacadeDraw } from './iib-facade';

/** Original mesh relief reconstructed from inspected local photographs. Local +z
 * faces the street. All projection stays inside the shared .64m facade collider.
 * Window/door recesses are opaque exterior detail, not enterable interiors. */
export function drawDistrictFacade(id:string,width:number,height:number,draw:FacadeDraw):boolean {
 const {box,text,rail}=draw;
 const p=(x:number,y:number,w:number,h:number,c:string,z=.12,d=.10)=>box(x*width,y*height,z,w*width,h*height,d,c);
 // Keep the opaque backing behind every glazing/shutter layer. Coplanar front
 // faces flicker when viewed at street level, especially on mobile GPUs.
 const backing=(c:string)=>p(0,.5,1,1,c,0,.10);
 const label=(s:string,x:number,y:number,w:number,h:number,c:string,bg?:string)=>text(s,x*width,y*height,.43,w*width,h*height,c,bg);
 const stairs=(x:number,w:number,h=.08)=>{for(let i=0;i<5;i++)box(x*width,(i+1)*height*h/10,.46-i*.075,w*width,(i+1)*height*h/5,.07,'#9d9d90');};
 const glass=(x:number,y:number,w:number,h:number)=>{p(x,y,w,h,'#243b42');p(x-w/2,y,.008,h,'#b4bcb9',.21,.03);p(x+w/2,y,.008,h,'#b4bcb9',.21,.03);p(x,y-h/2,w,.008,'#b4bcb9',.21,.03);};
 const bars=(x:number,y:number,w:number,h:number,n=5)=>{glass(x,y,w,h);for(let i=1;i<n;i++)p(x-w/2+w*i/n,y,.004,h,'#5b6664',.23,.035);for(const dy of [-.25,0,.25])p(x,y+h*dy,w,.003,'#5b6664',.23,.035);};
 if(id==='nanded-pharmacy') {
  backing('#e3e4c3');
  for(const y of [.27,.72])for(const x of [-.41,-.19,.03,.25,.42])bars(x,y,.135,.23,4);
  // The low, broad entrance portico with terracotta columns is visible in the
  // college's own real photograph; current website concept renders were rejected.
  p(.08,.48,.81,.08,'#dfdfc3',.31,.32);
  for(const x of [-.32,.475])p(x,.235,.04,.47,'#b66e51',.29,.32);
  p(.08,.565,.83,.13,'#f4f4e2',.34,.12);
  p(.08,.641,.83,.017,'#b66e51',.34,.15);
  label('NANDED PHARMACY COLLEGE',.08,.57,.79,.091,'#193747');
  p(.29,.21,.15,.35,'#203732',.18,.08);p(.29,.21,.006,.35,'#bbc4b3',.27,.04);
  stairs(.29,.17,.10);return true;
 }
 if(id==='grand-tulsi') {
  backing('#d4d2c6');p(.12,.55,.75,.75,'#263942');
  for(let y=.25;y<.89;y+=.075)p(.12,y,.75,.003,'#4c5d62',.20,.02);
  for(let x=-.23;x<.51;x+=.11)p(x,.55,.003,.75,'#4c5d62',.20,.02);
  p(-.35,.58,.28,.79,'#d3d1c4',.25,.18);
  for(const x of [-.45,-.39,-.33,-.27])p(x,.58,.018,.79,'#a16f52',.34,.15);
  p(.12,.90,.75,.16,'#ececdd',.24,.16);
  p(.12,.985,.75,.025,'#a16f52',.33,.18);p(.488,.58,.023,.79,'#916248',.31,.18);
  // White geometric jaali band between the two large reflective-glass areas.
  p(0,.53,.97,.12,'#503b32',.26,.15);
  for(let x=-.46;x<.46;x+=.055)for(const y of [.497,.531,.565]) {
   const yy=y*height,xx=x*width,dx=width*.024,dy=height*.017;
   rail([xx-dx,yy,.36],[xx,yy+dy,.36],.032,'#e7e5dc');rail([xx,yy+dy,.36],[xx+dx,yy,.36],.032,'#e7e5dc');
   rail([xx+dx,yy,.36],[xx,yy-dy,.36],.032,'#e7e5dc');rail([xx,yy-dy,.36],[xx-dx,yy,.36],.032,'#e7e5dc');
  }
  p(0,.165,1,.10,'#a36a45',.29,.24);
  label('HOTEL GRAND TULSI',0,.167,.86,.066,'#f2ede3');
  for(const x of [-.27,-.08,.11,.30])glass(x,.065,.18,.12);
  for(const y of [.025,.047,.071])p(0,y,.94,.004,'#a6a8a3',.43,.035);
  for(let x=-.45;x<.5;x+=.11)p(x,.047,.005,.07,'#a6a8a3',.43,.035);
  return true;
 }
 if(id==='amrut-cafe') {
  backing('#f1ecda');
  glass(0,.35,.87,.39);p(0,.35,.012,.39,'#8f785d',.27,.06);
  p(0,.62,.91,.035,'#a6835c',.30,.20);
  p(-.16,.82,.58,.27,'#413d33',.13,.08);
  for(let x=-.42;x<.14;x+=.06)p(x,.82,.005,.27,'#625a47',.22,.035);
  for(const y of [.74,.81,.88,.95])p(-.16,y,.58,.004,'#625a47',.22,.035);
  p(-.16,.704,.59,.07,'#e8e3cd',.27,.10);label('amrut',-.16,.708,.54,.057,'#8c692d');
  label('अमृत',.32,.75,.22,.05,'#4c4334');
  // Raised balcony planter and the distinctive cream entrance arch.
  p(.32,.69,.25,.07,'#b97943',.31,.16);
  for(let x=.21;x<.45;x+=.047)p(x,.77,.004,.10,'#343a35',.36,.03);
  p(.32,.825,.25,.004,'#343a35',.36,.03);
  const cx=width*.28,cy=height*.32,r=width*.16;
  for(let i=0;i<16;i++){const a=i*Math.PI/16,b=(i+1)*Math.PI/16;rail([cx+r*Math.cos(a),cy+r*Math.sin(a),.40],[cx+r*Math.cos(b),cy+r*Math.sin(b),.40],Math.min(width*.035,.12),'#f4efdd');}
  p(.12,.20,.07,.26,'#f4efdd',.40,.10);p(.44,.20,.07,.26,'#f4efdd',.40,.10);
  p(-.2,.12,.56,.19,'#e8e6d5',.31,.14);stairs(.28,.31,.10);
  return true;
 }
 if(id==='panasonic-living') {
  backing('#afb6b5');p(0,.63,.86,.71,'#536971',.12,.08);
  for(const x of [-.28,0,.28])p(x,.63,.005,.71,'#aab5b6',.23,.035);
  for(const y of [.39,.64,.89])p(0,y,.86,.005,'#aab5b6',.23,.035);
  for(const x of [-.48,.48])p(x,.5,.035,1,'#d0d0c7',.30,.20);
  p(0,.47,.94,.065,'#204f8a',.29,.18);label('Panasonic',0,.474,.84,.047,'#ffffff');
  p(0,.414,.94,.045,'#e8e8db',.28,.16);label('Panasonic Living STORE',0,.416,.88,.031,'#2e4f72');
  glass(0,.22,.85,.32);p(0,.22,.012,.32,'#858e8b',.26,.05);
  label('Panasonic',0,.286,.69,.041,'#ffffff','#1a568c');stairs(0,.89,.12);return true;
 }
 if(id==='tekisky-workshop') {
  backing('#e6e2d6');p(.35,.70,.20,.55,'#b46d58',.22,.18);
  for(const y of [.20,.51,.82]) {
   bars(-.19,y,.48,.21,5);p(.30,y,.25,.22,'#7a7e76');
   for(let i=0;i<8;i++)p(.30,y-.10+i*.028,.25,.003,'#c4c4b7',.23,.025);
  }
  p(0,.41,.96,.16,'#f3f1e9',.27,.15);label('TEKISKY',0,.438,.78,.055,'#2e8eb5','#203540');
  label('TRAINING & CONSULTANCY',0,.374,.90,.032,'#354a63');
  p(.31,.11,.27,.15,'#ebe6d8',.27,.10);label('TEKISKY',.31,.125,.26,.033,'#227691');stairs(.30,.31,.09);return true;
 }
 return false;
}
