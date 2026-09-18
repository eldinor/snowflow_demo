/**
 * Spell 7 — Aegis.
 *
 * Hold to grow a bowed wall of interlocking ice teeth across the camera aim.
 * Release leaves the built portion standing; pressing 7 again shatters only
 * this wall back into the shared spray pool. The crystal field supplies the
 * geometry, shadows, refraction and prepass, so Aegis adds no draw call.
 * @module spells/aegis
 */

import { clamp01, smooth01 } from "./bending.js";

const MAX = 29;
const BUILD_TIME = 1.75;
const HALF_WIDTH = 4.25;

/** Grow and release an ice wall through the shared crystal pool rather than allocating a separate wall renderer. */
export class Aegis {
    /** @param {import("./spellSystem.js").SpellContext} ctx */
    constructor(ctx) {
        this.ctx = ctx;
        this.active = false;
        this.held = false;
        this.hasWall = false;
        this.t = 0;
        this.count = 0;
        this.cx = 0;
        this.cz = 0;
        this.fx = 0;
        this.fz = 1;
        this.rx = 1;
        this.rz = 0;
        this._seed = 0;

        this._handles = new Int16Array(MAX);
        this._handles.fill(-1);
        this._x = new Float32Array(MAX);
        this._y = new Float32Array(MAX);
        this._z = new Float32Array(MAX);
        this._height = new Float32Array(MAX);
        this._frostOwed = 0;
    }

    /** Start an aimed wall at world X/Z, or shatter the existing wall when triggered again. */
    trigger(x, z, fx, fz) {
        if (this.hasWall) {
            this.shatter();
            return;
        }
        const n = Math.hypot(fx, fz) || 1;
        this.fx = fx / n;
        this.fz = fz / n;
        this.rx = this.fz;
        this.rz = -this.fx;
        this.cx = x;
        this.cz = z;
        this.t = 0;
        this.count = 0;
        this._seed = Math.random() * 1000;
        this._frostOwed = 0;
        this._handles.fill(-1);
        this.active = true;
        this.held = true;
        this.hasWall = true;
        this.ctx.rig.addTrauma(0.10);
    }

    /** Stop growth on release while leaving already-created ice standing in the shared crystal pool. */
    setHeld(held) {
        this.held = held && this.hasWall;
        if (!held && this.active) this.active = false;
    }

    /**
     * Grow the requested wall teeth and frost envelope while held; existing teeth remain after release.
     * @param {number} dt - Simulation seconds.
     */
    update(dt) {
        if (!this.active) return;
        this.t += dt;

        const want = Math.min(MAX, Math.ceil((this.t / BUILD_TIME) * MAX));
        while (this.count < want) this._plant(this.count++);

        const k = 1 - smooth01((this.t - BUILD_TIME * 0.72) / (BUILD_TIME * 0.45));
        const gy = this.ctx.terrain.heightAt(this.cx, this.cz);
        this.ctx.lights.add(
            this.cx, gy + 1.15, this.cz,
            8.5, 0.40, 0.72, 1.0, 14.0 * (0.3 + 0.7 * k)
        );
        this._frost(dt, k);

        if (this.count >= MAX) this.active = false;
    }

    _plant(i) {
        // Centre first, then alternate left/right so the wall visibly grows
        // outward from the point the player chose.
        const rank = (i + 1) >> 1;
        const side = i === 0 ? 0 : (i & 1 ? 1 : -1);
        const q = side * rank / ((MAX - 1) * 0.5);
        const edge = Math.abs(q);
        const across = q * HALF_WIDTH;
        const bow = (1 - q * q) * 0.58;
        const jitter = Math.sin(i * 12.9898 + this._seed) * 0.055;
        const x = this.cx + this.rx * (across + jitter) + this.fx * bow;
        const z = this.cz + this.rz * (across + jitter) + this.fz * bow;
        const y = this.ctx.terrain.heightAt(x, z) - 0.10;
        const height = (2.65 - edge * 1.15) * (0.88 + 0.18 * Math.sin(i * 2.31 + this._seed));
        const radius = 0.19 + 0.045 * (1 - edge);

        // Lean slightly away from the caster and fan at the outer ends.
        const ax = this.fx * (0.12 + edge * 0.16) + this.rx * q * 0.08;
        const az = this.fz * (0.12 + edge * 0.16) + this.rz * q * 0.08;
        const handle = this.ctx.crystals.plant(
            x, y, z, ax, 1, az,
            height, radius, 0.24 + edge * 0.18, 999
        );
        this._handles[i] = handle === undefined ? -1 : handle;
        this._x[i] = x;
        this._y[i] = y;
        this._z[i] = z;
        this._height[i] = height;

        this.ctx.deform.brush(
            x, z, 0.31,
            0.075, 0.13, 0.82, 1.0,
            Math.atan2(this.rz, this.rx), 1.45, 0.72
        );
    }

    _frost(dt, strength) {
        const sp = this.ctx.spray;
        if (!sp || this.count === 0) return;
        this._frostOwed += dt * 95 * this.ctx.sprayScale * (0.3 + strength);
        let n = this._frostOwed | 0;
        this._frostOwed -= n;
        if (n > 28) n = 28;
        for (let k = 0; k < n; k++) {
            const i = (Math.random() * this.count) | 0;
            const side = Math.random() < 0.5 ? -1 : 1;
            sp.emit(
                this._x[i], this._y[i] + Math.random() * this._height[i], this._z[i],
                this.fx * (0.2 + Math.random()) + this.rx * side * Math.random(),
                0.5 + Math.random() * 1.8,
                this.fz * (0.2 + Math.random()) + this.rz * side * Math.random(),
                0.015 + Math.random() * 0.028,
                0.65 + Math.random() * 0.8,
                Math.random() < 0.25 ? 1 : 0, 2.8
            );
        }
    }

    /** Retire this wall's crystal handles and emit fragments through the shared spray pool. */
    shatter() {
        if (!this.hasWall) return;
        const sp = this.ctx.spray;
        for (let i = 0; i < this.count; i++) {
            if (!this.ctx.crystals.retire(this._handles[i])) continue;
            if (!sp) continue;
            const grains = Math.max(3, (7 * this.ctx.sprayScale) | 0);
            for (let k = 0; k < grains; k++) {
                const side = Math.random() < 0.5 ? -1 : 1;
                sp.emit(
                    this._x[i], this._y[i] + Math.random() * this._height[i], this._z[i],
                    this.rx * side * (1.1 + Math.random() * 3.2) + this.fx * Math.random() * 1.2,
                    1.2 + Math.random() * 4.2,
                    this.rz * side * (1.1 + Math.random() * 3.2) + this.fz * Math.random() * 1.2,
                    0.022 + Math.random() * 0.045,
                    0.8 + Math.random() * 1.2,
                    1, 0.75
                );
            }
        }
        this.ctx.rig.addTrauma(0.22);
        this.active = false;
        this.held = false;
        this.hasWall = false;
        this.count = 0;
        this._handles.fill(-1);
    }

    /** Stop the active spell sequence through its cleanup path; terrain edits are not rolled back. */
    cancel() {
        if (this.hasWall) this.shatter();
        this.active = false;
        this.held = false;
    }
}
