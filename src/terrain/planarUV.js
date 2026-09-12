/** Recover the supplied planar UV projection without guessing scale or handedness. */
export function fitPlanarUV(positions, uvs) {
    const x0=positions[0], z0=positions[2];
    let b=-1,c=-1,span=0;
    for(let i=3;i<positions.length;i+=3) {
        const distance=Math.hypot(positions[i]-x0,positions[i+2]-z0);
        if(distance>span) {b=i;span=distance;}
    }
    if(b<0) throw new Error('Ground UV projection has no distinct positions');
    const bx=positions[b]-x0,bz=positions[b+2]-z0;
    let det=0;
    for(let i=3;i<positions.length;i+=3) {
        const candidate=bx*(positions[i+2]-z0)-bz*(positions[i]-x0);
        if(Math.abs(candidate)>Math.abs(det)) {c=i;det=candidate;}
    }
    if(c<0) throw new Error('Ground UV projection has no noncollinear positions');
    const cx=positions[c]-x0,cz=positions[c+2]-z0;
    const axes=[0,1].map(k=>{
        const bu=uvs[b/3*2+k]-uvs[k],cu=uvs[c/3*2+k]-uvs[k];
        const x=(bu*cz-cu*bz)/det,z=(bx*cu-cx*bu)/det;
        return [x,z,uvs[k]-x*x0-z*z0];
    });
    let maxError=0;
    for(let i=0;i<positions.length;i+=3) for(let k=0;k<2;k++) {
        const a=axes[k];
        maxError=Math.max(maxError,Math.abs(a[0]*positions[i]+a[1]*positions[i+2]+a[2]-uvs[i/3*2+k]));
    }
    // UVs are float32 across a kilometre-scale mesh. Reject non-planar mappings.
    if(maxError>.01) throw new Error(`Ground UVs are not planar (error ${maxError})`);
    return {u:axes[0],v:axes[1],maxError};
}
