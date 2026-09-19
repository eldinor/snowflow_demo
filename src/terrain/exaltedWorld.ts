/** September 9 visual terrain and the user-authorised CPU grounding surface. */
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders/glTF';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Vector2 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import { Constants } from '@babylonjs/core/Engines/constants';
import { MeshSurface, type MutableNormal, type MutableWorldPosition } from './meshSurface.ts';
import { surfaceWeights } from './surfaceTypes.ts';
import { DEFAULT_SPAWN } from '../world/spawnPoints.ts';

/** Vertex buffers guaranteed after a successful Exalted terrain load. */
export type LoadedTerrainData = VertexData & {
    positions: NonNullable<VertexData['positions']>;
    normals: NonNullable<VertexData['normals']>;
    colors: NonNullable<VertexData['colors']>;
    indices: NonNullable<VertexData['indices']>;
};

export const EXALTED_SPAWN = Object.freeze({ x: -DEFAULT_SPAWN.x, y: 4.8, z: -DEFAULT_SPAWN.y });

/** Load, retain and query Exalted's authored terrain geometry and biome colors. */
export class ExaltedWorld {
    readonly scene: Scene;
    readonly origin = new Vector2(-936, -702);
    readonly size = 1872;
    readonly extent = new Vector2(1872, 1404);
    readonly heightTex: RawTexture;
    readonly auxTex: RawTexture;
    readonly _color = new Float32Array(3);
    readonly _weights = new Float32Array(2);
    minHeight = 0;
    maxHeight = 0;
    data!: LoadedTerrainData;
    surface: MeshSurface | null = null;
    surfaceMap?: RawTexture;

    constructor(scene: Scene) {
        this.scene = scene;
        // The common terrain material keeps these bindings, although Exalted's
        // shader reads imported positions, normals, and colors instead.
        this.heightTex = RawTexture.CreateRGBATexture(
            new Uint8Array([0, 0, 0, 255]), 1, 1, scene, false, false,
        );
        this.auxTex = this.heightTex;
    }

    /** Bake loader transforms into the target and derive CPU and GPU biome maps. */
    async loadInto(target: Mesh): Promise<void> {
        const url = `${import.meta.env.BASE_URL}assets/exalted/alpha-map.glb`;
        const container = await LoadAssetContainerAsync(url, this.scene);
        try {
            const ground = container.meshes.find(mesh => mesh.name === 'vis_ground');
            if (!(ground instanceof Mesh) || !ground.isVerticesDataPresent('color')) {
                throw new Error('Exalted alpha-map.glb must contain vis_ground with biome vertex colours.');
            }
            const data = VertexData.ExtractFromMesh(ground);
            data.transform(ground.computeWorldMatrix(true));
            if (!data.positions || !data.normals || !data.indices || !data.colors) {
                throw new Error('Exalted vis_ground must contain positions, normals, indices, and vertex colors.');
            }
            data.applyToMesh(target);
            target.sideOrientation = ground.sideOrientation;
            target.useVertexColors = true;
            target.hasVertexAlpha = false;
            target.metadata = { triangles: data.indices.length / 3, source: url };
            const bounds = target.getBoundingInfo().boundingBox;
            this.minHeight = bounds.minimum.y;
            this.maxHeight = bounds.maximum.y;
            this.data = data as LoadedTerrainData;
            this.surface = new MeshSurface(data.positions, data.indices, 16, data.colors);

            const width = 469, height = 352;
            const map = new Uint8Array(width * height * 4);
            for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
                const weights = this.weightsAt(-936 + column * 4, -702 + row * 4);
                const offset = (row * width + column) * 4;
                map[offset] = Math.round(weights[0] * 255);
                map[offset + 1] = Math.round(weights[1] * 255);
                map[offset + 3] = 255;
            }
            this.surfaceMap = RawTexture.CreateRGBATexture(
                map, width, height, this.scene, false, false,
                Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
            );
        } finally {
            container.dispose();
        }
    }

    /** Access the loaded CPU surface while producing a useful lifecycle error. */
    private loadedSurface(): MeshSurface {
        if (!this.surface) throw new Error('Exalted terrain surface is not loaded.');
        return this.surface;
    }

    /** Imported triangle height in world metres, before local GPU deformation. */
    heightAt(x: number, z: number): number {
        return this.loadedSurface().sample(x, z);
    }

    /** Reusable [snow, sand] weights; copy the result if it must survive another call. */
    weightsAt(x: number, z: number): Float32Array {
        this.loadedSurface().sample(x, z, null, this._color);
        return surfaceWeights(this._color, this._weights);
    }

    /** Write the authored triangle-plane normal without allocating another vector. */
    normalAt<T extends MutableNormal>(x: number, z: number, out: T): T {
        this.loadedSurface().sample(x, z, out);
        return out;
    }

    /** Clamp a mutable position to the imported terrain's playable X/Z bounds. */
    clampToPlayArea(position: MutableWorldPosition): void {
        this.loadedSurface().clampToPlayArea(position);
    }

    /** Release sampling textures and the CPU surface reference. */
    dispose(): void {
        this.heightTex.dispose();
        this.surfaceMap?.dispose();
        this.surface = null;
    }
}
