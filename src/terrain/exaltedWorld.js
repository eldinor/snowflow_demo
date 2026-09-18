/**
 * September 9 visual terrain; also the user-authorised grounding surface.
 * @module terrain/exaltedWorld
 */

import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Vector2 } from "@babylonjs/core/Maths/math.vector";
import { MeshSurface } from "./meshSurface.js";
import { DEFAULT_SPAWN } from "../world/spawnPoints.js";
import { Constants } from '@babylonjs/core/Engines/constants';
import { surfaceWeights } from './surfaceTypes.js';

export const EXALTED_SPAWN = Object.freeze({ x: -DEFAULT_SPAWN.x, y: 4.8, z: -DEFAULT_SPAWN.y });

/** September 9 visual terrain; also the user-authorised grounding surface. */
export class ExaltedWorld {
    constructor(scene) {
        this.scene = scene;
        this.origin = new Vector2(-936, -702);
        this.size = 1872;
        this.extent = new Vector2(1872, 1404);
        this._color = new Float32Array(3);
        this._weights = new Float32Array(2);
        // The common material interface keeps these bindings, but the Exalted
        // shader uses imported positions, normals and colours instead.
        this.heightTex = RawTexture.CreateRGBATexture(
            new Uint8Array([0, 0, 0, 255]), 1, 1, scene, false, false
        );
        this.auxTex = this.heightTex;
    }

    /**
     * Bake the loader's handedness transform into the target once, retain CPU triangle data and derive the soft-surface mask. Dispose the temporary asset container after extraction.
     */
    async loadInto(target) {
        const url = `${import.meta.env.BASE_URL}assets/exalted/alpha-map.glb`;
        const container = await LoadAssetContainerAsync(url, this.scene);
        try {
            const ground = container.meshes.find((mesh) => mesh.name === "vis_ground");
            if (!ground || !ground.isVerticesDataPresent("color")) {
                throw new Error("Exalted alpha-map.glb must contain vis_ground with biome vertex colours.");
            }
            // Preserve the loader's measured handedness conversion. Transform
            // positions, normals and winding together, at scale 1, exactly once.
            const data = VertexData.ExtractFromMesh(ground);
            data.transform(ground.computeWorldMatrix(true));
            data.applyToMesh(target);
            // glTF meshes use the loader's front-face convention, which differs
            // from a newly constructed Babylon Mesh in this left-handed scene.
            target.sideOrientation = ground.sideOrientation;
            target.useVertexColors = true;
            target.hasVertexAlpha = false;
            target.metadata = { triangles: data.indices.length / 3, source: url };
            const bounds = target.getBoundingInfo().boundingBox;
            this.minHeight = bounds.minimum.y;
            this.maxHeight = bounds.maximum.y;
            this.data = data;
            this.surface = new MeshSurface(data.positions, data.indices, 16, data.colors);
            const width = 469, height = 352, map = new Uint8Array(width * height * 4);
            for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
                const weights = this.weightsAt(-936 + i * 4, -702 + j * 4);
                const o = (j * width + i) * 4;
                map[o] = Math.round(weights[0] * 255); map[o + 1] = Math.round(weights[1] * 255); map[o + 3] = 255;
            }
            this.surfaceMap = RawTexture.CreateRGBATexture(map, width, height, this.scene, false, false, Constants.TEXTURE_BILINEAR_SAMPLINGMODE);
        } finally {
            container.dispose();
        }
    }

    /**
     * Return imported triangle height in world metres; this does not include the local GPU deformation offset.
     */
    heightAt(x, z) { return this.surface.sample(x, z); }
    /**
     * Return reusable [snow, sand] weights from the actual triangle colour. Copy the result if it must survive another call.
     */
    weightsAt(x, z) {
        this.surface.sample(x, z, null, this._color);
        return surfaceWeights(this._color, this._weights);
    }
    /**
     * Write the authored triangle-plane normal into out; avoids allocating a vector per grounding query.
     */
    normalAt(x, z, out) { this.surface.sample(x, z, out); return out; }
    /**
     * Clamp the mutable world position to the imported terrain's playable X/Z bounds.
     */
    clampToPlayArea(position) { this.surface.clampToPlayArea(position); }
    /** Release sampling textures and the CPU surface reference when the owning system is torn down. */
    dispose() { this.heightTex.dispose(); this.surfaceMap?.dispose(); this.surface = null; }
}
