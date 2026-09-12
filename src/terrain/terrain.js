/**
 * Terrain system: owns the heightfield, the clipmap mesh, the snow material,
 * the shadow-pass materials and the generated detail map.
 *
 * The procedural clipmap has fixed geometry. Exalted replaces nearby soft
 * triangles with a reusable detail mesh, updating its patch every eight metres.
 */

import { Vector2, Vector3, Vector4 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { ProceduralTexture } from "@babylonjs/core/Materials/Textures/Procedurals/proceduralTexture";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { ExaltedWorld } from "./exaltedWorld.js";
import { LocalTerrain } from './localTerrain.js';
import { GroundProbe } from './groundProbe.js';

import { Heightfield, WORLD_SIZE } from "./heightfield.js";
import { DeformationField } from "./deformation.js";
import {
    buildClipmapMesh,
    BASE_SPACING,
    GRID_HALF_N,
    OUTER_EXTENT,
} from "./clipmapMesh.js";
import { S } from "../core/settings.js";
import { CASCADE_COUNT } from "../render/shadows.js";
import { SPELL_LIGHT_UNIFORMS } from "../spells/spellLights.js";
import { bakeOnce, whenReady, bindMatrixArray } from "../core/gpuUtil.js";

const DETAIL_RES = 1024;

const _splits = new Vector4(0, 0, 0, 0);
const _lod = new Vector2();
const _screen = new Vector2();

const DEBUG_MODES = {
    beauty: 0, deform: 1, normals: 2, depth: 3, cascades: 4,
    footprint: 5, fineNormals: 6, shadow: 7, ndotl: 8, shadowMap: 9,
    albedo: 10,
};

export class Terrain {
    /**
     * @param {import("@babylonjs/core/scene").Scene} scene
     * @param {import("../render/sky.js").Sky} sky
     * @param {import("../render/shadows.js").ShadowSystem} shadows
     */
    constructor(scene, sky, shadows, { exalted = false } = {}) {
        this.scene = scene;
        this.sky = sky;
        this.shadows = shadows;

        this.exalted = exalted;
        this.heightfield = exalted ? new ExaltedWorld(scene) : new Heightfield(scene);

        /** The terrain state buffer. Feet, the surf wake and every spell write here. */
        this.deform = new DeformationField(scene);

        // Generated snow grain, tiled at three world scales by the material.
        this.detailTex = new ProceduralTexture(
            "detailTex",
            { width: DETAIL_RES, height: DETAIL_RES },
            "detailBake",
            scene,
            {
                generateMipMaps: true,
                type: Constants.TEXTURETYPE_UNSIGNED_BYTE,
                format: Constants.TEXTUREFORMAT_RGBA,
                samplingMode: Constants.TEXTURE_TRILINEAR_SAMPLINGMODE,
                shaderLanguage: ShaderLanguage.WGSL,
                skipSceneRegistration: true,
            }
        );
        this.detailTex.wrapU = Constants.TEXTURE_WRAP_ADDRESSMODE;
        this.detailTex.wrapV = Constants.TEXTURE_WRAP_ADDRESSMODE;
        this.detailTex.refreshRate = 0;

        this.mesh = exalted ? new Mesh("exaltedTerrain", scene) : buildClipmapMesh(scene);

        this.material = this._makeSnowMaterial();
        this.materials = [this.material];
        this.mesh.material = this.material;

        // One depth material per cascade, so each can carry its own matrix
        // without any mid-frame uniform-buffer swapping.
        shadows.registerCaster(this.mesh, (c) => this._makeDepthMaterial(c));

        this.setDeformTexture(this.deform.texture);
    }

    _makeSnowMaterial(local = false) {
        const mat = new ShaderMaterial(
            "snow",
            this.scene,
            { vertex: this.exalted ? "exalted" : "snow", fragment: "snow" },
            {
                attributes: this.exalted && !local ? ["position", "normal", "color"] : ["position"],
                defines: this.exalted ? ["EXALTED_TERRAIN", ...(local ? ['LOCAL_DETAIL'] : [])] : [],
                uniforms: [
                    "viewProjection", "cameraPos", "lodCenter", "patchCenter",
                    "baseSpacing", "gridHalfN",
                    "worldOrigin", "worldSize", "heightRes",
                    "windAngle", "macroAmp", "sastrugiAmp",
                    "sunDir", "sunRadiance",
                    "shR",
                    "cascadeMatrices", "cascadeSplits", "cascadeParams",
                    "shadowTexel", "shadowSoftness", "shadowBias",
                    "detailStrength", "glintIntensity", "glintGrazing",
                    "sssStrength", "sssRadius",
                    "fogDensity", "fogHeightFalloff", "fogStart", "aerialStrength",
                    "deformCenter", "deformSize", "deformTexel", "deformDepthScale",
                    "ambientIntensity", "debugMode", "screenSize",
                    ...SPELL_LIGHT_UNIFORMS,
                ],
                samplers: [
                    "heightTex", "auxTex", "detailTex", "skyLUT", "patchTex",
                    "cascade0", "cascade1", "cascade2", "deformTex",
                ],
                shaderLanguage: ShaderLanguage.WGSL,
            }
        );

        mat.backFaceCulling = true;
        mat.setTexture("heightTex", this.heightfield.heightTex);
        mat.setTexture("auxTex", this.heightfield.auxTex);
        mat.setTexture("detailTex", this.detailTex);
        mat.setTexture("skyLUT", this.sky.lut);
        for (let i = 0; i < CASCADE_COUNT; i++) {
            mat.setTexture("cascade" + i, this.shadows.maps[i]);
        }
        return mat;
    }

    /**
     * The camera-space depth prepass material.
     *
     * Same clipmap and deformation code as the beauty pass through the same
     * includes; only the fragment stage differs. Registered with the prepass
     * rather than with the shadow system, so it takes `viewProjection` — which
     * Babylon binds from the active camera, and which by then carries this
     * frame's temporal jitter.
     */
    makePrepassMaterial(local = false) {
        const mat = new ShaderMaterial(
            "terrainPrepass",
            this.scene,
            { vertex: this.exalted ? "exaltedPrepass" : "terrainPrepass", fragment: "prepass" },
            {
                attributes: ["position"],
                defines: local ? ['LOCAL_DETAIL'] : [],
                uniforms: [
                    "viewProjection", "cameraPos", "lodCenter", "patchCenter",
                    "baseSpacing", "gridHalfN",
                    "worldOrigin", "worldSize", "heightRes",
                    "windAngle", "sastrugiAmp",
                    "deformCenter", "deformSize", "deformDepthScale",
                ],
                samplers: ["heightTex", "auxTex", "deformTex", "patchTex"],
                shaderLanguage: ShaderLanguage.WGSL,
            }
        );
        mat.backFaceCulling = false;
        mat.setTexture("heightTex", this.heightfield.heightTex);
        mat.setTexture("auxTex", this.heightfield.auxTex);
        if (local) { this.localPrepassMat = mat; mat.setTexture('patchTex', this.local.texture); }
        else this.prepassMat = mat;
        return mat;
    }

    _makeDepthMaterial(cascade, local = false) {
        const mat = new ShaderMaterial(
            "terrainDepth" + cascade,
            this.scene,
            { vertex: this.exalted ? "exaltedDepth" : "terrainDepth", fragment: "terrainDepth" },
            {
                attributes: ["position"],
                uniforms: [
                    "lightViewProjection", "cameraPos", "lodCenter", "patchCenter",
                    "baseSpacing", "gridHalfN",
                    "worldOrigin", "worldSize", "heightRes",
                    "windAngle", "sastrugiAmp",
                    "deformCenter", "deformSize", "deformDepthScale",
                ],
                samplers: ["heightTex", "auxTex", "deformTex", "patchTex"],
                shaderLanguage: ShaderLanguage.WGSL,
                // Forces a distinct Effect per cascade, so each can carry its
                // own light matrix without mid-frame uniform swapping.
                defines: ["SNOW_CASCADE " + cascade, ...(local ? ['LOCAL_DETAIL'] : [])],
            }
        );
        mat.backFaceCulling = false;
        mat.setTexture("heightTex", this.heightfield.heightTex);
        mat.setTexture("auxTex", this.heightfield.auxTex);
        if (!this._depthMats) this._depthMats = [];
        this._depthMats.push(mat);
        if (local) mat.setTexture('patchTex', this.local.texture);
        return mat;
    }

    async build() {
        this.detailTex.setFloat("resolution", DETAIL_RES);
        // Tilts a grain dome's flank to roughly 30 degrees. Higher reads as
        // gravel, lower stops registering at all.
        this.detailTex.setFloat("grainScale", 0.013);
        await bakeOnce(this.detailTex, "detailBake");

        if (this.exalted) await this.heightfield.loadInto(this.mesh);
        else await this.heightfield.bake();
        if (this.exalted) {
            this.local = new LocalTerrain(this.scene, this.heightfield, this.mesh);
            this.localMaterial = this._makeSnowMaterial(true);
            this.localMaterial.setTexture('patchTex', this.local.texture);
            this.local.mesh.material = this.localMaterial;
            this.materials.push(this.localMaterial);
            this.local.update({ x: -65, z: 604 });
            this.shadows.registerCaster(this.local.mesh, c => this._makeDepthMaterial(c, true));
            this.deform.surfaceWeightsAt = (x, z) => this.heightfield.weightsAt(x, z);
            this.deform.setSurfaceMap(this.heightfield.surfaceMap, this.heightfield.origin, this.heightfield.extent);
            this.groundProbe = new GroundProbe(this.scene, this);
        }

        // The cascade fitter needs the world's vertical extent to size each
        // light volume's depth range. A margin covers carved berms and anything
        // standing on the snow.
        this.shadows.setHeightBounds(
            this.heightfield.minHeight - 4,
            this.heightfield.maxHeight + 6
        );
    }

    /**
     * Force every terrain pipeline to compile. Called behind the loading screen
     * so the first rendered frame never pays a compile.
     */
    async warmUp() {
        // Before the snow material, because its first compile binds whatever is
        // in the deformation target and reading uninitialised VRAM as a height
        // can put NaN into a vertex position.
        await this.deform.warmUp();
        this.setDeformTexture(this.deform.texture);

        await whenReady(this.material, "snow material", [this.mesh, false]);
        if (this.local) {
            await whenReady(this.localMaterial, 'local terrain', [this.local.mesh, false]);
            await this.groundProbe.warmUp();
        }
        if (this.prepassMat) {
            await whenReady(this.prepassMat, "terrain prepass", [this.mesh, false]);
        }
        if (this._depthMats) {
            for (let i = 0; i < this._depthMats.length; i++) {
                await whenReady(this._depthMats[i], "terrainDepth" + i, [i >= 3 && this.local ? this.local.mesh : this.mesh, false]);
            }
        }
    }

    /**
     * Point every terrain pipeline at a deformation target. Called once per
     * ping-pong flip, so all four materials always read the same frame's state.
     * @param {import("@babylonjs/core/Materials/Textures/texture").Texture} tex
     */
    setDeformTexture(tex) {
        this._boundDeform = tex;
        this.material.setTexture("deformTex", tex);
        this.localMaterial?.setTexture('deformTex', tex);
        this.localPrepassMat?.setTexture('deformTex', tex);
        if (this._depthMats) {
            for (let i = 0; i < this._depthMats.length; i++) {
                this._depthMats[i].setTexture("deformTex", tex);
            }
        }
        if (this.prepassMat) this.prepassMat.setTexture("deformTex", tex);
    }

    /**
     * Advance the terrain state buffer and push this frame's uniforms.
     *
     * The deformation window follows the *player*, not the camera: the camera can
     * be swung right around and the marks the player left have to stay where they
     * were put.
     *
     * @param {Vector3} cameraPos
     * @param {{x:number, z:number}} focus world position the deform window centres on
     * @param {number} dt seconds
     */
    update(cameraPos, focus, dt) {
        const hf = this.heightfield;
        const windAngle = (S.windDirection * Math.PI) / 180;
        if (this.local) {
            this.local.update(focus);
            this.local.mesh.isVisible = S.showTerrain && this.local.triangleCount > 0;
        }

        // Simulate first, then bind: the material must sample the target that
        // was written this frame, not the one from last frame, or every mark
        // lands a frame late and fast movement leaves a visible stagger.
        const deformTex = this.deform.update(dt, focus);
        if (deformTex !== this._boundDeform) {
            this.setDeformTexture(deformTex);
        }
        const deformCenter = this.deform.center;
        const deformSize = this.deform.size;

        // Clipmap rings follow the player, not the viewer — see the note on
        // `lodCenter` in snow.vertex.wgsl. No extra snapping here;
        // `placeClipmapVertex` snaps per ring already.
        _lod.set(focus.x, focus.z);

        for (const m of this.materials) {
        if (this.local) m.setVector2('patchCenter', this.local.focus);
        m.setVector3("cameraPos", cameraPos);
        m.setVector2("lodCenter", _lod);
        m.setFloat("baseSpacing", BASE_SPACING);
        m.setFloat("gridHalfN", GRID_HALF_N);
        m.setVector2("worldOrigin", hf.origin);
        m.setFloat("worldSize", hf.size);
        m.setFloat("heightRes", 4096);
        m.setFloat("windAngle", windAngle);
        m.setFloat("macroAmp", S.macroHeightScale);
        m.setFloat("sastrugiAmp", S.sastrugiStrength);

        m.setVector3("sunDir", this.sky.sunDir);
        m.setColor3("sunRadiance", this.sky.sunRadiance);
        m.setArray4("shR", this.sky.sh);

        bindMatrixArray(m, "cascadeMatrices", this.shadows.matrixData);
        _splits.set(
            this.shadows.splits[0], this.shadows.splits[1],
            this.shadows.splits[2], this.shadows.splits[3]
        );
        m.setVector4("cascadeSplits", _splits);
        m.setArray4("cascadeParams", this.shadows.paramData);
        m.setFloat("shadowTexel", this.shadows.texelSize);
        m.setFloat("shadowSoftness", 1.8);
        // Metres. Snow has no thin geometry to peter-pan, so this can stay
        // small and keep contact shadows attached.
        m.setFloat("shadowBias", 0.022);

        m.setFloat("detailStrength", S.detailNormalStrength);
        m.setFloat("glintIntensity", S.glintIntensity);
        m.setFloat("glintGrazing", S.glintGrazing);
        m.setFloat("sssStrength", S.sssStrength);
        m.setFloat("sssRadius", S.sssRadius);

        m.setFloat("fogDensity", S.fogDensity);
        m.setFloat("fogHeightFalloff", S.fogHeightFalloff);
        m.setFloat("fogStart", S.fogStart);
        m.setFloat("aerialStrength", S.aerialStrength);
        m.setFloat("ambientIntensity", S.ambientIntensity);

        m.setVector2("deformCenter", deformCenter);
        m.setFloat("deformSize", deformSize);
        m.setFloat("deformTexel", this.deform.texel);
        m.setFloat("deformDepthScale", S.deformDepth);

        m.setFloat("debugMode", DEBUG_MODES[S.debugView] ?? 0);
        _screen.set(
            this.scene.getEngine().getRenderWidth(),
            this.scene.getEngine().getRenderHeight()
        );
        m.setVector2("screenSize", _screen);
        m.wireframe = S.wireframe;
        }

        // ---- depth prepass ----------------------------------------------
        // Same clipmap parameters as everything else, for the same reason.
        for (const pm of [this.prepassMat, this.localPrepassMat]) {
        if (pm) {
            if (this.local) pm.setVector2('patchCenter', this.local.focus);
            pm.setVector3("cameraPos", cameraPos);
            pm.setVector2("lodCenter", _lod);
            pm.setFloat("baseSpacing", BASE_SPACING);
            pm.setFloat("gridHalfN", GRID_HALF_N);
            pm.setVector2("worldOrigin", hf.origin);
            pm.setFloat("worldSize", hf.size);
            pm.setFloat("heightRes", 4096);
            pm.setFloat("windAngle", windAngle);
            pm.setFloat("sastrugiAmp", S.sastrugiStrength);
            pm.setVector2("deformCenter", deformCenter);
            pm.setFloat("deformSize", deformSize);
            pm.setFloat("deformDepthScale", S.deformDepth);
        }
        }

        // ---- shadow-pass materials --------------------------------------
        // These must see the identical clipmap parameters, or the depth pass
        // would place vertices somewhere the beauty pass does not.
        const dm = this._depthMats;
        if (dm) {
            for (let i = 0; i < dm.length; i++) {
                const d = dm[i];
                if (this.local) d.setVector2('patchCenter', this.local.focus);
                d.setVector3("cameraPos", cameraPos);
                d.setVector2("lodCenter", _lod);
                d.setFloat("baseSpacing", BASE_SPACING);
                d.setFloat("gridHalfN", GRID_HALF_N);
                d.setVector2("worldOrigin", hf.origin);
                d.setFloat("worldSize", hf.size);
                d.setFloat("heightRes", 4096);
                d.setFloat("windAngle", windAngle);
                d.setFloat("sastrugiAmp", S.sastrugiStrength);
                d.setVector2("deformCenter", deformCenter);
                d.setFloat("deformSize", deformSize);
                d.setFloat("deformDepthScale", S.deformDepth);
            }
        }
        this.groundProbe?.update(focus);
    }

    registerPrepass(pass) {
        pass.registerCaster(this.mesh, this.makePrepassMaterial());
        if (this.local) pass.registerCaster(this.local.mesh, this.makePrepassMaterial(true));
    }

    /** @param {number} x @param {number} z */
    heightAt(x, z) {
        return this.heightfield.heightAt(x, z) + (this.groundProbe?.heightAt(x, z) || 0);
    }

    /** @param {number} x @param {number} z @param {Vector3} out */
    normalAt(x, z, out) {
        this.heightfield.normalAt(x, z, out);
        if (this.groundProbe) {
            const e = 0.125, g = this.groundProbe;
            const gx = -out.x / Math.max(out.y, 0.001) + (g.heightAt(x + e, z) - g.heightAt(x - e, z)) / (2 * e);
            const gz = -out.z / Math.max(out.y, 0.001) + (g.heightAt(x, z + e) - g.heightAt(x, z - e)) / (2 * e);
            out.set(-gx, 1, -gz).normalize();
        }
        return out;
    }

    dispose() {
        this.local?.dispose();
        this.groundProbe?.dispose();
        this.localMaterial?.dispose();
        this.mesh.dispose();
        this.material.dispose();
        this.detailTex.dispose();
        this.deform.dispose();
        this.heightfield.dispose();
    }
}
