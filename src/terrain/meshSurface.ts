/** Indexed vertical surface queries against the actual imported terrain triangles. */

/** Numeric storage accepted from Babylon vertex data and lightweight tests. */
export type NumericArray = ArrayLike<number>;

/** Minimum mutable vector contract needed for geometric normal output. */
export interface MutableNormal {
    set(x: number, y: number, z: number): MutableNormal;
    normalize(): MutableNormal;
}

/** Mutable world position whose horizontal coordinates can be clamped in place. */
export interface MutableWorldPosition {
    x: number;
    y: number;
    z: number;
}

/** Indexed vertical surface queries against the actual imported terrain triangles. */
export class MeshSurface {
    readonly colors: NumericArray | null;
    readonly positions: NumericArray;
    readonly indices: NumericArray;
    readonly cellSize: number;
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
    readonly minHeight: number;
    readonly maxHeight: number;
    readonly cols: number;
    readonly rows: number;
    /** Triangle offsets per grid cell, consumed by the local terrain extractor. */
    readonly cells: number[][];

    /**
     * Index triangle offsets by X/Z cell to avoid scanning the entire terrain
     * for every foot or camera query. Arrays are retained by reference.
     */
    constructor(positions: NumericArray, indices: NumericArray, cellSize = 16, colors: NumericArray | null = null) {
        this.colors = colors;
        this.positions = positions;
        this.indices = indices;
        this.cellSize = cellSize;
        let minX = Infinity, minZ = Infinity, minHeight = Infinity;
        let maxX = -Infinity, maxZ = -Infinity, maxHeight = -Infinity;
        for (let i = 0; i < positions.length; i += 3) {
            minX = Math.min(minX, positions[i]);
            maxX = Math.max(maxX, positions[i]);
            minHeight = Math.min(minHeight, positions[i + 1]);
            maxHeight = Math.max(maxHeight, positions[i + 1]);
            minZ = Math.min(minZ, positions[i + 2]);
            maxZ = Math.max(maxZ, positions[i + 2]);
        }
        this.minX = minX; this.maxX = maxX;
        this.minZ = minZ; this.maxZ = maxZ;
        this.minHeight = minHeight; this.maxHeight = maxHeight;
        this.cols = Math.ceil((maxX - minX) / cellSize);
        this.rows = Math.ceil((maxZ - minZ) / cellSize);
        this.cells = Array.from({ length: this.cols * this.rows }, () => []);
        for (let i = 0; i < indices.length; i += 3) {
            const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
            const x0 = this._col(Math.min(positions[a], positions[b], positions[c]));
            const x1 = this._col(Math.max(positions[a], positions[b], positions[c]));
            const z0 = this._row(Math.min(positions[a + 2], positions[b + 2], positions[c + 2]));
            const z1 = this._row(Math.max(positions[a + 2], positions[b + 2], positions[c + 2]));
            for (let z = z0; z <= z1; z++) {
                for (let x = x0; x <= x1; x++) this.cells[z * this.cols + x].push(i);
            }
        }
    }

    /** Map world X to a clamped grid column for local-terrain extraction. */
    _col(x: number): number {
        return Math.max(0, Math.min(this.cols - 1, Math.floor((x - this.minX) / this.cellSize)));
    }

    /** Map world Z to a clamped grid row for local-terrain extraction. */
    _row(z: number): number {
        return Math.max(0, Math.min(this.rows - 1, Math.floor((z - this.minZ) / this.cellSize)));
    }

    /**
     * Return the uppermost triangle height at clamped world X/Z coordinates.
     * Optionally interpolate color and write the upward geometric normal.
     */
    sample(x: number, z: number, normal?: MutableNormal | null, color?: { [index: number]: number } | null): number {
        x = Math.max(this.minX, Math.min(this.maxX, x));
        z = Math.max(this.minZ, Math.min(this.maxZ, z));
        const candidates = this.cells[this._row(z) * this.cols + this._col(x)];
        const p = this.positions, ix = this.indices;
        let height = -Infinity;
        for (let n = 0; n < candidates.length; n++) {
            const i = candidates[n];
            const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
            const bx = p[b] - p[a], bz = p[b + 2] - p[a + 2];
            const cx = p[c] - p[a], cz = p[c + 2] - p[a + 2];
            const determinant = bx * cz - cx * bz;
            if (Math.abs(determinant) < 1e-10) continue;
            const dx = x - p[a], dz = z - p[a + 2];
            const u = (dx * cz - cx * dz) / determinant;
            const v = (bx * dz - dx * bz) / determinant;
            if (u < -1e-6 || v < -1e-6 || u + v > 1.000001) continue;
            const by = p[b + 1] - p[a + 1], cy = p[c + 1] - p[a + 1];
            const y = p[a + 1] + u * by + v * cy;
            if (y <= height) continue;
            height = y;
            if (color && this.colors) {
                for (let k = 0; k < 3; k++) {
                    color[k] = this.colors[ix[i] * 4 + k] * (1 - u - v)
                        + this.colors[ix[i + 1] * 4 + k] * u
                        + this.colors[ix[i + 2] * 4 + k] * v;
                }
            }
            if (normal) {
                const gx = (by * cz - cy * bz) / determinant;
                const gz = (bx * cy - cx * by) / determinant;
                normal.set(-gx, 1, -gz).normalize();
            }
        }
        if (!Number.isFinite(height)) throw new Error(`No Exalted terrain triangle at (${x}, ${z}).`);
        return height;
    }

    /** Clamp position X/Z in place to indexed terrain bounds; preserve Y. */
    clampToPlayArea(position: MutableWorldPosition): void {
        position.x = Math.max(this.minX + 1, Math.min(this.maxX - 1, position.x));
        position.z = Math.max(this.minZ + 1, Math.min(this.maxZ - 1, position.z));
    }
}
