export const CHUNK_SIZE=32;
export const DEFAULTS={trees:true,bushes:true,grass:true,treeDistance:280,bushDistance:65,grassDistance:35,
    nearDistance:28,farDistance:100,density:1,shadows:true,shadowDistance:55,windStrength:1,windSpeed:1,windDirection:42,
    collisions:true,freeze:false,lod:true,impostors:true,grounded:true};
export function chunkKey(x,z){return `${Math.floor(x/CHUNK_SIZE)},${Math.floor(z/CHUNK_SIZE)}`;}
export function retained(id,density){return ((Math.imul(id+1,2654435761)>>>0)/4294967296)<density;}
export function lodFor(kind,distance,options) {
    const limit=kind==='tree'?options.treeDistance:kind==='bush'?options.bushDistance:options.grassDistance;
    if(!options[{tree:'trees',bush:'bushes',grass:'grass'}[kind]]||distance>limit)return -1;
    if(!options.lod||distance<options.nearDistance)return 0;
    if(kind==='tree'&&distance>=options.farDistance&&options.impostors)return 2;
    return 1;
}
export function groupPlacements(records) {
    const chunks=new Map();
    for(let i=0;i<records.length;i+=11) {
        const x=-records[i+1],z=records[i+3],key=chunkKey(x,z);
        if(!chunks.has(key))chunks.set(key,{key,records:[],x:(Math.floor(x/32)+.5)*32,z:(Math.floor(z/32)+.5)*32});
        chunks.get(key).records.push({id:i/11,type:records[i],x,y:records[i+2],z,
            rotation:[records[i+4],-records[i+5],-records[i+6],records[i+7]],scale:Array.from(records.slice(i+8,i+11))});
    }
    return [...chunks.values()];
}
