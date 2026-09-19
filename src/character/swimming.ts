/**
 * Surface swimming uses depth hysteresis and swept collisions to avoid shoreline flicker and tunnelling.
 * @module character/swimming
 */

import type { MovementCharacter, MovementVector2, SwimmingInput } from './movementTypes.ts';

export const SWIM_DRAFT = .95;
/** Take control in sufficiently deep lake water and release to walking at shallow edges. */
export class Swimming {
    active = false;
    time = 0;
    justEntered = false;
    /**
     * Take over movement only where visible lake depth supports swimming. Entry/exit thresholds differ to prevent shoreline flicker.
     * @param {number} dt - Simulation seconds; nonpositive values preserve the current state.
     * @param ch - Controller mutated by horizontal collision and surface buoyancy.
     * @param input - Movement axes and sprint state.
     * @param forward - Horizontal camera-forward basis.
     * @param right - Horizontal camera-right basis.
     * @returns {boolean} Whether swimming consumed the frame, including a shallow-water exit.
     */
    update(dt: number, ch: MovementCharacter, input: SwimmingInput, forward: MovementVector2, right: MovementVector2): boolean {
        this.justEntered=false;
        if(dt<=0)return this.active;
        const waterSystem=ch.terrain.water;
        const water=waterSystem?.sample(ch.position.x,ch.position.z);
        const support=ch.terrain.obstacles?.supportHeight(ch.position)??-Infinity;
        const wet=water&&water.depth>(this.active ? .8 : 1.15)&&ch.position.y<water.level+.2&&support<water.level-.8;
        if(!wet){this.active=false;return false;}
        this.justEntered=!this.active;this.active=true;this.time+=dt;
        let rest=dt;
        while(rest>1e-8) {
            const h=Math.min(rest,1/60);rest-=h;
            const speed=input.sprint?3.8:2.4,k=1-Math.exp(-4*h);
            ch.velocity.x+=((forward.x*input.moveZ+right.x*input.moveX)*speed-ch.velocity.x)*k;
            ch.velocity.z+=((forward.z*input.moveZ+right.z*input.moveX)*speed-ch.velocity.z)*k;
            const oldX=ch.position.x,oldZ=ch.position.z;
            if(ch.terrain.obstacles)ch.terrain.obstacles.move(ch.position,ch.velocity,h);
            else{ch.position.x+=ch.velocity.x*h;ch.position.z+=ch.velocity.z*h;}
            ch.terrain.heightfield?.clampToPlayArea(ch.position);
            let bed=ch.terrain.heightAt(ch.position.x,ch.position.z);
            if(bed>ch.position.y+.45){ch.position.x=oldX;ch.position.z=oldZ;ch.velocity.x=ch.velocity.z=0;bed=ch.terrain.heightAt(oldX,oldZ);}
            const next=waterSystem?.sample(ch.position.x,ch.position.z);
            ch.groundY=bed;
            if(!next||next.depth<.8){this.active=false;ch.velocity.y=0;break;}
            const target=Math.max(bed,next.level-SWIM_DRAFT+Math.sin(this.time*2.4)*.025);
            const y=ch.position.y+(target-ch.position.y)*(1-Math.exp(-8*h));
            ch.position.y=ch.terrain.obstacles?.verticalLimit(ch.position,y)??y;
            ch.velocity.y=0;
        }
        return true;
    }
}
