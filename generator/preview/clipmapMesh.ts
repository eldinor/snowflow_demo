import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';

export const CLIPMAP_GRID_SIZE = 128;
export const CLIPMAP_LEVELS = 8;
export const CLIPMAP_BASE_SPACING = 0.5;
export const CLIPMAP_GRID_HALF = CLIPMAP_GRID_SIZE / 2;
const HOLE_SHRINK = 3;

/** Builds all nested clipmap rings as one immutable mesh and one draw call. */
export function buildGeneratedClipmap(scene: Scene): Mesh {
    const side = CLIPMAP_GRID_SIZE + 1;
    const verticesPerLevel = side * side;
    const positions = new Float32Array(verticesPerLevel * CLIPMAP_LEVELS * 3);
    const colors = new Float32Array(verticesPerLevel * CLIPMAP_LEVELS * 4);
    const holeHalf = CLIPMAP_GRID_HALF / 2 - HOLE_SHRINK;
    const holeQuads = holeHalf * holeHalf * 4;
    const quads = CLIPMAP_GRID_SIZE ** 2
        + (CLIPMAP_LEVELS - 1) * (CLIPMAP_GRID_SIZE ** 2 - holeQuads);
    const indices = new Uint32Array(quads * 6);
    let positionWrite = 0;
    let colorWrite = 0;
    let indexWrite = 0;
    for (let level = 0; level < CLIPMAP_LEVELS; level++) {
        const vertexBase = level * verticesPerLevel;
        for (let z = 0; z <= CLIPMAP_GRID_SIZE; z++) {
            for (let x = 0; x <= CLIPMAP_GRID_SIZE; x++) {
                positions[positionWrite++] = x - CLIPMAP_GRID_HALF;
                positions[positionWrite++] = level;
                positions[positionWrite++] = z - CLIPMAP_GRID_HALF;
                colors[colorWrite++] = 1;
                colors[colorWrite++] = 1;
                colors[colorWrite++] = 1;
                colors[colorWrite++] = 1;
            }
        }
        for (let z = 0; z < CLIPMAP_GRID_SIZE; z++) {
            const gridZ = z - CLIPMAP_GRID_HALF;
            for (let x = 0; x < CLIPMAP_GRID_SIZE; x++) {
                const gridX = x - CLIPMAP_GRID_HALF;
                if (level > 0) {
                    const distance = Math.max(Math.abs(gridX), Math.abs(gridX + 1), Math.abs(gridZ), Math.abs(gridZ + 1));
                    if (distance <= holeHalf) continue;
                }
                const a = vertexBase + z * side + x;
                const b = a + 1;
                const c = a + side;
                const d = c + 1;
                if (((x + z) & 1) === 0) {
                    indices[indexWrite++] = a; indices[indexWrite++] = b; indices[indexWrite++] = c;
                    indices[indexWrite++] = b; indices[indexWrite++] = d; indices[indexWrite++] = c;
                } else {
                    indices[indexWrite++] = a; indices[indexWrite++] = d; indices[indexWrite++] = c;
                    indices[indexWrite++] = a; indices[indexWrite++] = b; indices[indexWrite++] = d;
                }
            }
        }
    }
    const mesh = new Mesh('generated-terrain-clipmap', scene);
    const data = new VertexData();
    data.positions = positions;
    data.colors = colors;
    data.indices = indexWrite === indices.length ? indices : indices.subarray(0, indexWrite);
    data.applyToMesh(mesh, false);
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.doNotSyncBoundingInfo = true;
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
    mesh.metadata = { triangles: indexWrite / 3, vertices: positions.length / 3 };
    return mesh;
}
