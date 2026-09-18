import test from 'node:test';
import assert from 'node:assert/strict';
import { Swimming,SWIM_DRAFT } from '../src/character/swimming.js';
import { Flight,FLIGHT_COOLDOWN } from '../src/character/flight.js';
import { PropCollisions } from '../src/world/propCollisions.js';
import { WaterSurface,waterfallEmitters } from '../src/world/waterSurface.js';
const forward={x:0,z:1},right={x:1,z:0};
function setup(){
    const terrain={heightAt:()=>-5,water:{sample:()=>({level:0,depth:5})},obstacles:new PropCollisions()};
    const ch={terrain,position:{x:0,y:0,z:0},velocity:{x:0,y:0,z:0}};
    const swim=new Swimming(),input={moveX:0,moveZ:0,sprint:false};
    const tick=seconds=>{for(let t=0;t<seconds-1e-8;t+=1/60)swim.update(1/60,ch,input,forward,right);};
    return{ch,swim,input,tick};
}
test('deep water supports the swimmer, freeze preserves position, shallow water returns to walking',()=>{
    const {ch,swim,input,tick}=setup();tick(1);
    assert.equal(swim.active,true);assert.ok(Math.abs(ch.position.y+SWIM_DRAFT)<.04);
    const y=ch.position.y;swim.update(0,ch,input,forward,right);assert.equal(ch.position.y,y);
    ch.terrain.water.sample=()=>({level:0,depth:.5});tick(.1);assert.equal(swim.active,false);
});
test('swimming steers, sprint is faster, and trunks block movement',()=>{
    const {ch,input,tick}=setup();input.moveZ=1;tick(1);assert.ok(ch.velocity.z>2.3&&ch.velocity.z<2.5);
    input.sprint=true;tick(1);assert.ok(ch.velocity.z>3.7);
    ch.terrain.obstacles.add({x:0,z:ch.position.z+2,radius:1,minY:-5,maxY:3});
    const start=ch.position.z;tick(1);assert.ok(ch.position.z<start+.69);
});
test('islands and steep banks are not swimmable; gradual shallows permit an exit',()=>{
    const {ch,swim,input,tick}=setup();tick(1);
    ch.terrain.heightAt=(_x,z)=>z>1?3:-5;
    ch.terrain.water.sample=(_x,z)=>z>1?null:{level:0,depth:5};
    input.moveZ=1;tick(2);assert.ok(ch.position.z<=1);
    ch.terrain.heightAt=(_x,z)=>Math.min(.2,-1+(z-1)*.4);
    ch.terrain.water.sample=(_x,z)=>{const bed=ch.terrain.heightAt(0,z);return bed<0?{level:0,depth:-bed}:null;};
    tick(2);assert.equal(swim.active,false);
});
test('flight lands on water instead of lake bed and can launch again after cooldown',()=>{
    const {ch,swim,input,tick}=setup();const flight=new Flight();
    ch.position.y=3;flight.active=true;flight.remaining=0;flight.elapsed=1;
    for(let t=0;t<3&&flight.active;t+=1/60)flight.update(1/60,ch,input,forward,right);
    assert.equal(flight.active,false);assert.equal(ch.position.y,0);assert.equal(flight.cooldown,FLIGHT_COOLDOWN);
    tick(1);assert.equal(swim.active,true);
    flight.cooldown=0;input.flyPressed=true;
    flight.update(1/60,ch,input,forward,right);assert.equal(flight.active,true);assert.ok(ch.position.y>=0);
});
test('sparse water lookup rejects holes and interpolates bed depth; spray clusters only steep triangles',()=>{
    const data={positions:[0,0,0,4,0,0,0,0,4],indices:[0,1,2],colors:[2,1,0,.8,4,1,0,.8,2,1,0,.8]};
    const surface=new WaterSurface(data,0);
    assert.equal(surface.sample(3,3),null);assert.equal(surface.sample(100,100),null);
    assert.equal(surface.sample(1,1).depth,2.5);
    assert.equal(waterfallEmitters(data).length,1);
    data.indices.push(0,1,2);assert.equal(waterfallEmitters(data).length,1);
    data.colors[3]=0;assert.equal(waterfallEmitters(data).length,0);
});
