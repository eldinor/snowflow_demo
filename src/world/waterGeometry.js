/** Blue is a region mask, not an elevation. Clip before raising the lake. */
export function blueWater(r,g,b) { return b > r + .12 && b > g + .1 && r < .3 ? 1 : 0; }

function clip(poly, value) {
    const out=[];
    for(let i=0;i<poly.length;i++) {
        const a=poly[i],b=poly[(i+1)%poly.length],va=value(a),vb=value(b);
        if(va>=0)out.push(a);
        if((va>=0)!==(vb>=0)) { const t=va/(va-vb);out.push(a.map((x,k)=>x+(b[k]-x)*t)); }
    }
    return out;
}
function inside(x,z,poly) {
    let yes=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++) {
        const a=poly[i],b=poly[j];
        if((a[1]>z)!==(b[1]>z) && x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;
    }
    return yes;
}
function riverDistance(x,z,line) {
    let nearest=Infinity;
    for(let i=1;i<line.length;i++) {
        const a=line[i-1],b=line[i],dx=b[0]-a[0],dz=b[1]-a[1];
        const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
        nearest=Math.min(nearest,Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t));
    }
    return nearest;
}
export function buildWaterGeometry(data,reference,level=0) {
    const lake={positions:[],normals:[],colors:[],indices:[]},river={positions:[],normals:[],colors:[],indices:[]};
    // Chart east/north -> the same Babylon frame used by spawn points.
    const polygon=reference.lake.map(([x,z])=>[-x,-z]);
    const line=reference.river.map(([x,z])=>[-x,-z]);
    const p=data.positions,c=data.colors,ix=data.indices;
    function append(target,poly,flow=false) {
        if(poly.length<3)return;
        const a=poly[0],b=poly[1],d=poly[2];
        let nx=(b[1]-a[1])*(d[2]-a[2])-(b[2]-a[2])*(d[1]-a[1]);
        let ny=(b[2]-a[2])*(d[0]-a[0])-(b[0]-a[0])*(d[2]-a[2]);
        let nz=(b[0]-a[0])*(d[1]-a[1])-(b[1]-a[1])*(d[0]-a[0]);
        const length=Math.hypot(nx,ny,nz);if(length<1e-8)return;
        const sign=ny<0?-1:1;nx*=sign/length;ny*=sign/length;nz*=sign/length;
        const slope=Math.hypot(nx,nz),fx=slope>.001?nx/slope:0,fz=slope>.001?nz/slope:1;
        const start=target.positions.length/3;
        for(const v of poly) {
            target.positions.push(v[0]+(flow?nx*.08:0),flow?v[1]+ny*.08:level+.025,v[2]+(flow?nz*.08:0));
            target.normals.push(flow?nx:0,flow?ny:1,flow?nz:0);
            target.colors.push(flow?.25:Math.max(0,level-v[1]),flow?fx:0,flow?fz:0,flow?slope:0);
        }
        for(let i=1;i<poly.length-1;i++)target.indices.push(start,start+i,start+i+1);
    }
    for(let i=0;i<ix.length;i+=3) {
        const tri=[ix[i],ix[i+1],ix[i+2]].map(k=>[p[k*3],p[k*3+1],p[k*3+2],blueWater(c[k*4],c[k*4+1],c[k*4+2])]);
        if(!tri.some(v=>v[3]))continue;
        const wet=clip(tri,v=>v[3]-.5);
        if(wet.length<3)continue;
        const x=wet.reduce((s,v)=>s+v[0],0)/wet.length,z=wet.reduce((s,v)=>s+v[2],0)/wet.length;
        if(inside(x,z,polygon))append(lake,clip(wet,v=>level-v[1]));
        // Allow the documented domain warp, but exclude blue ocean/mountains
        // outside the authored river corridor. The blue mask supplies its edges.
        if(riverDistance(x,z,line)<55)append(river,clip(wet,v=>v[1]-level),true);
    }
    return {lake,river,level};
}
