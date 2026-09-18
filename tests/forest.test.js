import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { CHUNK_SIZE,DEFAULTS,chunkKey,groupPlacements,lodFor,retained } from '../src/forest/chunks.js';
import { reduceFoliage } from '../src/forest/foliageLod.js';
import { smoothGroundColors } from '../src/forest/groundColors.js';

test('ground colour seams blend coincident vertices without changing source colours or separate heights',()=>{
    const positions=[0,0,0,1,0,0,0,0,0,0,1,0];
    const colors=new Float32Array([0,1,0,1,0,1,0,1,1,1,0,1,1,0,0,.5]);
    const original=colors.slice(),result=smoothGroundColors(positions,colors);
    assert.deepEqual(Array.from(result),[.5,1,0,1,0,1,0,1,.5,1,0,1,1,0,0,.5]);
    assert.deepEqual(colors,original);
});
import { attachBatchGeometry } from '../src/forest/batchGeometry.js';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Matrix } from '@babylonjs/core/Maths/math.vector.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { snappedShadowTarget,SUN_OFFSET } from '../src/forest/shadowProjection.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';

test('shadow sampling stays on a fixed texel grid during horizontal movement and flight',()=>{
    const radius=79,resolution=1024,point=new Vector3(-670,20,160),step=2*radius/resolution;
    function projected(position){
        const target=snappedShadowTarget(position,radius);
        const view=Matrix.LookAtLH(target.add(SUN_OFFSET),target,Vector3.Up());
        return Vector3.TransformCoordinates(point,view).scale(1/step);
    }
    const initial=projected(new Vector3(-680,30,170));
    for(const position of [new Vector3(-679.99,30.01,170.01),new Vector3(-640,90,130),new Vector3(15,-10,-50)]){
        const p=projected(position);
        for(const axis of ['x','y']){
            const delta=p[axis]-initial[axis];
            // A world point moves by whole texels, never slides between samples.
            assert.ok(Math.abs(delta-Math.round(delta))<.002);
        }
    }
});

test('chunk matrix bindings remain independent when the last chunk has only one instance',()=>{
    const engine=new NullEngine(),scene=new Scene(engine);
    try{
        const prototype=new Mesh('prototype',scene),data=new VertexData();
        data.positions=[0,0,0,1,0,0,0,1,0];data.indices=[0,1,2];data.applyToMesh(prototype);
        const large=new Mesh('three-instance-chunk',scene),small=new Mesh('one-instance-chunk',scene);
        const matrices=count=>{const result=new Float32Array(count*16);for(let i=0;i<count;i++)Matrix.Translation(i,0,0).copyToArray(result,i*16);return result;};
        for(const [mesh,count] of [[large,3],[small,1]]){
            attachBatchGeometry(prototype,mesh);mesh.thinInstanceSetBuffer('matrix',matrices(count),16,false);
        }
        assert.notEqual(large.geometry,small.geometry);
        assert.equal(large.getVertexBuffer('position').getBuffer(),prototype.getVertexBuffer('position').getBuffer());
        for(const mesh of [large,small])for(let column=0;column<4;column++){
            const binding=mesh.getVertexBuffer(`world${column}`);
            assert.equal(binding.getWrapperBuffer(),mesh._thinInstanceDataStorage.matrixBuffer);
            assert.ok(binding.getData().byteLength>=mesh.thinInstanceCount*64);
        }
        assert.ok(!prototype.getVertexBuffer('world0'));
        large.thinInstanceCount=1;large.thinInstanceBufferUpdated('matrix');
        large.thinInstanceCount=3;large.thinInstanceBufferUpdated('matrix');
        const shared=large.getVertexBuffer('position').getBuffer(),references=shared.references;
        small.dispose();assert.equal(shared.references,references-1);
        assert.equal(large.getVertexBuffer('world0').getWrapperBuffer(),large._thinInstanceDataStorage.matrixBuffer);
        assert.equal(large._thinInstanceDataStorage.matrixData.byteLength,192);
        prototype.dispose();assert.equal(large.getVertexBuffer('position').getBuffer(),shared);
        assert.deepEqual(Array.from(large.getVerticesData('position')),[0,0,0,1,0,0,0,1,0]);
    }finally{scene.dispose();engine.dispose();}
});

test('foliage LOD retains complete cards and deterministic UV-compatible indices',()=>{
    const source=[];
    for(let i=0;i<100;i++){const v=i*4;source.push(v,v+1,v+2,v,v+2,v+3);}
    const reduced=reduceFoliage(source,400);
    assert.ok(reduced.length>200&&reduced.length<400);
    assert.deepEqual(reduced,reduceFoliage(source,400));
    for(let i=0;i<reduced.length;i+=6){const v=reduced[i];assert.deepEqual(Array.from(reduced.slice(i,i+6)),[v,v+1,v+2,v,v+2,v+3]);}
    assert.deepEqual(Array.from(reduceFoliage(source.slice(0,6),4)),source.slice(0,6));
});

test('32 m chunks handle origin and negative boundaries',()=>{
    assert.equal(CHUNK_SIZE,32);
    assert.equal(chunkKey(0,31.999),'0,0');
    assert.equal(chunkKey(-.001,-32),'-1,-1');
    assert.equal(chunkKey(-32.001,32),'-2,1');
});
test('GLB placements mirror X and rotation consistently without losing scale',()=>{
    const chunks=groupPlacements(new Float32Array([2,40,7,60,0,.6,0,.8,2,3,4]));
    assert.equal(chunks.length,1);assert.equal(chunks[0].key,'-2,1');
    const p=chunks[0].records[0];assert.deepEqual([p.x,p.y,p.z],[-40,7,60]);
    assert.ok(Math.abs(p.rotation[1]+.6)<1e-6);assert.deepEqual(p.scale,[2,3,4]);
});
test('LOD boundaries, class visibility and geometry-only comparison',()=>{
    assert.equal(lodFor('tree',27,DEFAULTS),0);
    assert.equal(lodFor('tree',28,DEFAULTS),1);
    assert.equal(lodFor('tree',100,DEFAULTS),2);
    assert.equal(lodFor('tree',281,DEFAULTS),-1);
    assert.equal(lodFor('bush',66,DEFAULTS),-1);
    assert.equal(lodFor('grass',36,DEFAULTS),-1);
    assert.equal(lodFor('tree',200,{...DEFAULTS,lod:false}),0);
    assert.equal(lodFor('tree',200,{...DEFAULTS,impostors:false}),1);
    for(const [kind,toggle] of [['tree','trees'],['bush','bushes'],['grass','grass']])assert.equal(lodFor(kind,0,{...DEFAULTS,[toggle]:false}),-1);
});
test('density selection is deterministic, nested and has complete endpoints',()=>{
    let kept=0;
    for(let i=0;i<10000;i++){
        assert.equal(retained(i,0),false);assert.equal(retained(i,1),true);
        if(retained(i,.25)){assert.ok(retained(i,.5));kept++;}
    }
    assert.ok(kept>2450&&kept<2550);
});
test('prepared forest preserves every source placement and contains only four prototype nodes',()=>{
    const read=path=>fs.readFileSync(new URL(path,import.meta.url));
    const source=read('../public/assets/exalted/forest_previz.glb');
    const original=JSON.parse(source.toString('utf8',20,20+source.readUInt32LE(12)));
    const manifest=JSON.parse(read('../public/assets/forest-demo/manifest.json'));
    assert.equal(manifest.sha256,crypto.createHash('sha256').update(source).digest('hex'));
    const file=read('../public/assets/forest-demo/prototypes.glb');
    assert.equal(file.readUInt32LE(0),0x46546c67);assert.equal(file.readUInt32LE(8),file.length);
    const gltf=JSON.parse(file.toString('utf8',20,20+file.readUInt32LE(12)));
    assert.equal(gltf.nodes.length,4);assert.equal(gltf.meshes.length,4);
    assert.ok(gltf.meshes.every(m=>m.name!=='Ground'));
    const raw=read('../public/assets/forest-demo/placements.bin');
    const records=new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4);
    const plants=groupPlacements(records).flatMap(c=>c.records).sort((a,b)=>a.id-b.id);
    assert.equal(plants.length,20984);assert.equal(plants.length,manifest.count);
    const nodes=original.nodes.filter(n=>n.mesh!==undefined&&original.meshes[n.mesh].name!=='Ground');
    assert.equal(nodes.length,plants.length);
    nodes.forEach((n,i)=>{
        const p=plants[i];assert.equal(p.x,-Math.fround(n.translation?.[0]||0));
        assert.equal(p.y,Math.fround(n.translation?.[1]||0));assert.equal(p.z,Math.fround(n.translation?.[2]||0));
        assert.equal(manifest.models[p.type].name,original.meshes[n.mesh].name);
    });
    for(const m of manifest.models)assert.equal(plants.filter(p=>p.type===m.id).length,m.count);
});
