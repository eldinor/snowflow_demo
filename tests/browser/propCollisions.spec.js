import { test, expect } from '@playwright/test';

test('authored rocks block the controller and trunks retract the camera even when culled',async({page},info)=>{
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto('/');
    await page.waitForFunction(()=>globalThis.EXALTED,null,{timeout:120000});
    const result=await page.evaluate(()=>{
        const {terrain,character,rig,input,desertProps:p,S}=EXALTED;
        S.freezeTime=true;
        const colliders=terrain.obstacles.colliders;
        const rock=colliders.filter(c=>c.kind==='rock' && c.radius<2 && c.maxY-terrain.heightAt(c.x,c.z)>.7)
            .sort((a,b)=>Math.hypot(a.x+65,a.z-616)-Math.hypot(b.x+65,b.z-616))[0];
        character.teleport(rock.x-rock.radius-2,rock.z,Math.PI/2);
        rig.yaw=Math.PI/2; input.moveZ=1;
        for(let i=0;i<180;i++)character.update(1/30,rig);
        input.moveZ=0;
        const clearance=Math.hypot(character.position.x-rock.x,character.position.z-rock.z)-rock.radius;
        const speed=character.speed;
        // Render culling must not remove physics: switch the visible selection far away.
        p.update(rig.camera.position,{x:218,z:-251},true);
        const pos={x:rock.x-rock.radius-10,y:terrain.heightAt(rock.x,rock.z),z:rock.z};
        terrain.obstacles.move(pos,{x:100,z:0},.5);
        const culledClearance=rock.x-pos.x-rock.radius;
        const tree=colliders.find(c=>c.kind==='trunk' && c.maxY-terrain.heightAt(c.x,c.z)>3);
        character.teleport(tree.x-tree.radius-.8,tree.z,-Math.PI/2);
        EXALTED.figure.resetPose();
        rig.teleport(character.position,-Math.PI/2);
        const cameraFraction=rig.obstacleFraction;
        const eye=rig.camera.position;
        const cameraClearance=Math.hypot(eye.x-tree.x,eye.z-tree.z)-tree.radius;
        return {count:colliders.length,rocks:colliders.filter(c=>c.kind==='rock').length,
            trunks:colliders.filter(c=>c.kind==='trunk').length,rock,tree,clearance,speed,culledClearance,cameraFraction,cameraClearance,
            passable:!colliders.some(c=>/didelta|leipoldtia|iceplant|searsia|sand_rocks_small|namaqualand_stones/.test(c.name))};
    });
    expect(result.count).toBeGreaterThan(20);
    expect(result.trunks).toBeGreaterThan(0);
    expect(result.passable).toBe(true);
    expect(result.clearance).toBeGreaterThanOrEqual(.319);
    expect(result.clearance).toBeLessThan(.35);
    expect(result.speed).toBeLessThan(.01);
    expect(result.culledClearance).toBeGreaterThanOrEqual(.319);
    expect(result.cameraFraction).toBeLessThan(.9);
    expect(result.cameraClearance).toBeGreaterThanOrEqual(.249);
    await info.attach('collision-checks',{body:JSON.stringify(result,null,2),contentType:'application/json'});
    await page.waitForTimeout(1300);
    await page.screenshot({path:info.outputPath('camera-at-trunk.png')});
    expect(errors).toEqual([]);
});
