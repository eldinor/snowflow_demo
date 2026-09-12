import test from 'node:test';
import assert from 'node:assert/strict';
import { PropCollisions, solidPropKind } from '../src/world/propCollisions.js';
const world = () => { const w=new PropCollisions(); w.add({x:0,z:0,radius:1,minY:0,maxY:3}); return w; };
test('continuous sweep blocks a fast crossing and removes inward velocity',()=>{
    const p={x:-20,y:0,z:0},v={x:100,y:0,z:0};
    world().move(p,v,.4);
    assert.ok(p.x < -1.32 && p.x > -1.33);
    assert.ok(Math.abs(v.x)<1e-8);
});
test('glancing contact slides along the obstacle without entering it',()=>{
    const p={x:-3,y:0,z:.8},v={x:10,y:0,z:0};
    world().move(p,v,.5);
    assert.ok(Math.hypot(p.x,p.z)>=1.32);
    assert.ok(p.z>.8);
    assert.ok(v.z>0);
});
test('overlapping start recovers and vertical separation stays passable',()=>{
    const p={x:0,y:0,z:0}; world().move(p,{x:0,z:0},.1);
    assert.ok(Math.hypot(p.x,p.z)>1.32);
    const high={x:-3,y:4,z:0};world().move(high,{x:10,z:0},.6);
    assert.equal(high.x,3);
});
test('exact contact can move away without sticking',()=>{
    const p={x:-1.32,y:0,z:0};world().move(p,{x:-2,z:0},.5);
    assert.ok(p.x < -2.31);
});
test('camera sweep handles sides, vertical entry and a clear overhead arm',()=>{
    const w=world();
    assert.ok(w.cameraFraction({x:-4,y:1,z:0},{x:4,y:1,z:0})<.35);
    assert.equal(w.cameraFraction({x:-4,y:5,z:0},{x:4,y:5,z:0}),1);
    const vertical=w.cameraFraction({x:0,y:5,z:0},{x:0,y:0,z:0});
    assert.ok(vertical>.34 && vertical<.36);
});
test('grid sweep crosses cells; vegetation and small stone materials are excluded',()=>{
    const w=new PropCollisions();w.add({x:80,z:-20,radius:2,minY:0,maxY:4});
    const p={x:0,y:0,z:-20};w.move(p,{x:200,z:0},1);
    assert.ok(p.x<77.68 && p.x>77.67);
    for (const name of ['didelta_spinosa','leipoldtia_schultzei','crystalline_iceplant','searsia_burchellii','sand_rocks_small_01','namaqualand_stones_01']) assert.equal(solidPropKind(name),null);
    assert.equal(solidPropKind('quiver_tree_02'),'trunk');
    assert.equal(solidPropKind('boulder_03'),'rock');
});
