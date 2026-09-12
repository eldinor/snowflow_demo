import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Constants } from '@babylonjs/core/Engines/constants';
import { Vector2 } from '@babylonjs/core/Maths/math.vector';
import { surfaceWeights } from './surfaceTypes.js';

export const DETAIL_SUBDIVISIONS = 24;
const CAPACITY = 512;

/** Retessellates source triangles without changing their planes or outer edges. */
export class LocalTerrain {
    constructor(scene, world, coarse) {
        this.world = world;
        this.coarse = coarse;
        this.center = new Vector2(Infinity, Infinity);
        this.focus = new Vector2();
        this.data = new Float32Array(CAPACITY * 9 * 4);
        this.texture = RawTexture.CreateRGBATexture(this.data, CAPACITY, 9, scene, false, false, Constants.TEXTURE_NEAREST_SAMPLINGMODE, Constants.TEXTURETYPE_FLOAT);
        const n = DETAIL_SUBDIVISIONS, vertices = (n + 1) * (n + 2) / 2;
        const positions = new Float32Array(CAPACITY * vertices * 3);
        const indices = new Uint32Array(CAPACITY * n * n * 3);
        const row = (j) => j * (n + 1) - j * (j - 1) / 2;
        let vi = 0, ii = 0;
        for (let t = 0; t < CAPACITY; t++) {
            for (let j = 0; j <= n; j++) for (let i = 0; i <= n - j; i++) {
                positions[vi++] = i / n; positions[vi++] = j / n; positions[vi++] = t;
            }
            const base = t * vertices;
            for (let j = 0; j < n; j++) for (let i = 0; i < n - j; i++) {
                const a = base + row(j) + i, b = a + 1, c = base + row(j + 1) + i;
                indices[ii++] = a; indices[ii++] = b; indices[ii++] = c;
                if (i < n - j - 1) { indices[ii++] = b; indices[ii++] = c + 1; indices[ii++] = c; }
            }
        }
        this.mesh = new Mesh('localSandAndSnow', scene);
        const vd = new VertexData(); vd.positions = positions; vd.indices = indices; vd.applyToMesh(this.mesh);
        this.mesh.sideOrientation = coarse.sideOrientation;
        this.mesh.alwaysSelectAsActiveMesh = true;
        this.mesh.isPickable = false;
        this.mesh.renderingGroupId = 1;
        this.mesh.metadata = { triangles: 0 };
        this.farIndices = new Uint32Array(world.data.indices.length);
        this.soft = new Uint8Array(world.data.indices.length / 3);
        const weights = new Float32Array(2), color = new Float32Array(3);
        for (let t = 0; t < this.soft.length; t++) for (let v = 0; v < 3; v++) {
            const index = world.data.indices[t * 3 + v] * 4;
            for (let k = 0; k < 3; k++) color[k] = world.data.colors[index + k];
            surfaceWeights(color, weights);
            if (weights[0] + weights[1] > 0.001) this.soft[t] = 1;
        }
    }

    update(focus) {
        this.focus.set(focus.x, focus.z);
        const x = Math.round(focus.x / 8) * 8, z = Math.round(focus.z / 8) * 8;
        if (x === this.center.x && z === this.center.y) return false;
        this.center.set(x, z);
        const { positions: p, normals, colors, indices } = this.world.data;
        const surface = this.world.surface;
        const selected = new Set();
        for (let j = surface._row(z - 22); j <= surface._row(z + 22); j++) {
            for (let i = surface._col(x - 22); i <= surface._col(x + 22); i++) {
                for (const offset of surface.cells[j * surface.cols + i]) {
                    if (!this.soft[offset / 3]) continue;
                    const a = indices[offset] * 3, b = indices[offset + 1] * 3, c = indices[offset + 2] * 3;
                    const cx = (p[a] + p[b] + p[c]) / 3, cz = (p[a + 2] + p[b + 2] + p[c + 2]) / 3;
                    if (Math.abs(cx - x) <= 22 && Math.abs(cz - z) <= 22) selected.add(offset);
                }
            }
        }
        if (selected.size > CAPACITY) throw new Error('Local terrain triangle capacity exceeded');
        const offsets = [...selected].sort((a, b) => a - b);
        let write = 0, from = 0, t = 0;
        for (const offset of offsets) {
            this.farIndices.set(indices.subarray(from, offset), write); write += offset - from; from = offset + 3;
            for (let v = 0; v < 3; v++) {
                const index = indices[offset + v];
                for (let k = 0; k < 3; k++) {
                    this.data[(v * CAPACITY + t) * 4 + k] = p[index * 3 + k];
                    this.data[((3 + v) * CAPACITY + t) * 4 + k] = normals[index * 3 + k];
                    this.data[((6 + v) * CAPACITY + t) * 4 + k] = colors[index * 4 + k];
                }
            }
            t++;
        }
        this.farIndices.set(indices.subarray(from), write); write += indices.length - from;
        this.coarse.setIndices(this.farIndices.subarray(0, write));
        this.coarse.metadata.triangles = write / 3;
        this.mesh.subMeshes[0].indexCount = t * DETAIL_SUBDIVISIONS ** 2 * 3;
        this.mesh.metadata.triangles = this.mesh.subMeshes[0].indexCount / 3;
        this.mesh.isVisible = t > 0;
        this.triangleCount = t;
        this.texture.update(this.data);
        return true;
    }

    dispose() { this.texture.dispose(); this.mesh.dispose(); }
}
