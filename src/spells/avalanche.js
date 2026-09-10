/**
 * Spell 8 — Avalanche.
 *
 * A broad slab fractures ahead of the caster and runs along the terrain. One
 * sheet strand gives the moving front a coherent silhouette; the shared
 * deformation field carries the compacted track and edge berms, while the
 * shared spray pool supplies both a low powder curtain and ballistic clods.
 */

import { PROFILE_SHEET } from "./waterBody.js";
import { clamp01, smooth01, bell } from "./bending.js";

const COLS = 56;
const LIFE = 3.15;
const MAX_REACH = 28;

export class Avalanche {
    /** @param {import("./spellSystem.js").SpellContext} ctx */
    constructor(ctx) {
        this.ctx = ctx;
        this.active = false;
        this.strand = -1;
        this.t = 0;
        this.ox = 0;
        this.oz = 0;
        this.dx = 0;
        this.dz = 1;
        this.reach = 0;
        this.speed = 8;
        this._trackOwed = 0;
        this._sprayOwed = 0;
        this._seed = 0;
    }

    /** @param {number} ax @param {number} az flat aim */
    trigger(ax, az) {
        if (this.strand < 0) this.strand = this.ctx.water.acquire();
        if (this.strand < 0) return;
        const n = Math.hypot(ax, az) || 1;
        this.dx = ax / n;
        this.dz = az / n;
        const ch = this.ctx.controller;
        this.ox = ch.position.x + this.dx * 1.8;
        this.oz = ch.position.z + this.dz * 1.8;
        this.t = 0;
        this.reach = 0;
        this.speed = 8.5;
        this._trackOwed = 0;
        this._sprayOwed = 0;
        this._seed = Math.random() * 1000;
        this.active = true;
        this._fracture();
        this.ctx.rig.addTrauma(0.20);
    }

    /** @param {number} dt */
    update(dt) {
        if (!this.active) return;
        this.t += dt;
        if (this.t >= LIFE || this.reach >= MAX_REACH || this.strand < 0) {
            this._end();
            return;
        }

        const terrain = this.ctx.terrain;
        const hx = this.ox + this.dx * this.reach;
        const hz = this.oz + this.dz * this.reach;
        const here = terrain.heightAt(hx, hz);
        const ahead = terrain.heightAt(hx + this.dx * 1.4, hz + this.dz * 1.4);
        // Downhill adds momentum; uphill consumes it, but the cast never stalls.
        const slope = (here - ahead) / 1.4;
        this.speed += (2.8 + slope * 9.0 - this.speed * 0.10) * dt;
        this.speed = Math.max(7.0, Math.min(18.5, this.speed));
        const travelled = Math.min(this.speed * dt, MAX_REACH - this.reach);
        this.reach += travelled;

        const life01 = this.t / LIFE;
        const rise = smooth01(this.t / 0.28);
        const fade = 1 - smooth01((life01 - 0.68) / 0.32);
        const env = rise * fade;
        const spread = clamp01(this.reach / 15);
        const halfWidth = 3.4 + spread * 2.7;
        const height = (1.45 + this.speed * 0.035) * env;
        const wx = this.dz;
        const wz = -this.dx;

        let headX = hx, headY = here, headZ = hz;
        for (let c = 0; c < COLS; c++) {
            const u = c / (COLS - 1);
            const q = u * 2 - 1;
            // The centre leads and the ends drag, giving a slab rather than a
            // perfectly straight billboard. Low-frequency breakup rides on it.
            const drag = q * q * (0.8 + spread * 0.65);
            const ragged = Math.sin(q * 5.2 + this._seed) * 0.11 * Math.abs(q);
            const x = this.ox + this.dx * (this.reach - drag + ragged) + wx * q * halfWidth;
            const z = this.oz + this.dz * (this.reach - drag + ragged) + wz * q * halfWidth;
            const y = terrain.heightAt(x, z) - 0.11;
            const centre = bell(u);
            const amp = height * (0.28 + 0.72 * centre);
            const curl = 0.24 + centre * 0.23;
            const foam = 0.48 + centre * 0.42;

            this.ctx.water.column(
                this.strand, c, x, y, z, amp,
                this.dx, 0, this.dz, curl,
                this.reach + u * 2.0, life01, foam, 1
            );
            if (c === (COLS >> 1)) { headX = x; headY = y; headZ = z; }
        }
        // Almost opaque: this is a snow slab carrying a wet breaking face.
        this.ctx.water.setParams(
            this.strand, PROFILE_SHEET, 0.82, clamp01(env * 1.5), COLS
        );

        this.ctx.lights.add(
            headX, headY + height * 0.48, headZ,
            10.5, 0.42, 0.70, 0.95, 11.0 * env
        );
        this._track(travelled, env, halfWidth);
        this._spray(travelled, env, halfWidth, height);
    }

    /** A broken glazed seam appears before the slab starts moving. */
    _fracture() {
        const f = this.ctx.deform;
        const wx = this.dz;
        const wz = -this.dx;
        for (let i = 0; i < 13; i++) {
            const q = i / 12 * 2 - 1;
            const x = this.ox + wx * q * 3.5 + this.dx * Math.sin(i * 2.7 + this._seed) * 0.12;
            const z = this.oz + wz * q * 3.5 + this.dz * Math.sin(i * 2.7 + this._seed) * 0.12;
            f.brush(
                x, z, 0.18, 0.12, 0.10, 0.62, 0.46,
                Math.atan2(wz, wx), 1.8, 1.0
            );
        }
    }

    _track(travelled, env, halfWidth) {
        if (env < 0.06) return;
        this._trackOwed += travelled;
        while (this._trackOwed >= 0.34) {
            this._trackOwed -= 0.34;
            const behind = this.reach - this._trackOwed - 0.55;
            const x = this.ox + this.dx * behind;
            const z = this.oz + this.dz * behind;
            // One long brush across the whole slab makes continuous side berms
            // instead of a row of circular internal rims.
            this.ctx.deform.brush(
                x, z, 0.62,
                0.055 * env, 0.10 * env, 0.62 * env, 0.10 * env,
                Math.atan2(this.dz, this.dx) + Math.PI * 0.5,
                halfWidth / 0.62, 0.48
            );
        }
    }

    _spray(travelled, env, halfWidth, height) {
        const sp = this.ctx.spray;
        if (!sp || env < 0.05) return;
        this._sprayOwed += travelled * 145 * this.ctx.sprayScale;
        let n = this._sprayOwed | 0;
        this._sprayOwed -= n;
        if (n > 180) n = 180;
        const wx = this.dz;
        const wz = -this.dx;
        for (let i = 0; i < n; i++) {
            const q = Math.random() * 2 - 1;
            const drag = q * q * 1.25;
            const x = this.ox + this.dx * (this.reach - drag) + wx * q * halfWidth;
            const z = this.oz + this.dz * (this.reach - drag) + wz * q * halfWidth;
            const y = this.ctx.terrain.heightAt(x, z) + Math.random() * height;
            const clod = Math.random() < 0.16 ? 1 : 0;
            const lateral = (Math.random() - 0.5) * 3.2;
            sp.emit(
                x, y, z,
                this.dx * (1.8 + Math.random() * 4.0) + wx * lateral,
                clod ? 1.2 + Math.random() * 3.0 : 0.5 + Math.random() * 2.2,
                this.dz * (1.8 + Math.random() * 4.0) + wz * lateral,
                clod ? 0.024 + Math.random() * 0.035 : 0.065 + Math.random() * 0.11,
                clod ? 0.75 + Math.random() * 0.7 : 0.9 + Math.random() * 1.1,
                clod, clod ? 0.75 : 1.7
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
