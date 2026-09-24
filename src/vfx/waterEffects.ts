/**
 * Swimming splashes and lake ripples; persistent waterfalls have their own GPU renderer.
 * @module vfx/waterEffects
 */

import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Terrain } from "../terrain/terrain.ts";
import type { CharacterController } from "../character/controller.ts";
import type { WorldWater } from "../world/worldWater.ts";
import type { SprayField } from "./particles.ts";

/** Feed swimming contacts into the shared spray pool and persistent lake ripples. */
export class WaterEffects {
    readonly water: WorldWater;
    readonly terrain: Terrain;
    readonly character: CharacterController;
    readonly spray: SprayField;
    private stroke = 0;
    private wasFlying = false;
    private splashDelay = 0;

    constructor(
        water: WorldWater, terrain: Terrain,
        character: CharacterController, spray: SprayField,
    ) {
        this.water = water;
        this.terrain = terrain;
        this.character = character;
        this.spray = spray;
    }
    /**
     * Emit a bounded radial burst into the shared spray pool and request a lake ripple at world coordinates.
     */
    splash(x: number, y: number, z: number, strength = 1): void {
        for(let i=0;i<Math.round(24*strength);i++) {
            const angle=i*2.39996,dx=Math.cos(angle),dz=Math.sin(angle),speed=1.3+(i%5)*.35;
            this.spray.emit(x+dx*.2,y+.08,z+dz*.2,dx*speed,1.4+strength*.6+(i%3)*.3,dz*speed,.025+(i%3)*.008,.8,4,1);
        }
        this.water.ripple(x,z,strength);
    }
    /**
     * Add swimming strokes and landing splashes from controller transitions.
     * @param dt - Simulation seconds; nonpositive values freeze emission.
     * @param camera - World camera position used to limit nearby spray work.
     */
    update(dt: number, camera: Vector3): void {
        if(dt<=0)return;
        this.splashDelay=Math.max(0,this.splashDelay-dt);
        const ch=this.character,p=ch.position,w=this.water.sample(p.x,p.z);
        if(w&&this.splashDelay===0&&(ch.swimming.justEntered||(this.wasFlying&&!ch.flight.active))) {
            this.splash(p.x,w.level,p.z,this.wasFlying?1.8:1);this.splashDelay=.7;
        }
        this.wasFlying=ch.flight.active;
        this.stroke+=dt;
        if(ch.swimming.active&&ch.speed>.2&&w&&this.stroke>.45) {
            this.stroke=0;this.water.ripple(p.x,p.z,.35);
            for(const side of [-1,1]) {
                const x=p.x+Math.cos(ch.facing)*side*.45,z=p.z-Math.sin(ch.facing)*side*.45;
                this.spray.emit(x,w.level+.06,z,-ch.velocity.x*.15,.6,-ch.velocity.z*.15,.022,.5,4,1.5);
            }
        }
    }
}
