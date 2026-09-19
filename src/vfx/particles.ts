/**
 * Snow spray РІР‚вЂќ a pooled, CPU-simulated, GPU-billboarded particle system.
 *
 * One system serves every source of airborne snow in the demo: footfalls now,
 * the snow-surf plume and the spell spray later. That is deliberate. A separate
 * emitter per effect means separate pipelines, separate warm-up, separate
 * sorting, and nine slightly different ideas about what lit snow powder looks
 * like. There is one pipeline here and one lighting model.
 *
 * Simulation is on the CPU because the particle count is small (a footfall is
 * eighteen grains) and the alternative РІР‚вЂќ a compute pass plus indirect draw РІР‚вЂќ
 * costs more in dispatch overhead than the whole simulation costs to run. What
 * *is* on the GPU is the expansion: the mesh is a static grid of quads whose
 * only vertex attribute is a particle index and a corner, and the vertex shader
 * fetches the particle's state out of a small data texture. So the CPU writes
 * eight floats per live particle per frame and nothing else crosses the bus.
 *
 * Allocation: none per frame. Everything is a typed array sized at construction,
 * and dead particles are recycled through a free ring rather than compacted.
 * @module vfx/particles
 */

import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Vector3, Vector4 } from "@babylonjs/core/Maths/math";

import { S } from "../core/settings.ts";
import { bindDesertAppearance, DESERT_EFFECT_UNIFORMS } from '../terrain/desertAppearance.ts';
import { whenReady, bindMatrixArray } from "../core/gpuUtil.ts";
import { CASCADE_COUNT } from "../render/shadows.ts";
import { SPELL_LIGHT_UNIFORMS } from "../spells/spellLights.ts";
import type { Scene } from "@babylonjs/core/scene";
import type { Terrain } from "../terrain/terrain.ts";
import type { Sky } from "../render/sky.ts";
import type { ShadowSystem } from "../render/shadows.ts";

/**
 * Pool size. A hard cap, not a target РІР‚вЂќ an emission is simply dropped when it is
 * exhausted.
 *
 * Sized for the surf plume, which is the heaviest consumer by an order of
 * magnitude and which needs sheer count more than it needs anything else: at
 * 1200 live grains the plume renders as a field of separated soft discs РІР‚вЂќ legible
 * as bokeh, not as snow РІР‚вЂќ and the only thing that turns that into a continuous
 * mass is enough of them to overlap. 75 a metre at 19.5 m/s across two
 * populations lands near 3500 live, and the footfall kick and the spells still
 * have to fit alongside.
 *
 * The cost of the headroom is one pass over the array per frame РІР‚вЂќ 5120 iterations
 * of a dozen flops, which does not register РІР‚вЂќ plus 160 KB of data texture.
 */
const CAPACITY = 5120;

/** Terminal fall speed of a snow grain, m/s. Drag is tuned to land here. */
const TERMINAL = 1.9;

const _right = new Vector3();
const _up = new Vector3();
const _splits = new Vector4();

/** Recycle a fixed particle pool for terrain, spell and water effects without per-emitter meshes. */
export class SprayField {
    readonly scene: Scene;
    readonly terrain: Terrain;
    readonly sky: Sky;
    readonly shadows: ShadowSystem;
    readonly pos = new Float32Array(CAPACITY * 3);
    readonly vel = new Float32Array(CAPACITY * 3);
    readonly age = new Float32Array(CAPACITY);
    readonly life = new Float32Array(CAPACITY);
    readonly size = new Float32Array(CAPACITY);
    readonly seed = new Float32Array(CAPACITY);
    /** 0 = powder puff, 1 = heavy clod. Drives edge hardness and opacity. */
    readonly kind = new Float32Array(CAPACITY);
    readonly sand = new Float32Array(CAPACITY);
    readonly drag = new Float32Array(CAPACITY);
    private _next = 0;
    liveCount = 0;
    private readonly _texData = new Float32Array(CAPACITY * 2 * 4);
    readonly dataTex: RawTexture;
    readonly mesh: Mesh;
    readonly material: ShaderMaterial;
    private readonly _camPos = new Vector3();
    private _t = 0;

    constructor(scene: Scene, terrain: Terrain, sky: Sky, shadows: ShadowSystem) {
        this.scene = scene;
        this.terrain = terrain;
        this.sky = sky;
        this.shadows = shadows;
        /**
         * Linear drag coefficient, 1/s. Separate from `kind` on purpose.
         *
         * A plume has to look like powder РІР‚вЂќ soft-edged, translucent, puffy РІР‚вЂќ
         * and fly like a stone, because it is a mass of snow launched off a
         * wave at eight metres a second rather than a grain drifting down. With
         * drag welded to appearance, asking for the look costs 5.2/s of drag,
         * which stops the grain dead in 120 ms and inside the wave that threw
         * it.
         */
        // Texture rows: 0 = (x, y, z, size), 1 = (age01, seed, kind, alpha).
        this.dataTex = RawTexture.CreateRGBATexture(
            this._texData, CAPACITY, 2, scene,
            false, false,
            Constants.TEXTURE_NEAREST_SAMPLINGMODE,
            Constants.TEXTURETYPE_FLOAT
        );
        this.dataTex.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE;
        this.dataTex.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;

        this.mesh = buildQuadMesh(scene);
        this.material = this._makeMaterial();
        this.mesh.material = this.material;
        // After the opaque pass: these are alpha-blended and write no depth.
        this.mesh.renderingGroupId = 2;

    }

    /** Clear live particles and hide the shared mesh after a teleport without reallocating the pool. */
    reset(): void {
        this.life.fill(0);
        this.liveCount = this._next = 0;
        this.mesh.isVisible = false;
    }

    private _makeMaterial(): ShaderMaterial {
        const mat = new ShaderMaterial(
            "spray", this.scene, { vertex: "spray", fragment: "spray" },
            {
                attributes: ["position"],
                uniforms: [
                    "viewProjection", "cameraPos", "camRight", "camUp",
                    "sunDir", "sunRadiance", "shR",
                    "cascadeMatrices", "cascadeSplits", "cascadeParams",
                    "shadowTexel", "shadowSoftness", "shadowBias",
                    "fogDensity", "fogHeightFalloff", "fogStart", "aerialStrength",
                    "ambientIntensity",
                    ...DESERT_EFFECT_UNIFORMS,
                    ...SPELL_LIGHT_UNIFORMS,
                ],
                samplers: ["sprayTex", "skyLUT", "cascade0", "cascade1", "cascade2", 'desertBaseTex'],
                shaderLanguage: ShaderLanguage.WGSL,
                needAlphaBlending: true,
            }
        );
        mat.backFaceCulling = false;
        bindDesertAppearance(mat,this.terrain);
        mat.disableDepthWrite = true;
        mat.alphaMode = Constants.ALPHA_COMBINE;
        // ShaderMaterial decides blending from `alpha` and its option flag; this
        // makes it unambiguous whichever version is underneath.
        mat.needAlphaBlending = () => true;
        mat.setTexture("sprayTex", this.dataTex);
        mat.setTexture("skyLUT", this.sky.lut);
        for (let i = 0; i < CASCADE_COUNT; i++) {
            mat.setTexture("cascade" + i, this.shadows.maps[i]);
        }
        return mat;
    }

    /**
     * Emit one grain. Everything is world space.
     *
     *
     * @param x - World X.
     * @param y - World Y.
     * @param z - World Z.
     *
     * @param vx - Initial velocity X.
     * @param vy - Initial velocity Y.
     * @param vz - Initial velocity Z.
     *
     * @param size - Radius in metres.
     *
     * @param life - Lifetime in seconds.
     *
     * @param kind - 0 powder, 1 clod, 4 water droplet, 5 water mist.
     *
     * @param drag - Linear drag in 1/s. Defaults to the fall-in-place value for a
     *   grain of settling powder; pass something near 1 for anything thrown.
     */
    emit(
        x: number, y: number, z: number,
        vx: number, vy: number, vz: number,
        size: number, life: number, kind: number, drag?: number,
    ): void {
        // Find a free slot. Bounded scan: after CAPACITY tries the pool is full
        // and the emission is simply dropped, which at these counts never
        // happens and is the right failure anyway РІР‚вЂќ a hitch is worse than a
        // missing grain.
        let i = this._next;
        for (let n = 0; n < CAPACITY; n++) {
            if (this.age[i] >= this.life[i]) break;
            i = (i + 1) % CAPACITY;
            if (n === CAPACITY - 1) return;
        }
        this._next = (i + 1) % CAPACITY;

        const o = i * 3;
        this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z;
        this.vel[o] = vx; this.vel[o + 1] = vy; this.vel[o + 2] = vz;
        this.age[i] = 0;
        this.life[i] = life;
        this.size[i] = size;
        this.kind[i] = kind;
        const weights = this.terrain.deform.surfaceWeightsAt?.(x, z);
        this.sand[i] = kind < 4 && this.terrain.exalted && weights && weights[1] > 0.5 ? 1 : 0;
        if (this.sand[i] > 0.5) { this.size[i] *= 0.7; this.life[i] *= 0.8; }
        this.drag[i] = drag === undefined ? (kind > 0.5 ? 1.1 : 5.2) : drag;
        this.seed[i] = (i * 0.618033 + x * 0.137 + z * 0.311) % 1;
    }

    /**
     * Advance and upload.
     * @param dt - Simulation seconds.
     * @param cameraPos - Active camera position.
     */
    update(dt: number, cameraPos: Vector3): void {
        this._t += dt;
        this._camPos.copyFrom(cameraPos);

        const h = Math.min(dt, 1 / 30);
        const wa = (S.windDirection * Math.PI) / 180;
        const wx = Math.sin(wa) * 2.4 * S.windStrength;
        const wz = Math.cos(wa) * 2.4 * S.windStrength;

        const d = this._texData;
        let live = 0;

        for (let i = 0; i < CAPACITY; i++) {
            const o = i * 3;
            const to = i * 4;
            const t1 = (CAPACITY + i) * 4;

            if (this.age[i] >= this.life[i]) {
                // A dead slot still has to be written, or the last frame's
                // corpse keeps rendering. Zero size collapses the quad.
                d[to + 3] = 0;
                d[t1 + 3] = 0;
                continue;
            }

            this.age[i] += h;
            const a01 = this.age[i] / this.life[i];

            // Drag toward the wind horizontally and toward terminal vertically.
            // A settling grain reaches equilibrium almost at once; anything
            // thrown hard carries its arc. See the note on `drag` above.
            const k = this.drag[i];
            const vy = this.vel[o + 1];
            this.vel[o] += (wx - this.vel[o]) * Math.min(1, k * h);
            this.vel[o + 2] += (wz - this.vel[o + 2]) * Math.min(1, k * h);
            this.vel[o + 1] = vy + (this.kind[i]===5 ? -.6-k*vy : -9.81-k*(vy+TERMINAL)) * h;

            this.pos[o] += this.vel[o] * h;
            this.pos[o + 1] += this.vel[o + 1] * h;
            this.pos[o + 2] += this.vel[o + 2] * h;

            // Settle on the snow instead of falling through it. The grain does
            // not bounce РІР‚вЂќ it is snow landing on snow РІР‚вЂќ it just stops and fades.
            const water=this.kind[i]>=4 ? this.terrain.water?.sample(this.pos[o],this.pos[o+2]) : null;
            const g = Math.max(this.terrain.heightAt(this.pos[o], this.pos[o + 2]),water?.level??-Infinity);
            if (this.pos[o + 1] < g) {
                this.pos[o + 1] = g;
                this.vel[o] *= 0.2; this.vel[o + 1] = 0; this.vel[o + 2] *= 0.2;
                // Kill it faster once it is down.
                this.age[i] += h * 2.5;
            }

            // Puffs expand as they disperse; clods do not.
            const grow = this.kind[i]===5 ? 1+a01*2 : this.kind[i] > 0.5 ? 1.0 : 1.0 + a01 * 1.3;
            // Fade in fast, out slowly.
            const alpha =
                Math.min(1, a01 * 8) * (1 - a01) * (1 - a01);

            d[to] = this.pos[o];
            d[to + 1] = this.pos[o + 1];
            d[to + 2] = this.pos[o + 2];
            d[to + 3] = this.size[i] * grow;
            d[t1] = a01;
            d[t1 + 1] = this.seed[i];
            d[t1 + 2] = this.kind[i] + this.sand[i] * 2;
            d[t1 + 3] = alpha;
            live++;
        }

        this.liveCount = live;
        this.dataTex.update(d);
        this._pushUniforms();
    }

    private _pushUniforms(): void {
        const m = this.material;
        m.setFloat('useDesertTextures',this.terrain.exalted && this.terrain.useDesertTextures ? 1 : 0);
        const sky = this.sky;
        const sh = this.shadows;
        const cam = this.scene.activeCamera;
        if (!cam) return;

        // Billboard basis, straight off the view matrix.
        const v = cam.getViewMatrix();
        _right.set(v.m[0], v.m[4], v.m[8]);
        _up.set(v.m[1], v.m[5], v.m[9]);

        m.setVector3("cameraPos", this._camPos);
        m.setVector3("camRight", _right);
        m.setVector3("camUp", _up);
        m.setVector3("sunDir", sky.sunDir);
        m.setColor3("sunRadiance", sky.sunRadiance);
        m.setArray4("shR", sky.sh as unknown as number[]);

        bindMatrixArray(m, "cascadeMatrices", sh.matrixData);
        _splits.set(sh.splits[0], sh.splits[1], sh.splits[2], sh.splits[3]);
        m.setVector4("cascadeSplits", _splits);
        m.setArray4("cascadeParams", sh.paramData as unknown as number[]);
        m.setFloat("shadowTexel", sh.texelSize);
        m.setFloat("shadowSoftness", 1.6);
        m.setFloat("shadowBias", 0.05);

        m.setFloat("fogDensity", S.fogDensity);
        m.setFloat("fogHeightFalloff", S.fogHeightFalloff);
        m.setFloat("fogStart", S.fogStart);
        m.setFloat("aerialStrength", S.aerialStrength);
        m.setFloat("ambientIntensity", S.ambientIntensity);
    }

    /** Wait for the shared particle material pipeline before interactive emission starts. */
    async warmUp(): Promise<void> {
        await whenReady(this.material, "spray material", [this.mesh, false]);
    }

    /** Release the particle mesh, material and packed data texture when the owning system is torn down. */
    dispose(): void {
        this.mesh.dispose();
        this.material.dispose();
        this.dataTex.dispose();
    }
}

/**
 * A static grid of quads. `position` is `(particleIndex, cornerX, cornerY)` and
 * carries no geometry at all РІР‚вЂќ the vertex shader places every corner.
 */
function buildQuadMesh(scene: Scene): Mesh {
    const pos = new Float32Array(CAPACITY * 4 * 3);
    const idx = new Uint32Array(CAPACITY * 6);
    const CORNERS = [-1, -1, 1, -1, 1, 1, -1, 1];

    for (let i = 0; i < CAPACITY; i++) {
        for (let c = 0; c < 4; c++) {
            const o = (i * 4 + c) * 3;
            pos[o] = i;
            pos[o + 1] = CORNERS[c * 2];
            pos[o + 2] = CORNERS[c * 2 + 1];
        }
        const b = i * 4;
        const q = i * 6;
        idx[q] = b; idx[q + 1] = b + 1; idx[q + 2] = b + 2;
        idx[q + 3] = b; idx[q + 4] = b + 2; idx[q + 5] = b + 3;
    }

    const mesh = new Mesh("spray", scene);
    const vd = new VertexData();
    vd.positions = pos;
    vd.indices = idx;
    vd.applyToMesh(mesh, false);
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
    mesh.doNotSyncBoundingInfo = true;
    mesh.metadata = { triangles: CAPACITY * 2, vertices: CAPACITY * 4 };
    return mesh;
}

export { CAPACITY as SPRAY_CAPACITY };
