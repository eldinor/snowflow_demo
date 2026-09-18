import { retained } from './chunks.js';

/** Keep complete disconnected leaf/grass cards, preserving their original UVs. */
export function reduceFoliage(indices,vertexCount,density=.45){
    const parent=Int32Array.from({length:vertexCount},(_,i)=>i);
    function root(i){while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;}
    for(let i=0;i<indices.length;i+=3){const a=root(indices[i]);parent[root(indices[i+1])]=a;parent[root(indices[i+2])]=a;}
    const groups=new Map();
    for(let i=0;i<indices.length;i+=3){const key=root(indices[i]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(indices[i],indices[i+1],indices[i+2]);}
    // Connected foliage cannot be thinned safely this way.
    if(groups.size<4)return new Uint32Array(indices);
    const result=[];let group=0;
    for(const triangles of groups.values())if(retained(group++,density))result.push(...triangles);
    if(!result.length)result.push(...groups.values().next().value);
    return new Uint32Array(result);
}
