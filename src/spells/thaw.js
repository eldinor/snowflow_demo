/**
 * Spell 9 — Thaw.
 *
 * A warm pulse reverses the persistent snow state around an aimed point. The
 * expanding disc fills depressions, collapses berms, loosens compression and
 * melts glaze; nearby crystal geometry sublimates through its normal lifecycle.
 * One short shared-water strand traces a partly buried, snow-laden runoff seam.
 */

import { PROFILE_TUBE, STRAND_COLS } from "./waterBody.js";
import { clamp01, smooth01 } from "./bending.js";

const LIFE = 4.4;
const RADIUS = 6.4;
const COLS = 30;

export class Thaw {
    /** @param {import("./spellSystem.js").SpellContext} ctx */
    constructor(ctx) {
        this.ctx = ctx;
        this.active = false;
        this.strand = -1;
        this.t = 0;
        this.x = 0;
        this.y = 0;
        this.z = 0;
        this._pulseOwed = 0;
        this._mistOwed = 0;
        this._count = 0;
        this._px = new Float32Array(STRAND_COLS);
        this._py = new Float32Array(STRAND_COLS);
        this._pz = new Float32Array(STRAND_COLS);
        this._dist = new Float32Array(STRAND_COLS);
    }

    trigger(x, y, z, aimX, aimZ) {
        if (this.strand < 0) this.strand = this.ctx.water.acquire();
        this.x = x;
        this.y = y;
        this.z = z;
        this.t = 0;
        this._pulseOwed = 0.2;
        this._mistOwed = 0;
        this.active = true;
        this._buildRivulet(aimX, aimZ);
        this.ctx.rig.addTrauma(0.08);
    }

    _buildRivulet(aimX, aimZ) {
        const terrain = this.ctx.terrain;
        let x = this.x;
        let z = this.z;
        let dx = aimX;
        let dz = aimZ;
        let dl = Math.hypot(dx, dz) || 1;
        dx /= dl; dz /= dl;
        let dist = 0;
        this._count = COLS;
        for (let i = 0; i < COLS; i++) {
            this._px[i] = x;
            // Buried into the snow so only the crown of the slush is exposed.
            this._py[i] = terrain.heightAt(x, z) - 0.045;
            this._pz[i] = z;
            this._dist[i] = dist;

            const e = 0.42;
            const gx = terrain.heightAt(x + e, z) - terrain.heightAt(x - e, z);
            const gz = terrain.heightAt(x, z + e) - terrain.heightAt(x, z - e);
            // Gravity dominates on a slope; on flats the camera aim gives the
            // water a stable direction instead of a noisy random walk.
            let wx = dx * 0.32 - gx * 1.8;
            let wz = dz * 0.32 - gz * 1.8;
            dl = Math.hypot(wx, wz) || 1;
            wx /= dl; wz /= dl;
            dx = dx * 0.68 + wx * 0.32;
            dz = dz * 0.68 + wz * 0.32;
            dl = Math.hypot(dx, dz) || 1;
            dx /= dl; dz /= dl;
            // A small alternating cross-flow breaks the pipe-straight reading.
            const meander = Math.sin(i * 1.37 + x * 0.21 + z * 0.17) * 0.055;
            x += dx * 0.28 + dz * meander;
            z += dz * 0.28 - dx * meander;
            dist += 0.28;
        }
    }

    /** @param {number} dt */
    update(dt) {
        if (!this.active) return;
        this.t += dt;
        if (this.t >= LIFE) {
            this._end();
            return;
        }

        const grow = smooth01(this.t / 1.35);
        const fade = 1 - smooth01((this.t - 3.25) / 1.15);
        const radius = RADIUS * grow;
        const env = Math.min(1, this.t * 5) * fade;

        this._pulseOwed += dt;
        while (this._pulseOwed >= 0.12) {
            this._pulseOwed -= 0.12;
            this.ctx.deform.brush(
                this.x, this.z, Math.max(0.25, radius),
                -0.045, -0.055, -0.13, -0.18,
                this.t * 0.37, 1.0, 0.12
            );
        }
        this.ctx.crystals.meltNear(this.x, this.z, radius, dt * 4.5);

        this.ctx.lights.add(
            this.x, this.y + 0.28, this.z,
            radius + 3.0, 1.0, 0.48, 0.18, 17.0 * env
        );
        this._rivulet(grow, fade);
        this._mist(dt, radius, env);
    }

    _rivulet(grow, fade) {
        if (this.strand < 0) return;
        const live = Math.max(2, Math.min(this._count, Math.ceil(this._count * grow)));
        for (let i = 0; i < live; i++) {
            let tx, ty, tz;
            if (i + 1 < live) {
                tx = this._px[i + 1] - this._px[i];
                ty = this._py[i + 1] - this._py[i];
                tz = this._pz[i + 1] - this._pz[i];
            } else {
                tx = this._px[i] - this._px[i - 1];
                ty = this._py[i] - this._py[i - 1];
                tz = this._pz[i] - this._pz[i - 1];
            }
            const tl = Math.hypot(tx, ty, tz) || 1;
            tx /= tl; ty /= tl; tz /= tl;
            let rx = tz, ry = 0, rz = -tx;
            const rl = Math.hypot(rx, rz) || 1;
            rx /= rl; rz /= rl;
            const head = 1 - i / Math.max(1, live - 1);
            const radius = (0.032 + head * 0.040) * fade;
            this.ctx.water.column(
                this.strand, i,
                this._px[i], this._py[i], this._pz[i], radius,
                rx, ry, rz, this._dist[i] * 0.7,
                this._dist[i], this.t / LIFE, 0.88, 0.20
            );
        }
        this.ctx.water.setParams(
            this.strand, PROFILE_TUBE, 0.70, clamp01(fade * 0.82), live
        );
    }

    _mist(dt, radius, env) {
        const sp = this.ctx.spray;
        if (!sp || radius < 0.2) return;
        this._mistOwed += dt * 115 * this.ctx.sprayScale * env;
        let n = this._mistOwed | 0;
        this._mistOwed -= n;
        if (n > 32) n = 32;
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random()) * radius;
            const x = this.x + Math.cos(a) * r;
            const z = this.z + Math.sin(a) * r;
            const y = this.ctx.terrain.heightAt(x, z) + 0.04 + Math.random() * 0.2;
            sp.emit(
                x, y, z,
                Math.cos(a) * 0.15 + (Math.random() - 0.5) * 0.3,
                0.35 + Math.random() * 0.75,
                Math.sin(a) * 0.15 + (Math.random() - 0.5) * 0.3,
                0.055 + Math.random() * 0.09,
                1.1 + Math.random() * 1.5,
                0, 4.8
            );
        }
    }

    _end() {
        this.active = false;
        if (this.strand >= 0) {
            this.ctx.water.release(this.strand);
            this.strand = -1;
        }
    }

    cancel() {
        this._end();
    }
}
