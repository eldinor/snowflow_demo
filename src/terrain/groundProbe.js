/**
 * Small asynchronous readback of GPU displacement for feet/camera grounding.
 * @module terrain/groundProbe
 */

import { ProceduralTexture } from '@babylonjs/core/Materials/Textures/Procedurals/proceduralTexture';
import { Constants } from '@babylonjs/core/Engines/constants';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import { Vector2 } from '@babylonjs/core/Maths/math.vector';
import { whenReady } from '../core/gpuUtil.js';
import { S } from '../core/settings.js';
const RES = 128, SIZE = 16;

/** Small asynchronous readback of GPU displacement for feet/camera grounding. */
export class GroundProbe {
    constructor(scene, terrain) {
        this.terrain = terrain;
        this.origin = new Vector2();
        this.epoch = 0;
        this.lastRead = -Infinity;
        this.texture = new ProceduralTexture('groundProbe', RES, 'groundProbe', scene, {
            generateMipMaps: false, type: Constants.TEXTURETYPE_FLOAT,
            format: Constants.TEXTUREFORMAT_RGBA, shaderLanguage: ShaderLanguage.WGSL,
            skipSceneRegistration: true,
        });
        this.texture.refreshRate = 0;
        this.texture.setTexture('surfaceMap', terrain.heightfield.surfaceMap);
        this.texture.setVector2('surfaceOrigin', terrain.heightfield.origin);
        this.texture.setVector2('surfaceExtent', terrain.heightfield.extent);
        this.bind({ x: -65, z: 604 });
    }
    /**
     * Bind current terrain/deformation textures and snap the local 16 m probe to its sampling grid.
     */
    bind(focus) {
        const t = this.terrain, p = this.texture;
        this.origin.set(Math.floor(focus.x * 8) / 8 - SIZE / 2, Math.floor(focus.z * 8) / 8 - SIZE / 2);
        p.setTexture('deformTex', t.deform.texture);
        p.setVector2('deformCenter', t.deform.center);
        p.setVector2('patchCenter', t.local.focus);
        p.setFloat('deformSize', t.deform.size);
        p.setFloat('deformDepthScale', S.deformDepth);
        p.setVector2('probeOrigin', this.origin);
        p.setFloat('probeSize', SIZE);
    }
    /**
     * Wait for the probe shader to become ready before the interactive frame loop uses it.
     */
    async warmUp() { await whenReady(this.texture, 'grounding probe'); }
    /**
     * Schedule a throttled local probe render when detailed terrain is available; do not block on readback here.
     */
    update(focus) {
        if (!this.terrain.local.triangleCount) { this.cache = null; return; }
        if (this.pending || performance.now() - this.lastRead < 100) return;
        this.bind(focus);
        this.texture.render();
        this.readyToRead = true;
    }
    /**
     * Read the rendered probe asynchronously after submission. An epoch rejects results from before a teleport/reset.
     */
    afterFrame() {
        if (!this.readyToRead || this.pending) return;
        this.readyToRead = false;
        this.pending = true;
        this.lastRead = performance.now();
        const x = this.origin.x, z = this.origin.y, epoch = this.epoch;
        this.texture.readPixels().then(raw => {
            if (epoch !== this.epoch || !raw) return;
            this.cache = { data: raw, stride: raw.length / (RES * RES), x, z };
        }).catch(error => { this.error = String(error); }).finally(() => { this.pending = false; });
    }
    /**
     * Return cached displacement, not absolute terrain elevation. Missing/outside samples return zero; the exact biome mask prevents displacement on firm ground.
     */
    heightAt(x, z) {
        const c = this.cache;
        if (!c) return 0;
        const fx = (x - c.x) / SIZE * RES - 0.5, fz = (z - c.z) / SIZE * RES - 0.5;
        if (fx < 0 || fz < 0 || fx >= RES - 1 || fz >= RES - 1) return 0;
        const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
        const i = (iz * RES + ix) * c.stride, row = RES * c.stride;
        // Use the exact source-triangle colour mask, as the geometry does.
        // The simulation's coarse map is only an approximation at biome edges.
        const weights = this.terrain.heightfield.weightsAt(x, z);
        return ((c.data[i] * (1 - tx) + c.data[i + c.stride] * tx) * (1 - tz)
            + (c.data[i + row] * (1 - tx) + c.data[i + row + c.stride] * tx) * tz)
            * (weights[0] + weights[1]);
    }
    /**
     * Invalidate cached samples and outstanding readback results so a teleport cannot reuse old ground offsets.
     */
    reset() { this.epoch++; this.cache = null; this.lastRead = -Infinity; this.readyToRead = false; }
    /** Release the probe texture after invalidating pending readbacks when the owning system is torn down. */
    dispose() { this.reset(); this.texture.dispose(); }
}
