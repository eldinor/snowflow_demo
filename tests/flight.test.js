import test from 'node:test';
import assert from 'node:assert/strict';
import { Flight, FLIGHT_HEIGHT, FLIGHT_DURATION, FLIGHT_COOLDOWN } from '../src/character/flight.js';
import { PropCollisions } from '../src/world/propCollisions.js';

function setup() {
    const flight=new Flight();
    const ch={position:{x:0,y:0,z:0},velocity:{x:0,y:0,z:0},terrain:{heightAt:()=>0,obstacles:new PropCollisions()}};
    const input={flyPressed:false,flyUp:false,flyDown:false,moveX:0,moveZ:0};
    const tick=(seconds)=>{for(let t=0;t<seconds-1e-8;t+=1/60){flight.update(1/60,ch,input,{x:0,z:1},{x:1,z:0});input.flyPressed=false;}};
    return {flight,ch,input,tick};
}
test('Space starts a lift, release hovers, expiry lands and cooldown blocks recasts',()=>{
    const {flight:f,ch,input:i,tick}=setup();
    i.flyPressed=true; tick(1);
    assert.ok(f.active && ch.position.y>1);
    tick(1); const hover=ch.position.y; tick(1);
    assert.ok(Math.abs(ch.position.y-hover)<.02);
    tick(FLIGHT_DURATION - 3);
    assert.equal(f.active,true);
    tick(2);
    assert.equal(f.active,false); assert.equal(ch.position.y,0); assert.ok(f.cooldown>0);
    i.flyPressed=true;tick(.1);assert.equal(f.active,false);
    tick(FLIGHT_COOLDOWN); i.flyPressed=true;tick(.1);assert.equal(f.active,true);
});
test('held rise respects height ceiling; freeze preserves timers; descent can land early',()=>{
    const {flight:f,ch,input:i,tick}=setup();
    i.flyPressed=i.flyUp=true;tick(4);
    assert.ok(ch.position.y>7 && ch.position.y<FLIGHT_HEIGHT+.15);
    const remaining=f.remaining;
    f.update(0,ch,i,{x:0,z:1},{x:1,z:0});assert.equal(f.remaining,remaining);
    i.flyUp=false;i.flyDown=true;tick(5);
    assert.equal(f.active,false); assert.ok(f.cooldown>0);
});
test('airborne motion blocks solid props and lands on tops instead of passing through',()=>{
    const {flight:f,ch,input:i,tick}=setup();
    ch.terrain.obstacles.add({x:0,z:3,radius:1,minY:0,maxY:8});
    i.flyPressed=true;tick(1);i.moveZ=1;tick(1);
    assert.ok(ch.position.z<1.681);
    ch.position={x:0,y:10,z:3};ch.velocity={x:0,y:0,z:0};i.moveZ=0;i.flyDown=true;tick(2);
    assert.equal(ch.position.y,8);assert.equal(f.active,false);
});
test('vertical sweep blocks undersides; steep terrain faces block horizontal flight',()=>{
    const {ch,input:i,tick}=setup();
    ch.terrain.obstacles.add({x:0,z:0,radius:1,minY:4,maxY:6});
    i.flyPressed=i.flyUp=true;tick(2);
    assert.ok(ch.position.y<=2.2+.00001);
    ch.terrain.obstacles=new PropCollisions();
    ch.terrain.heightAt=(_x,z)=>z>1?20:0;
    i.flyUp=false;i.moveZ=1;tick(1);
    assert.ok(ch.position.z<=1);assert.ok(ch.position.y<4);
});
