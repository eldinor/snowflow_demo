/** Indexed vertical surface queries against the actual imported terrain triangles. */
export class MeshSurface {
    constructor(positions, indices, cellSize = 16, colors = null) {
        this.colors = colors;
        this.positions = positions;
        this.indices = indices;
        this.cellSize = cellSize;
        this.minX = this.minZ = this.minHeight = Infinity;
        this.maxX = this.maxZ = this.maxHeight = -Infinity;
        for (let i = 0; i < positions.length; i += 3) {
            this.minX = Math.min(this.minX, positions[i]);
            this.maxX = Math.max(this.maxX, positions[i]);
            this.minHeight = Math.min(this.minHeight, positions[i + 1]);
            this.maxHeight = Math.max(this.maxHeight, positions[i + 1]);
            this.minZ = Math.min(this.minZ, positions[i + 2]);
            this.maxZ = Math.max(this.maxZ, positions[i + 2]);
        }
        this.cols = Math.ceil((this.maxX - this.minX) / cellSize);
        this.rows = Math.ceil((this.maxZ - this.minZ) / cellSize);
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

    _col(x) { return Math.max(0, Math.min(this.cols - 1, Math.floor((x - this.minX) / this.cellSize))); }
    _row(z) { return Math.max(0, Math.min(this.rows - 1, Math.floor((z - this.minZ) / this.cellSize))); }

    sample(x, z, normal, color) {
        // Camera arms and spell probes may extend beyond the playable boundary.
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
            if (y > height) {
                height = y;
                if (color && this.colors) {
                    for (let k = 0; k < 3; k++) {
                        color[k] = this.colors[ix[i] * 4 + k] * (1 - u - v)
                            + this.colors[ix[i + 1] * 4 + k] * u + this.colors[ix[i + 2] * 4 + k] * v;
                    }
                }
                if (normal) {
                    const gx = (by * cz - cy * bz) / determinant;
                    const gz = (bx * cy - cx * by) / determinant;
                    normal.set(-gx, 1, -gz).normalize();
                }
            }
        }
        if (!Number.isFinite(height)) throw new Error(`No Exalted terrain triangle at (${x}, ${z}).`);
        return height;
    }

    clampToPlayArea(position) {
        position.x = Math.max(this.minX + 1, Math.min(this.maxX - 1, position.x));
        position.z = Math.max(this.minZ + 1, Math.min(this.maxZ - 1, position.z));
    }
}
