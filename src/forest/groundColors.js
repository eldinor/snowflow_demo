/**
 * Blend colour seams only; preserve geometry and the original biome data.
 * @module forest/groundColors
 */

/** Blend colour seams only; preserve geometry and the original biome data. */
export function smoothGroundColors(positions,colors){
    const groups=new Map(),result=new Float32Array(colors);
    for(let i=0;i<positions.length/3;i++){
        const key=`${positions[i*3]},${positions[i*3+1]},${positions[i*3+2]}`;
        if(!groups.has(key))groups.set(key,[]);
        groups.get(key).push(i);
    }
    for(const indices of groups.values()){
        if(indices.length<2)continue;
        for(let channel=0;channel<3;channel++){
            let sum=0;for(const i of indices)sum+=colors[i*4+channel];
            for(const i of indices)result[i*4+channel]=sum/indices.length;
        }
    }
    return result;
}
