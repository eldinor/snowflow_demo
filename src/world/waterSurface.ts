/**
 * Sparse triangle lookup: swimming uses exactly the visible lake footprint.
 * @module world/waterSurface
 */

import type { WaterMeshData } from './waterGeometry.ts';

export interface WaterSample {
    level: number;
    depth: number;
}

export interface WaterfallEmitter {
    x: number;
    y: number;
    z: number;
    dx: number;
    dz: number;
    slope: number;
}

/** Sparse triangle lookup: swimming uses exactly the visible lake footprint. */
export class WaterSurface {
    readonly data: WaterMeshData;
    readonly level: number;
    readonly cellSize: number;
    readonly cells = new Map<string, number[]>();

    constructor(data: WaterMeshData, level: number, cellSize = 16) {
        if (!(cellSize > 0)) throw new RangeError('WaterSurface cellSize must be positive');
        this.data = data;
        this.level = level;
        this.cellSize = cellSize;
        const p = data.positions, ix = data.indices;
        for (let i = 0; i < ix.length; i += 3) {
            const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
            for (let z = Math.floor(Math.min(p[a + 2], p[b + 2], p[c + 2]) / cellSize); z <= Math.floor(Math.max(p[a + 2], p[b + 2], p[c + 2]) / cellSize); z++) {
                for (let x = Math.floor(Math.min(p[a], p[b], p[c]) / cellSize); x <= Math.floor(Math.max(p[a], p[b], p[c]) / cellSize); x++) {
                    const key = `${x},${z}`;
                    const entries = this.cells.get(key);
                    if (entries) entries.push(i);
                    else this.cells.set(key, [i]);
                }
            }
        }
    }

    /** Return level and interpolated depth only inside a rendered lake triangle. */
    sample(x: number, z: number): WaterSample | null {
        const { positions: p, indices: ix, colors: c } = this.data;
        const entries = this.cells.get(`${Math.floor(x / this.cellSize)},${Math.floor(z / this.cellSize)}`) ?? [];
        for (const i of entries) {
            const a = ix[i], b = ix[i + 1], d = ix[i + 2];
            const bx = p[b * 3] - p[a * 3], bz = p[b * 3 + 2] - p[a * 3 + 2];
            const dx = p[d * 3] - p[a * 3], dz = p[d * 3 + 2] - p[a * 3 + 2];
            const det = bx * dz - dx * bz;
            if (Math.abs(det) < 1e-9) continue;
            const px = x - p[a * 3], pz = z - p[a * 3 + 2];
            const u = (px * dz - dx * pz) / det, v = (bx * pz - px * bz) / det;
            if (u >= -1e-6 && v >= -1e-6 && u + v <= 1.000001) {
                return { level: this.level, depth: Math.max(0, c[a * 4] * (1 - u - v) + c[b * 4] * u + c[d * 4] * v) };
            }
        }
        return null;
    }
}

/** Return one spray emitter per 10 m cell for steep blue channel triangles. */
export function waterfallEmitters(data: WaterMeshData): WaterfallEmitter[] {
    const cells = new Map<string, WaterfallEmitter>(), p = data.positions, ix = data.indices, c = data.colors;
    for (let i = 0; i < ix.length; i += 3) {
        const ids = [ix[i], ix[i + 1], ix[i + 2]], a = ids[0];
        if (c[a * 4 + 3] < .65) continue;
        const x = ids.reduce((sum, k) => sum + p[k * 3], 0) / 3;
        const y = ids.reduce((sum, k) => sum + p[k * 3 + 1], 0) / 3;
        const z = ids.reduce((sum, k) => sum + p[k * 3 + 2], 0) / 3;
        const key = `${Math.floor(x / 10)},${Math.floor(y / 10)},${Math.floor(z / 10)}`;
        if (!cells.has(key)) cells.set(key, { x, y, z, dx: c[a * 4 + 1], dz: c[a * 4 + 2], slope: c[a * 4 + 3] });
    }
    return [...cells.values()];
}
