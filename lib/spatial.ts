/** A static grid keeps collision and AI queries local as the street map grows. */
export interface Bounds { x: number; z: number; w: number; d: number; }
export class SpatialGrid<T extends Bounds> {
  private cells = new Map<string, T[]>();
  constructor(items: readonly T[], readonly size = 24) {
    for (const item of items) {
      const [x0, x1, z0, z1] = this.bounds(item.x-item.w/2, item.z-item.d/2, item.x+item.w/2, item.z+item.d/2);
      for (let x=x0;x<=x1;x++) for(let z=z0;z<=z1;z++) {
        const key=`${x},${z}`, bucket=this.cells.get(key);
        if(bucket)bucket.push(item);else this.cells.set(key,[item]);
      }
    }
  }
  private bounds(x0:number,z0:number,x1:number,z1:number) {
    return [Math.floor(x0/this.size),Math.floor(x1/this.size),Math.floor(z0/this.size),Math.floor(z1/this.size)];
  }
  around(x:number,z:number,radius=1):T[] {
    const result=new Set<T>();
    const [x0,x1,z0,z1]=this.bounds(x-radius,z-radius,x+radius,z+radius);
    for(let a=x0;a<=x1;a++)for(let b=z0;b<=z1;b++)for(const item of this.cells.get(`${a},${b}`)??[])result.add(item);
    return [...result];
  }
  along(x:number,z:number,dx:number,dz:number,length:number,padding=1):T[] {
    const result=new Set<T>(),visited=new Set<string>();
    const steps=Math.max(1,Math.ceil(length*Math.hypot(dx,dz)/(this.size*.5)));
    for(let i=0;i<=steps;i++) {
      const t=length*i/steps;
      const [x0,x1,z0,z1]=this.bounds(x+dx*t-padding,z+dz*t-padding,x+dx*t+padding,z+dz*t+padding);
      // A neighboring cell also covers a segment crossing between sampled positions.
      for(let a=x0-1;a<=x1+1;a++)for(let b=z0-1;b<=z1+1;b++) {
        const key=`${a},${b}`;if(visited.has(key))continue;visited.add(key);
        for(const item of this.cells.get(key)??[])result.add(item);
      }
    }
    return [...result];
  }
}
