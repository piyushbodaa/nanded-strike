export type Point2 = {x:number;z:number};
export type Solid = Point2 & {w:number;d:number;h:number;polygon?:Point2[]};

export function insidePolygon(x:number,z:number,points:Point2[]) {
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++) {
    const a=points[i],b=points[j];
    if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside;
  }
  return inside;
}
export function touchesSolid(x:number,z:number,solid:Solid,padding=0) {
  if(x<solid.x-solid.w/2-padding||x>solid.x+solid.w/2+padding||z<solid.z-solid.d/2-padding||z>solid.z+solid.d/2+padding)return false;
  const points=solid.polygon;
  if(!points||insidePolygon(x,z,points))return true;
  for(let i=0;i<points.length;i++) {
    const a=points[i],b=points[(i+1)%points.length],dx=b.x-a.x,dz=b.z-a.z;
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));
    if(Math.hypot(x-a.x-t*dx,z-a.z-t*dz)<=padding+1e-7)return true;
  }
  return false;
}

/** Ray against an extruded footprint; original polygons keep diagonal streets clear. */
export function raySolid(ox:number,oy:number,oz:number,dx:number,dy:number,dz:number,solid:Solid,padding=0):number {
  let near=0,far=Infinity;
  for(const [o,d,min,max] of [[ox,dx,solid.x-solid.w/2-padding,solid.x+solid.w/2+padding],[oy,dy,0,solid.h],[oz,dz,solid.z-solid.d/2-padding,solid.z+solid.d/2+padding]]) {
    if(Math.abs(d)<1e-8){if(o<min||o>max)return Infinity;continue;}
    const a=(min-o)/d,b=(max-o)/d;near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));
    if(near>far)return Infinity;
  }
  const points=solid.polygon;
  if(!points)return near;
  const candidates=[near],horizontal=dx*dx+dz*dz;
  for(let i=0;i<points.length;i++) {
    const a=points[i],b=points[(i+1)%points.length],ex=b.x-a.x,ez=b.z-a.z,length=Math.hypot(ex,ez);
    if(!length)continue;
    for(const offset of padding?[0,padding,-padding]:[0]) {
      const ax=a.x-ez/length*offset,az=a.z+ex/length*offset,denominator=dx*ez-dz*ex;
      if(Math.abs(denominator)<1e-9)continue;
      const t=((ax-ox)*ez-(az-oz)*ex)/denominator;
      const u=((ax-ox)*dz-(az-oz)*dx)/denominator;
      if(u>=0&&u<=1&&t>=near-1e-7&&t<=far+1e-7)candidates.push(Math.max(near,t));
    }
    if(padding&&horizontal>1e-9) {
      const vx=ox-a.x,vz=oz-a.z,bq=2*(vx*dx+vz*dz),cq=vx*vx+vz*vz-padding*padding;
      const disc=bq*bq-4*horizontal*cq;
      if(disc>=0)for(const sign of [-1,1]){const t=(-bq+sign*Math.sqrt(disc))/(2*horizontal);if(t>=near-1e-7&&t<=far+1e-7)candidates.push(Math.max(near,t));}
    }
  }
  for(const t of candidates.sort((a,b)=>a-b))if(touchesSolid(ox+dx*(t+1e-6),oz+dz*(t+1e-6),solid,padding))return t;
  return Infinity;
}
