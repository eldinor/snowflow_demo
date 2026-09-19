/**
 * Flight ribbon animation and timer UI consume movement state without owning flight logic.
 * @module vfx/flightWind
 */

import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { FLIGHT_DURATION, FLIGHT_COOLDOWN } from '../character/flight.ts';
import './flightWind.css';
import type { Scene } from '@babylonjs/core/scene';
import type { CharacterController } from '../character/controller.ts';
import type { SprayField } from './particles.ts';

const WIND_READY = new Color3(.72, .9, 1);
const WIND_WARNING = new Color3(1, .55, .08);
const WIND_END = new Color3(1, .035, .015);

/** Render flight-state feedback through ribbons, particles and the timer indicator. */
export class FlightWind {
    readonly character: CharacterController;
    readonly spray: SprayField;
    time = 0;
    readonly material: StandardMaterial;
    readonly ribbons: Mesh[];
    readonly hud: HTMLElement;
    readonly label: HTMLSpanElement;
    readonly bar: HTMLProgressElement;
    readonly tip: HTMLElement;

    constructor(scene: Scene, character: CharacterController, spray: SprayField) {
        this.character = character;
        this.spray = spray;
        this.material = new StandardMaterial('flight wind', scene);
        this.material.disableLighting = true;
        this.material.emissiveColor = new Color3(.72,.9,1);
        this.material.alpha = .4;
        this.material.backFaceCulling = false;
        this.material.disableDepthWrite = true;
        this.ribbons = Array.from({length:3}, (_,j) => {
            const mesh = new Mesh(`flight wind ${j}`, scene);
            const data = new VertexData();
            const positions: number[] = [];
            const indices: number[] = [];
            const colors: number[] = [];
            for (let i=0;i<=48;i++) {
                const u=i/48, angle=u*Math.PI*1.5+j*2.1;
                const radius=.55+j*.16;
                for (const edge of [-1,1]) {
                    positions.push(Math.cos(angle)*radius, .08+u*.65+edge*.035*Math.sin(u*Math.PI), Math.sin(angle)*radius);
                    colors.push(1,1,1,Math.sin(u*Math.PI));
                }
                if(i<48){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
            }
            data.positions=positions; data.indices=indices; data.colors=colors;
            data.normals=[]; VertexData.ComputeNormals(positions,indices,data.normals);
            data.applyToMesh(mesh);
            mesh.hasVertexAlpha=true; mesh.material=this.material;
            mesh.isPickable=false; mesh.renderingGroupId=1; mesh.setEnabled(false);
            return mesh;
        });
        this.hud=document.createElement('aside');
        this.hud.id='flight-hud';
        this.hud.setAttribute('aria-label','Fly spell');
        this.hud.innerHTML='<strong>SPACE · Fly</strong><span></span><progress max="1" value="1" aria-label="Flight time or cooldown"></progress><small>Hold Space to rise · Ctrl to descend</small>';
        this.label=this.hud.querySelector<HTMLSpanElement>('span')!;
        this.bar=this.hud.querySelector<HTMLProgressElement>('progress')!;
        this.tip=this.hud.querySelector<HTMLElement>('small')!;
        document.body.append(this.hud);
        scene.onDisposeObservable.addOnce(()=>this.dispose());
        if(import.meta.hot) import.meta.hot.dispose(()=>this.dispose());
    }
    /**
     * Animate wind ribbons and time-to-expiry colours from flight state; emit particles without modifying the flight controller.
     * @param dt - Simulation seconds.
     */
    update(dt: number): void {
        const ch=this.character, f=ch.flight;
        this.time+=dt;
        // Blue at takeoff, amber halfway through, red as the timer expires.
        const spent = f.active ? 1 - Math.max(0, Math.min(1, f.remaining / FLIGHT_DURATION)) : 0;
        const blend = spent < .5 ? spent * 2 : (spent - .5) * 2;
        Color3.LerpToRef(spent < .5 ? WIND_READY : WIND_WARNING,
            spent < .5 ? WIND_WARNING : WIND_END,
            blend * blend * (3 - 2 * blend), this.material.emissiveColor);
        this.material.alpha = .4 + .25 * spent;
        for (const [j,mesh] of this.ribbons.entries()) {
            mesh.setEnabled(f.active);
            mesh.position.copyFrom(ch.position);
            mesh.rotation.y=this.time*(2.1+j*.3);
        }
        if(f.justStarted && dt>0 && ch.position.y-ch.terrain.heightAt(ch.position.x,ch.position.z)<1) {
            for(let i=0;i<28;i++) {
                const a=i/28*Math.PI*2, x=Math.cos(a), z=Math.sin(a);
                this.spray.emit(ch.position.x+x*.35,ch.position.y+.08,ch.position.z+z*.35,x*2,1.2+(i%4)*.2,z*2,.025,.8,0,1.5);
            }
        }
        const label=f.active ? (f.remaining>0 ? `Flying · ${f.remaining.toFixed(1)}s` : 'Landing…') : f.cooldown>0 ? `Cooldown · ${Math.ceil(f.cooldown)}s` : 'Ready';
        if(this.label.textContent!==label)this.label.textContent=label;
        const tip=ch.swimming.active ? 'WASD swim · Shift faster · Space fly' : 'Hold Space to rise · Ctrl to descend';
        if(this.tip.textContent!==tip)this.tip.textContent=tip;
        this.bar.value=f.active ? f.remaining/FLIGHT_DURATION : 1-f.cooldown/FLIGHT_COOLDOWN;
    }
    /** Release flight feedback resources when the owning system is torn down. */
    dispose(): void {
        this.hud.remove();
        this.ribbons.forEach(m=>m.dispose()); this.material.dispose();
    }
}
