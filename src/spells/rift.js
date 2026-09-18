/**
 * Spell 6 — Rift.
 *
 * A fracture runs away from the caster along the ground, opening a narrow
 * glazed trench and throwing its displaced snow onto two broken lips. It owns
 * no mesh: the visible result is real terrain displacement, plus the shared
 * spray and light pools. Marks are laid per metre travelled, so propagation is
 * independent of frame rate and remains continuous through a hitch.
 * @module spells/rift
 */

import { clamp01, smooth01 } from "./bending.js";

const LENGTH = 18.0;
const STEP = 0.28;
const SPEED0 = 22.0;
const SPEED1 = 9.0;
const FADE = 0.55;

/** Propagate a distance-sampled fracture through deformation and shared effects without owning a mesh. */
export class Rift {
    /** @param {import("./spellSystem.js").SpellContext} ctx */
    constructor(ctx) {
        this.ctx = ctx;
        this.active = false;
        this.t = 0;
        this.ox = 0;
        this.oz = 0;
        this.dx = 0;
        this.dz = 1;
        this.reach = 0;
        this._nextMark = 0;
        this._seed = 0;
        this._headX = 0;
        this._headZ = 0;
    }

    /**
     * @param {number} ax
     * @param {number} az flat aim direction
     */
    trigger(ax, az) {
        const ch = this.ctx.controller;
        const n = Math.hypot(ax, az) || 1;
        this.dx = ax / n;
        this.dz = az / n;
        this.ox = ch.position.x + this.dx * 0.85;
        this.oz = ch.position.z + this.dz * 0.85;
        this.t = 0;
        this.reach = 0;
        this._nextMark = 0;
        this._seed = Math.random() * 1000;
        this._headX = this.ox;
        this._headZ = this.oz;
        this.active = true;
        this.ctx.rig.addTrauma(0.16);
    }

    /**
     * Advance the fracture and emit distance-spaced marks so frame rate does not change track continuity.
     * @param {number} dt - Simulation seconds.
     */
    update(dt) {
        if (!this.active) return;
        this.t += dt;

        if (this.reach < LENGTH) {
            const u = clamp01(this.reach / LENGTH);
            const speed = SPEED0 + (SPEED1 - SPEED0) * smooth01(u);
            this.reach = Math.min(LENGTH, this.reach + speed * dt);

            while (this._nextMark <= this.reach) {
                this._stamp(this._nextMark);
                this._nextMark += STEP;
            }
        } else if (this.t > LENGTH / ((SPEED0 + SPEED1) * 0.5) + FADE) {
            this.active = false;
            return;
        }

        const tail = clamp01((LENGTH - this.reach) / 2.0);
        const fadeStart = LENGTH / ((SPEED0 + SPEED1) * 0.5);
        const fade = 1 - smooth01((this.t - fadeStart) / FADE);
        const env = Math.max(tail, fade);
        const y = this.ctx.terrain.heightAt(this._headX, this._headZ);
        this.ctx.lights.add(
            this._headX, y + 0.16, this._headZ,
            6.5, 0.34, 0.68, 1.0, 16.0 * env
        );
    }

    /** Lay one contiguous piece of the main crack. */
    _stamp(d) {
        const wrx = this.dz;
        const wrz = -this.dx;
        const phase = d * 0.73 + this._seed;
        const lateral = Math.sin(phase) * 0.20 + Math.sin(d * 1.91 + this._seed * 0.37) * 0.07;
        const slope = Math.cos(phase) * 0.20 * 0.73
                    + Math.cos(d * 1.91 + this._seed * 0.37) * 0.07 * 1.91;

        const x = this.ox + this.dx * d + wrx * lateral;
        const z = this.oz + this.dz * d + wrz * lateral;
        let tx = this.dx + wrx * slope;
        let tz = this.dz + wrz * slope;
        const tl = Math.hypot(tx, tz) || 1;
        tx /= tl;
        tz /= tl;

        this.ctx.deform.brush(
            x, z, 0.20,
            0.17, 0.085, 0.82, 0.92,
            Math.atan2(tz, tx), 2.15, 1.0
        );

        this._headX = x;
        this._headZ = z;
        this._spit(x, z, tx, tz);

        // Three deliberate forks. Their alternating sides and irregular
        // lengths prevent the main line from reading as a painted sine wave.
        const mark = Math.round(d / STEP);
        if (mark === 17 || mark === 34 || mark === 49) {
            this._branch(x, z, tx, tz, mark === 34 ? -1 : 1);
        }
    }

    _branch(x, z, tx, tz, side) {
        const a = side * (0.62 + 0.18 * Math.sin(this._seed + x));
        const ca = Math.cos(a), sa = Math.sin(a);
        const bx = tx * ca - tz * sa;
        const bz = tx * sa + tz * ca;
        const count = 4 + ((Math.abs((this._seed * 13) | 0)) & 1);
        for (let i = 1; i <= count; i++) {
            const k = i / count;
            const px = x + bx * i * 0.34;
            const pz = z + bz * i * 0.34;
            this.ctx.deform.brush(
                px, pz, 0.15 * (1 - k * 0.35),
                0.13 * (1 - k * 0.55), 0.055 * (1 - k),
                0.62, 0.88, Math.atan2(bz, bx), 1.9, 1.0
            );
        }
    }

    _spit(x, z, tx, tz) {
        const sp = this.ctx.spray;
        if (!sp) return;
        const n = Math.max(1, (3 * this.ctx.sprayScale) | 0);
        const rx = tz;
        const rz = -tx;
        const y = this.ctx.terrain.heightAt(x, z) + 0.04;
        for (let i = 0; i < n; i++) {
            const side = Math.random() < 0.5 ? -1 : 1;
            const out = side * (0.8 + Math.random() * 2.0);
            const clod = Math.random() < 0.34 ? 1 : 0;
            sp.emit(
                x, y, z,
                rx * out + tx * (Math.random() - 0.35),
                0.8 + Math.random() * 2.6,
                rz * out + tz * (Math.random() - 0.35),
                clod ? 0.018 + Math.random() * 0.025 : 0.035 + Math.random() * 0.055,
                0.55 + Math.random() * 0.75,
                clod, clod ? 0.9 : 2.2
            );
        }
    }

    /** Stop the active spell sequence through its cleanup path; terrain edits are not rolled back. */
    cancel() {
        this.active = false;
    }
}
