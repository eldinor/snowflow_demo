/** Small asynchronous GPU-displacement readback for feet and camera grounding. */
import { ProceduralTexture } from '@babylonjs/core/Materials/Textures/Procedurals/proceduralTexture';
import { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import { Constants } from '@babylonjs/core/Engines/constants';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import { Vector2 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import { whenReady } from '../core/gpuUtil.ts';
import { S } from '../core/settings.ts';

const RESOLUTION = 128;
const SIZE = 16;

export interface ProbeFocus { x: number; z: number }

interface GroundProbeTerrain {
    heightfield: {
        surfaceMap: BaseTexture;
        origin: Vector2;
        extent: Vector2;
        weightsAt(x: number, z: number): ArrayLike<number>;
    };
    deform: {
        texture: BaseTexture;
        center: Vector2;
        size: number;
    };
    local: {
        focus: Vector2;
        triangleCount: number;
    };
}

interface ProbeCache {
    data: Float32Array;
    stride: number;
    x: number;
    z: number;
}

/** Render and asynchronously cache a small player-centered displacement window. */
export class GroundProbe {
    readonly terrain: GroundProbeTerrain;
    readonly origin = new Vector2();
    readonly texture: ProceduralTexture;
    epoch = 0;
    lastRead = -Infinity;
    cache: ProbeCache | null = null;
    pending = false;
    readyToRead = false;
    error?: string;

    constructor(scene: Scene, terrain: GroundProbeTerrain) {
        this.terrain = terrain;
        this.texture = new ProceduralTexture('groundProbe', RESOLUTION, 'groundProbe', scene, {
            generateMipMaps: false,
            type: Constants.TEXTURETYPE_FLOAT,
            format: Constants.TEXTUREFORMAT_RGBA,
            shaderLanguage: ShaderLanguage.WGSL,
            skipSceneRegistration: true,
        });
        this.texture.refreshRate = 0;
        this.texture.setTexture('surfaceMap', terrain.heightfield.surfaceMap);
        this.texture.setVector2('surfaceOrigin', terrain.heightfield.origin);
        this.texture.setVector2('surfaceExtent', terrain.heightfield.extent);
        this.bind({ x: -65, z: 604 });
    }

    /** Bind current simulation textures and snap the probe to its sampling grid. */
    bind(focus: ProbeFocus): void {
        const terrain = this.terrain, texture = this.texture;
        this.origin.set(
            Math.floor(focus.x * 8) / 8 - SIZE / 2,
            Math.floor(focus.z * 8) / 8 - SIZE / 2,
        );
        texture.setTexture('deformTex', terrain.deform.texture);
        texture.setVector2('deformCenter', terrain.deform.center);
        texture.setVector2('patchCenter', terrain.local.focus);
        texture.setFloat('deformSize', terrain.deform.size);
        const deformDepth = S.deformDepth;
        if (typeof deformDepth !== 'number') throw new Error('deformDepth setting must be numeric.');
        texture.setFloat('deformDepthScale', deformDepth);
        texture.setVector2('probeOrigin', this.origin);
        texture.setFloat('probeSize', SIZE);
    }

    /** Compile the probe shader before interactive frames request readback. */
    async warmUp(): Promise<void> {
        await whenReady(this.texture, 'grounding probe');
    }

    /** Render a throttled probe update without blocking for its pixels. */
    update(focus: ProbeFocus): void {
        if (!this.terrain.local.triangleCount) { this.cache = null; return; }
        if (this.pending || performance.now() - this.lastRead < 100) return;
        this.bind(focus);
        this.texture.render();
        this.readyToRead = true;
    }

    /** Begin readback after frame submission; epochs reject results from before reset. */
    afterFrame(): void {
        if (!this.readyToRead || this.pending) return;
        this.readyToRead = false;
        this.pending = true;
        this.lastRead = performance.now();
        const x = this.origin.x, z = this.origin.y, epoch = this.epoch;
        const readback = this.texture.readPixels();
        if (!readback) {
            this.pending = false;
            this.error = 'Ground probe readback is unavailable.';
            return;
        }
        readback.then(raw => {
            if (epoch !== this.epoch || !raw) return;
            if (!(raw instanceof Float32Array)) {
                throw new Error(`Ground probe expected Float32Array, received ${raw.constructor.name}.`);
            }
            this.cache = { data: raw, stride: raw.length / (RESOLUTION * RESOLUTION), x, z };
        }).catch((error: unknown) => {
            this.error = error instanceof Error ? error.message : String(error);
        }).finally(() => {
            this.pending = false;
        });
    }

    /** Return cached displacement; missing and out-of-window samples return zero. */
    heightAt(x: number, z: number): number {
        const cache = this.cache;
        if (!cache) return 0;
        const fx = (x - cache.x) / SIZE * RESOLUTION - .5;
        const fz = (z - cache.z) / SIZE * RESOLUTION - .5;
        if (fx < 0 || fz < 0 || fx >= RESOLUTION - 1 || fz >= RESOLUTION - 1) return 0;
        const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
        const index = (iz * RESOLUTION + ix) * cache.stride;
        const row = RESOLUTION * cache.stride;
        const weights = this.terrain.heightfield.weightsAt(x, z);
        return ((cache.data[index] * (1 - tx) + cache.data[index + cache.stride] * tx) * (1 - tz)
            + (cache.data[index + row] * (1 - tx) + cache.data[index + row + cache.stride] * tx) * tz)
            * (weights[0] + weights[1]);
    }

    /** Invalidate cached and outstanding samples after a teleport or reset. */
    reset(): void {
        this.epoch++;
        this.cache = null;
        this.lastRead = -Infinity;
        this.readyToRead = false;
    }

    /** Release the probe texture after invalidating pending results. */
    dispose(): void {
        this.reset();
        this.texture.dispose();
    }
}
