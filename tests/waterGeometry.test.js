import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWaterGeometry,blueWater } from '../src/world/waterGeometry.ts';
const reference={lake:[[-10,-10],[10,-10],[10,10],[-10,10]],river:[[0,0],[0,-10]]};
const triangle=(heights,colors)=>({positions:[0,heights[0],0,4,heights[1],0,0,heights[2],4],indices:[0,1,2],colors:colors.flat()});
const blue=[.22,.418,.617,1],sand=[.82,.68,.42,1];
test('water mask rejects snow and sand',()=>{
    assert.equal(blueWater(...blue),1);assert.equal(blueWater(...sand),0);assert.equal(blueWater(.896,.922,.947),0);
});
test('lake clips banks at the waterline and retains positive bed depth',()=>{
    const {lake}=buildWaterGeometry(triangle([-2,2,-2],[blue,blue,blue]),reference);
    assert.equal(lake.indices.length,6);
    for(let i=0;i<lake.positions.length;i+=3) {assert.equal(lake.positions[i+1],.025);assert.ok(lake.positions[i]<=2);}
    assert.ok(lake.colors.every(Number.isFinite));
    assert.ok(lake.colors.filter((_,i)=>i%4===0).every(x=>x>=0));
});
test('blue boundary clips mixed triangles and non-water remains dry',()=>{
    const dry=buildWaterGeometry(triangle([-2,-2,-2],[sand,sand,sand]),reference);
    assert.equal(dry.lake.indices.length,0);assert.equal(dry.river.indices.length,0);
    const {lake}=buildWaterGeometry(triangle([-2,-2,-2],[blue,sand,sand]),reference);
    assert.equal(lake.indices.length,3);assert.ok(Math.max(...lake.positions.filter((_,i)=>i%3===0))<=2);
});
test('river follows slopes above the lake and excludes distant blue regions',()=>{
    const data=triangle([8,8,2],[blue,blue,blue]);
    const {lake,river}=buildWaterGeometry(data,reference);
    assert.equal(lake.indices.length,0);assert.equal(river.indices.length,3);
    assert.ok(river.colors[3]>.5);assert.ok(river.colors[2]>0);
    const excluded=buildWaterGeometry(data,{lake:reference.lake,river:[[200,200],[200,210]]});
    assert.equal(excluded.river.indices.length,0);
});
