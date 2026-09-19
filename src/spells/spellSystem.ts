/**
 * The spell system Р В Р’В Р В РІР‚В Р В Р’В Р Р†Р вЂљРЎв„ўР В Р вЂ Р В РІР‚С™Р РЋРЎС™ dispatch, shared context, and the casting pose.
 *
 * Owns the nine spells, the water body they draw into, the ice they leave, and
 * the light pool every material reads. One `update()` per frame, in this order,
 * and the order is load-bearing:
 *
 *   1. clear the light pool
 *   2. dispatch input
 *   3. update every spell Р В Р’В Р В РІР‚В Р В Р’В Р Р†Р вЂљРЎв„ўР В Р вЂ Р В РІР‚С™Р РЋРЎС™ they declare lights and write brushes here
 *   4. upload the water and the crystals
 *
 * The lights have to be cleared before the spells run and uploaded after, or a
 * spell that ended last frame keeps lighting the snow. The brushes have to be
 * written before `terrain.update()` runs the simulation pass, which is why this
 * is called from `main` alongside the character contact rather than after the
 * terrain.
 *
 * Allocation per frame: none.
 * @module spells/spellSystem
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { input } from "../core/input.ts";
import { S } from "../core/settings.ts";
import { expDamp } from "../core/camera.ts";
import { SpellLights } from "./spellLights.ts";
import { WaterBody } from "./waterBody.ts";
import { CrystalField } from "./crystals.ts";
import { Sweep } from "./sweep.ts";
import { Ribbon } from "./ribbon.ts";
import { Bloom } from "./bloom.ts";
import { Crystallize } from "./crystallize.ts";
import { Vortex } from "./vortex.ts";
import { Rift } from "./rift.ts";
import { Aegis } from "./aegis.ts";
import { Avalanche } from "./avalanche.ts";
import { Thaw } from "./thaw.ts";
import { aimPoint } from "./bending.ts";
import type { Scene } from '@babylonjs/core/scene';
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import type { SpellNumber } from '../core/input.ts';
import type { Sky } from '../render/sky.ts';
import type { ShadowSystem } from '../render/shadows.ts';
import type { Terrain } from '../terrain/terrain.ts';
import type { DeformationField } from '../terrain/deformation.ts';
import type { CharacterController } from '../character/controller.ts';
import type { Figure } from '../character/figure.ts';
import type { CameraRig } from '../core/camera.ts';
import type { DepthPass } from '../render/depthPass.ts';
import type { SprayField } from '../vfx/particles.ts';

/** Shared, stable services individual spell lifecycles may read or mutate. */
export interface SpellContext {
    controller: CharacterController;
    figure: Figure | null;
    rig: CameraRig;
    terrain: Terrain;
    deform: DeformationField;
    spray: SprayField;
    water: WaterBody;
    crystals: CrystalField;
    lights: SpellLights;
    time: number;
    sprayScale: number;
    handPosition(which: number, out: Float32Array, offset: number): void;
}

interface SpellLifecycle {
    active: boolean;
    update(dt: number): void;
    cancel(): void;
}

const _aim = new Float32Array(3);
const _hand = new Float32Array(3);

/** Coordinate input, spell lifecycles and shared pools in the order required by deformation and lighting. */
export class SpellSystem {
    readonly lights: SpellLights;
    readonly water: WaterBody;
    readonly crystals: CrystalField;
    readonly ctx: SpellContext;
    readonly sweep: Sweep;
    readonly ribbon: Ribbon;
    readonly bloom: Bloom;
    readonly crystallize: Crystallize;
    readonly vortex: Vortex;
    readonly rift: Rift;
    readonly aegis: Aegis;
    readonly avalanche: Avalanche;
    readonly thaw: Thaw;
    readonly spells: SpellLifecycle[];
    private readonly _consumers: ShaderMaterial[] = [];
    readonly aim = new Vector3(0, 0, 1);
    castBlend = 0;
    private _lastCast = -99;
    private _time = 0;
    debugRibbon = false;

    constructor(
        scene: Scene, sky: Sky, shadows: ShadowSystem, terrain: Terrain,
        controller: CharacterController, figure: Figure | null,
        rig: CameraRig, spray: SprayField,
    ) {
        this.lights = new SpellLights();
        this.water = new WaterBody(scene, sky, shadows, this.lights);
        this.crystals = new CrystalField(scene, sky, shadows, this.lights);

        /** @type {SpellContext} */
        this.ctx = {
            controller,
            figure: figure || null,
            rig,
            terrain,
            deform: terrain.deform,
            spray,
            water: this.water,
            crystals: this.crystals,
            lights: this.lights,
            time: 0,
            sprayScale: 1,
            handPosition: (which, out, off) => this._handPosition(which, out, off),
        };

        this.sweep = new Sweep(this.ctx);
        this.ribbon = new Ribbon(this.ctx);
        this.bloom = new Bloom(this.ctx);
        this.crystallize = new Crystallize(this.ctx);
        this.vortex = new Vortex(this.ctx);
        this.rift = new Rift(this.ctx);
        this.aegis = new Aegis(this.ctx);
        this.avalanche = new Avalanche(this.ctx);
        this.thaw = new Thaw(this.ctx);

        this.spells = [
            this.sweep, this.ribbon, this.bloom,
            this.crystallize, this.vortex, this.rift, this.aegis,
            this.avalanche, this.thaw,
        ];

        /**
         * Materials outside the spell system that shade with the spell lights.
         *
         * They are pushed rather than pulled because the pool is only complete
         * once every spell has declared, and that is later in the frame than any
         * of these systems runs. Registering them here keeps "who is lit by a
         * spell" a single list in one file instead of a `lights.apply()` call
         * scattered across five unrelated `_pushUniforms`.
         *
         * @type {import("@babylonjs/core/Materials/shaderMaterial").ShaderMaterial[]}
         */
    }

    /**
     * Declare a material that reads `snowSpellLights`.
     * @param {...import("@babylonjs/core/Materials/shaderMaterial").ShaderMaterial} mats
     */
    addConsumers(...mats: ShaderMaterial[]): void {
        for (let i = 0; i < mats.length; i++) {
            if (mats[i]) this._consumers.push(mats[i]);
        }
    }

    /**
     * Where a hand is, in world space.
     *
     * Falls back to a point in front of the chest when the figure is hidden, so
     * a spell cast with the character switched off still comes from somewhere
     * sensible rather than from the origin.
     */
    private _handPosition(which: number, out: Float32Array, off: number): void {
        const fig = this.ctx.figure;
        if (fig && S.showCharacter !== false) {
            fig.handPosition(which, out, off);
            return;
        }
        const ch = this.ctx.controller;
        const fx = Math.sin(ch.facing);
        const fz = Math.cos(ch.facing);
        const side = which === 0 ? -0.28 : 0.28;
        out[off] = ch.position.x + fx * 0.35 + Math.cos(ch.facing) * side;
        out[off + 1] = ch.position.y + 1.25;
        out[off + 2] = ch.position.z + fz * 0.35 - Math.sin(ch.facing) * side;
    }

    /**
     * @param {number} dt
     * @param {Vector3} cameraPos
     */
    update(dt: number, cameraPos: Vector3): void {
        const ctx = this.ctx;
        this._time += dt;
        ctx.time = this._time;
        ctx.sprayScale = S.spellSpray;
        this.lights.scale = S.spellLight;

        // Aim comes off the rig rather than the character: the player points
        // with the camera, and the figure turns to follow.
        this.aim.copyFrom(this.ctx.rig.forward);

        this.lights.begin();

        if (S.showSpells !== false) this._dispatch();
        else this._cancelAll();

        for (let i = 0; i < this.spells.length; i++) this.spells[i].update(dt);

        // The casting stance eases in while anything is up and out again after.
        // Nothing about it is a switch.
        const casting =
            this.ribbon.active || this.aegis.held || this._time - this._lastCast < 0.55 ? 1 : 0;
        this.castBlend = expDamp(this.castBlend, casting, casting ? 7.0 : 3.2, dt);
        const ch = this.ctx.controller;
        ch.cast = this.castBlend;
        ch.castAimX = this.aim.x;
        ch.castAimY = this.aim.y;
        ch.castAimZ = this.aim.z;

        // Everything outside the spell system that answers a spell light, after
        // the last declaration and before anything renders.
        for (let i = 0; i < this._consumers.length; i++) {
            this.lights.apply(this._consumers[i]);
        }

        this.water.update(dt, cameraPos);
        this.crystals.update(dt, cameraPos);
    }

    /**
     * Translate current spell selection and input edges into spell-specific actions; shared pools are updated later in the frame.
     */
    private _dispatch(): void {
        // Ribbon is a hold, so it is polled rather than edge-triggered.
        // `debugRibbon` lets the console hold it without synthesising a key
        // event Р В Р’В Р В РІР‚В Р В Р’В Р Р†Р вЂљРЎв„ўР В Р вЂ Р В РІР‚С™Р РЋРЎС™ the poll would otherwise release it on the very next frame.
        this.holdRibbon(input.spellHeld2 || this.debugRibbon);
        const key = input.spellPressed;
        if (key && key !== 2) this.cast(key);
        this.aegis.setHeld(input.spellHeld7);
    }

    /**
     * Fire one spell, by key.
     *
     * Separated from the input poll so the console or a future rebind can cast
     * without synthesising a key event. `EXALTED.spells` is the console handle.
     *
     * @param {number} key 1..9
     */
    cast(key: SpellNumber): void {
        const ctx = this.ctx;
        const rig = ctx.rig;

        if (key === 2) {
            this.holdRibbon(true);
            return;
        }

        this._lastCast = this._time;

        if (key === 1) {
            // Flat aim: the crescent runs along the ground, so a camera pointed
            // at the sky must not launch it into the air.
            const fl = Math.hypot(this.aim.x, this.aim.z) || 1;
            this.sweep.trigger(this.aim.x / fl, this.aim.z / fl);
            rig.addTrauma(0.12);
            return;
        }

        if (key === 3 || key === 4) {
            // Both are placed where the player is looking. The ray starts at the
            // eye, so what the spell hits is exactly what is under the centre of
            // the screen Р В Р’В Р В РІР‚В Р В Р’В Р Р†Р вЂљРЎв„ўР В Р вЂ Р В РІР‚С™Р РЋРЎС™ which is the only targeting rule that needs no
            // explanation and no reticle.
            //
            // Capped at 22 m of ray, not the 40 the terrain could answer for.
            // Looking out across a dune field the first surface the ray meets is
            // often forty metres away on the next ridge, and a Bloom that goes
            // off over there is an effect the player has to squint at. Beyond the
            // cap the spell lands at the cap distance instead, which is always
            // in front of them and always at a size worth looking at.
            const eye = rig.camera.position;
            aimPoint(
                _aim, ctx.terrain,
                eye.x, eye.y, eye.z,
                this.aim.x, this.aim.y, this.aim.z,
                22, 13
            );
            if (key === 3) this.bloom.trigger(_aim[0], _aim[1], _aim[2]);
            else this.crystallize.trigger(_aim[0], _aim[1], _aim[2]);
            return;
        }

        if (key === 5) {
            this.vortex.trigger();
            rig.addTrauma(0.10);
            return;
        }

        if (key === 6) {
            const fl = Math.hypot(this.aim.x, this.aim.z) || 1;
            this.rift.trigger(this.aim.x / fl, this.aim.z / fl);
            return;
        }

        if (key === 7) {
            if (this.aegis.hasWall) {
                this.aegis.shatter();
                return;
            }
            const eye = rig.camera.position;
            aimPoint(
                _aim, ctx.terrain,
                eye.x, eye.y, eye.z,
                this.aim.x, this.aim.y, this.aim.z,
                14, 8
            );
            const fl = Math.hypot(this.aim.x, this.aim.z) || 1;
            this.aegis.trigger(_aim[0], _aim[2], this.aim.x / fl, this.aim.z / fl);
            return;
        }

        if (key === 8) {
            const fl = Math.hypot(this.aim.x, this.aim.z) || 1;
            this.avalanche.trigger(this.aim.x / fl, this.aim.z / fl);
            rig.addTrauma(0.08);
            return;
        }

        if (key === 9) {
            const eye = rig.camera.position;
            aimPoint(
                _aim, ctx.terrain,
                eye.x, eye.y, eye.z,
                this.aim.x, this.aim.y, this.aim.z,
                16, 9
            );
            const fl = Math.hypot(this.aim.x, this.aim.z) || 1;
            this.thaw.trigger(
                _aim[0], _aim[1], _aim[2],
                this.aim.x / fl, this.aim.z / fl
            );
        }
    }

    /** @param {boolean} held */
    holdRibbon(held: boolean): void {
        if (held) {
            if (!this.ribbon.held) {
                this.ribbon.trigger();
                this._lastCast = this._time;
            }
        } else if (this.ribbon.held) {
            this.ribbon.release();
        }
    }

    /**
     * Reset transient spell activity for a world/spawn reset; delegate cancellation to individual spell lifecycles.
     */
    reset(): void {
        this._cancelAll();
        this.castBlend = 0;
        this._lastCast = -Infinity;
        this.crystals.finishWarmUp();
    }

    private _cancelAll(): void {
        for (let i = 0; i < this.spells.length; i++) this.spells[i].cancel();
    }

    /** Live spell count, for the overlay. */
    get activeCount(): number {
        let n = 0;
        for (let i = 0; i < this.spells.length; i++) if (this.spells[i].active) n++;
        return n;
    }

    /**
     * Register the ice formations with the depth prepass.
     *
     * Only the crystals: the water body is translucent and refractive, so a
     * depth for it would tell every screen-space consumer that the snow behind it
     * is not there Р В Р’В Р В РІР‚В Р В Р’В Р Р†Р вЂљРЎв„ўР В Р вЂ Р В РІР‚С™Р РЋРЎС™ which is exactly wrong for a medium you can see through.
     *
     * @param {import("../render/depthPass.ts").DepthPass} depth
     */
    registerPrepass(depth: DepthPass): void {
        this.crystals.registerPrepass(depth);
    }

    get triangles(): number {
        return this.water.triangles + this.crystals.triangles;
    }

    /**
     * Compile every spell pipeline behind the loading screen.
     *
     * The first cast of any spell must not hitch, and this is the only thing
     * standing between that and a multi-hundred-millisecond freeze the first
     * time somebody presses 3. Both water profiles and the ice material are
     * exercised with real geometry Р В Р’В Р В РІР‚В Р В Р’В Р Р†Р вЂљРЎв„ўР В Р вЂ Р В РІР‚С™Р РЋРЎС™ a pipeline compiled against an empty draw
     * is a warm-up that quietly covers nothing.
     */
    async warmUp(x: number, y: number, z: number): Promise<void> {
        await this.water.warmUp(x, y, z);
        await this.crystals.warmUp(x, y, z);
    }

    /**
     * Clear the warm-up geometry. Called after `main`'s warm-up frames, not
     * inside `warmUp` Р В Р’В Р В РІР‚В Р В Р’В Р Р†Р вЂљРЎв„ўР В Р вЂ Р В РІР‚С™Р РЋРЎС™ the whole point is that those frames draw it.
     */
    finishWarmUp(): void {
        this.water.finishWarmUp();
        this.crystals.finishWarmUp();
    }

    /** Release the shared spell-water and crystal renderers when the owning system is torn down. */
    dispose(): void {
        this.water.dispose();
        this.crystals.dispose();
    }
}
