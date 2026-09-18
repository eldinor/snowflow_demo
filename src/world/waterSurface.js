/** Sparse triangle lookup: swimming uses exactly the visible lake footprint. */
export class WaterSurface {
    constructor(data,level,cellSize=16) {
        this.data=data;this.level=level;this.cellSize=cellSize;this.cells=new Map();
        const p=data.positions,ix=data.indices;
        for(let i=0;i<ix.length;i+=3) {
            const a=ix[i]*3,b=ix[i+1]*3,c=ix[i+2]*3;
            for(let z=Math.floor(Math.min(p[a+2],p[b+2],p[c+2])/cellSize);z<=Math.floor(Math.max(p[a+2],p[b+2],p[c+2])/cellSize);z++)
                for(let x=Math.floor(Math.min(p[a],p[b],p[c])/cellSize);x<=Math.floor(Math.max(p[a],p[b],p[c])/cellSize);x++) {
                    const key=`${x},${z}`;if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(i);
                }
        }
    }
    sample(x,z) {
        const {positions:p,indices:ix,colors:c}=this.data;
        for(const i of this.cells.get(`${Math.floor(x/this.cellSize)},${Math.floor(z/this.cellSize)}`)||[]) {
            const a=ix[i],b=ix[i+1],d=ix[i+2];
            const bx=p[b*3]-p[a*3],bz=p[b*3+2]-p[a*3+2],dx=p[d*3]-p[a*3],dz=p[d*3+2]-p[a*3+2];
            const det=bx*dz-dx*bz;if(Math.abs(det)<1e-9)continue;
            const px=x-p[a*3],pz=z-p[a*3+2],u=(px*dz-dx*pz)/det,v=(bx*pz-px*bz)/det;
            if(u>=-1e-6&&v>=-1e-6&&u+v<=1.000001)return {level:this.level,depth:Math.max(0,c[a*4]*(1-u-v)+c[b*4]*u+c[d*4]*v)};
        }
        return null;
    }
}

/** One emitter per 10 m cell; steep blue channel triangles only. */
export function waterfallEmitters(data) {
    const cells=new Map(),p=data.positions,ix=data.indices,c=data.colors;
    for(let i=0;i<ix.length;i+=3) {
        const ids=[ix[i],ix[i+1],ix[i+2]],a=ids[0];if(c[a*4+3]<.65)continue;
        const x=ids.reduce((s,k)=>s+p[k*3],0)/3,y=ids.reduce((s,k)=>s+p[k*3+1],0)/3,z=ids.reduce((s,k)=>s+p[k*3+2],0)/3;
        const key=`${Math.floor(x/10)},${Math.floor(y/10)},${Math.floor(z/10)}`;
        if(!cells.has(key))cells.set(key,{x,y,z,dx:c[a*4+1],dz:c[a*4+2],slope:c[a*4+3]});
    }
    return [...cells.values()];
}
