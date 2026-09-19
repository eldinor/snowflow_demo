/** Retessellate nearby soft source triangles without changing their planes or edges. */
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Constants } from '@babylonjs/core/Engines/constants';
import { Vector2 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import { surfaceWeights } from './surfaceTypes.ts';
import { ExaltedWorld } from './exaltedWorld.ts';

export const DETAIL_SUBDIVISIONS = 24;
const CAPACITY = 512;

export interface TerrainFocus { x: number; z: number }

/** Fixed-capacity detail patch backed by a GPU table of selected source triangles. */
export class LocalTerrain {
    readonly world: ExaltedWorld;
    readonly coarse: Mesh;
    readonly center = new Vector2(Infinity, Infinity);
    readonly focus = new Vector2();
    readonly data = new Float32Array(CAPACITY * 9 * 4);
    readonly texture: RawTexture;
    readonly mesh: Mesh;
    readonly farIndices: Uint32Array;
    readonly soft: Uint8Array;
    triangleCount = 0;

    /** Allocate barycentric detail geometry and classify authored soft triangles. */
    constructor(scene: Scene, world: ExaltedWorld, coarse: Mesh) {
        if (!world.surface) throw new Error('Local terrain requires a loaded Exalted surface.');
        this.world = world;
        this.coarse = coarse;
        this.texture = RawTexture.CreateRGBATexture(
            this.data, CAPACITY, 9, scene, false, false,
            Constants.TEXTURE_NEAREST_SAMPLINGMODE, Constants.TEXTURETYPE_FLOAT,
        );
        const subdivisions = DETAIL_SUBDIVISIONS;
        const vertices = (subdivisions + 1) * (subdivisions + 2) / 2;
        const positions = new Float32Array(CAPACITY * vertices * 3);
        const indices = new Uint32Array(CAPACITY * subdivisions * subdivisions * 3);
        const rowStart = (row: number): number => row * (subdivisions + 1) - row * (row - 1) / 2;
        let vertexWrite = 0, indexWrite = 0;
        for (let triangle = 0; triangle < CAPACITY; triangle++) {
            for (let row = 0; row <= subdivisions; row++) for (let column = 0; column <= subdivisions - row; column++) {
                positions[vertexWrite++] = column / subdivisions;
                positions[vertexWrite++] = row / subdivisions;
                positions[vertexWrite++] = triangle;
            }
            const base = triangle * vertices;
            for (let row = 0; row < subdivisions; row++) for (let column = 0; column < subdivisions - row; column++) {
                const a = base + rowStart(row) + column, b = a + 1, c = base + rowStart(row + 1) + column;
                indices[indexWrite++] = a; indices[indexWrite++] = b; indices[indexWrite++] = c;
                if (column < subdivisions - row - 1) {
                    indices[indexWrite++] = b; indices[indexWrite++] = c + 1; indices[indexWrite++] = c;
                }
            }
        }
        this.mesh = new Mesh('localSandAndSnow', scene);
        const vertexData = new VertexData();
        vertexData.positions = positions;
        vertexData.indices = indices;
        vertexData.applyToMesh(this.mesh);
        this.mesh.sideOrientation = coarse.sideOrientation;
        this.mesh.alwaysSelectAsActiveMesh = true;
        this.mesh.isPickable = false;
        this.mesh.renderingGroupId = 1;
        this.mesh.metadata = { triangles: 0 };

        const source = world.data;
        this.farIndices = new Uint32Array(source.indices.length);
        this.soft = new Uint8Array(source.indices.length / 3);
        const weights = new Float32Array(2), color = new Float32Array(3);
        for (let triangle = 0; triangle < this.soft.length; triangle++) for (let vertex = 0; vertex < 3; vertex++) {
            const colorIndex = source.indices[triangle * 3 + vertex] * 4;
            for (let component = 0; component < 3; component++) color[component] = source.colors[colorIndex + component];
            surfaceWeights(color, weights);
            if (weights[0] + weights[1] > .001) this.soft[triangle] = 1;
        }
    }

    /** Select and retessellate nearby soft triangles after an eight-metre cell change. */
    update(focus: TerrainFocus): boolean {
        this.focus.set(focus.x, focus.z);
        const x = Math.round(focus.x / 8) * 8, z = Math.round(focus.z / 8) * 8;
        if (x === this.center.x && z === this.center.y) return false;
        this.center.set(x, z);
        const { positions, normals, colors, indices } = this.world.data;
        const surface = this.world.surface;
        if (!surface) throw new Error('Local terrain surface was disposed.');
        const selected = new Set<number>();
        for (let row = surface._row(z - 22); row <= surface._row(z + 22); row++) {
            for (let column = surface._col(x - 22); column <= surface._col(x + 22); column++) {
                for (const offset of surface.cells[row * surface.cols + column]) {
                    if (!this.soft[offset / 3]) continue;
                    const a = indices[offset] * 3, b = indices[offset + 1] * 3, c = indices[offset + 2] * 3;
                    const centerX = (positions[a] + positions[b] + positions[c]) / 3;
                    const centerZ = (positions[a + 2] + positions[b + 2] + positions[c + 2]) / 3;
                    if (Math.abs(centerX - x) <= 22 && Math.abs(centerZ - z) <= 22) selected.add(offset);
                }
            }
        }
        if (selected.size > CAPACITY) throw new Error('Local terrain triangle capacity exceeded');
        const offsets = [...selected].sort((a, b) => a - b);
        let write = 0, from = 0, triangle = 0;
        for (const offset of offsets) {
            this.farIndices.set(indices.slice(from, offset), write);
            write += offset - from;
            from = offset + 3;
            for (let vertex = 0; vertex < 3; vertex++) {
                const index = indices[offset + vertex];
                for (let component = 0; component < 3; component++) {
                    this.data[(vertex * CAPACITY + triangle) * 4 + component] = positions[index * 3 + component];
                    this.data[((3 + vertex) * CAPACITY + triangle) * 4 + component] = normals[index * 3 + component];
                    this.data[((6 + vertex) * CAPACITY + triangle) * 4 + component] = colors[index * 4 + component];
                }
            }
            triangle++;
        }
        this.farIndices.set(indices.slice(from), write);
        write += indices.length - from;
        this.coarse.setIndices(this.farIndices.subarray(0, write));
        this.coarse.metadata.triangles = write / 3;
        const subMesh = this.mesh.subMeshes[0];
        if (!subMesh) throw new Error('Local terrain detail mesh has no submesh.');
        subMesh.indexCount = triangle * DETAIL_SUBDIVISIONS ** 2 * 3;
        this.mesh.metadata.triangles = subMesh.indexCount / 3;
        this.mesh.isVisible = triangle > 0;
        this.triangleCount = triangle;
        this.texture.update(this.data);
        return true;
    }

    /** Release the detail triangle table and render mesh. */
    dispose(): void {
        this.texture.dispose();
        this.mesh.dispose();
    }
}
