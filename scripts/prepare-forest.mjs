/**
 * Extract prototype nodes and stride-11 placement records from the authored forest GLB. Keep binary geometry/textures unchanged and record the source hash for reproducibility. Run from the repository root; generated assets go to public/assets/forest-demo.
 * @module scripts/prepare-forest
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
const source='public/assets/exalted/forest_previz.glb';
const buffer=fs.readFileSync(source),jsonLength=buffer.readUInt32LE(12);
const gltf=JSON.parse(buffer.toString('utf8',20,20+jsonLength));
const binary=buffer.subarray(28+jsonLength);
const models=gltf.meshes.map((m,index)=>({index,name:m.name})).filter(m=>m.name!=='Ground');
const records=[];
for(const node of gltf.nodes) {
    const type=models.findIndex(m=>m.index===node.mesh);if(type<0)continue;
    if(node.matrix)throw Error('Matrix placements need decomposition');
    records.push(type,...(node.translation||[0,0,0]),...(node.rotation||[0,0,0,1]),...(node.scale||[1,1,1]));
}
// Mesh data and textures stay byte-identical; remove the imported node forest.
gltf.meshes=models.map(m=>gltf.meshes[m.index]);
gltf.nodes=models.map((m,i)=>({name:`prototype-${i}`,mesh:i}));
gltf.scenes=[{nodes:models.map((_,i)=>i)}];gltf.scene=0;
delete gltf.animations;
const encoded=Buffer.from(JSON.stringify(gltf));const length=(encoded.length+3)&~3;
const result=Buffer.alloc(28+length+binary.length);
result.writeUInt32LE(0x46546c67,0);result.writeUInt32LE(2,4);result.writeUInt32LE(result.length,8);
result.writeUInt32LE(length,12);result.writeUInt32LE(0x4e4f534a,16);result.fill(32,20,20+length);encoded.copy(result,20);
result.writeUInt32LE(binary.length,20+length);result.writeUInt32LE(0x004e4942,24+length);binary.copy(result,28+length);
const directory='public/assets/forest-demo';fs.mkdirSync(directory,{recursive:true});
fs.writeFileSync(`${directory}/prototypes.glb`,result);
fs.writeFileSync(`${directory}/placements.bin`,Buffer.from(new Float32Array(records).buffer));
const manifest={source:'forest_previz.glb',sha256:crypto.createHash('sha256').update(buffer).digest('hex'),stride:11,count:records.length/11,
    models:models.map((m,i)=>({id:i,name:m.name,kind:i===0?'bush':i===1?'grass':'tree',count:records.filter((_,k)=>k%11===0&&records[k]===i).length}))};
fs.writeFileSync(`${directory}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({instances:manifest.count,prototypeBytes:result.length,placementBytes:records.length*4,models:manifest.models}));
