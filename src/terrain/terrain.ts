/**
 * Terrain system: owns the heightfield, the clipmap mesh, the snow material,
 * the shadow-pass materials and the generated detail map.
 *
 * The procedural clipmap has fixed geometry. Exalted replaces nearby soft
 * triangles with a reusable detail mesh, updating its patch every eight metres.
 * @module terrain/terrain
 */

import { Vector2, Vector3, Vector4 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { ProceduralTexture } from "@babylonjs/core/Materials/Textures/Procedurals/proceduralTexture";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from '@babylonjs/core/scene';
import { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { ExaltedWorld } from "./exaltedWorld.ts";
import { LocalTerrain } from './localTerrain.ts';
import { GroundProbe } from './groundProbe.ts';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { fitPlanarUV } from './planarUV.ts';
import type { PropCollisions } from '../world/propCollisions.ts';
import type { WorldWater } from '../world/worldWater.ts';

import { Heightfield } from "./heightfield.ts";
import { DeformationField } from "./deformation.ts";
import {
    buildClipmapMesh,
    BASE_SPACING,
    GRID_HALF_N,
    OUTER_EXTENT,
} from "./clipmapMesh.ts";
import { S } from "../core/settings.ts";
import { CASCADE_COUNT } from "../render/shadows.ts";
import { SPELL_LIGHT_UNIFORMS } from "../spells/spellLights.ts";
import { bakeOnce, whenReady, bindMatrixArray } from "../core/gpuUtil.ts";

const DETAIL_RES = 1024;

const _splits = new Vector4(0, 0, 0, 0);
const _lod = new Vector2();
const _screen = new Vector2();

const DEBUG_MODES = {
    beauty: 0, deform: 1, normals: 2, depth: 3, cascades: 4,
    footprint: 5, fineNormals: 6, shadow: 7, ndotl: 8, shadowMap: 9,
    albedo: 10,
};

type DebugMode = keyof typeof DEBUG_MODES;

interface TerrainSettings {
    windDirection: number;
    macroHeightScale: number;
    sastrugiStrength: number;
    detailNormalStrength: number;
    glintIntensity: number;
    glintGrazing: number;
    sssStrength: number;
    sssRadius: number;
    fogDensity: number;
    fogHeightFalloff: number;
    fogStart: number;
    aerialStrength: number;
    ambientIntensity: number;
    deformDepth: number;
    debugView: DebugMode;
    showTerrain: boolean;
    wireframe: boolean;
}

const TS = S as unknown as TerrainSettings;

interface TerrainSky {
    lut: BaseTexture;
    sunDir: Vector3;
    sunRadiance: Color3;
    sh: number[] | Float32Array;
}

interface TerrainShadows {
    maps: BaseTexture[];
    matrixData: Float32Array;
    splits: ArrayLike<number>;
    paramData: number[] | Float32Array;
    texelSize: number;
    registerCaster(mesh: Mesh, material: (cascade: number) => ShaderMaterial): void;
    setHeightBounds(minimum: number, maximum: number): void;
}

interface TerrainOptions { exalted?: boolean }
interface TerrainFocus { x: number; z: number }
interface TerrainPrepass { registerCaster(mesh: Mesh, material: ShaderMaterial): void }
type TerrainHeightfield = ExaltedWorld | Heightfield;
type TerrainDeformation = DeformationField & {
    surfaceWeightsAt?: (x: number, z: number) => ArrayLike<number>;
};

interface DesertGroundData {
    material: string;
    uv: ReturnType<typeof fitPlanarUV>;
    roughness: number | null;
    color: Color3;
    base: BaseTexture;
    normal: BaseTexture;
}

/** Coordinate imported/procedural terrain, deformation, materials and depth/shadow integration. */
export class Terrain {
    readonly scene: Scene;
    readonly sky: TerrainSky;
    readonly shadows: TerrainShadows;
    readonly exalted: boolean;
    useDesertTextures = true;
    readonly heightfield: TerrainHeightfield;
    readonly deform: TerrainDeformation;
    readonly detailTex: ProceduralTexture;
    readonly mesh: Mesh;
    readonly material: ShaderMaterial;
    readonly materials: ShaderMaterial[];
    local?: LocalTerrain;
    localMaterial?: ShaderMaterial;
    prepassMat?: ShaderMaterial;
    localPrepassMat?: ShaderMaterial;
    groundProbe?: GroundProbe;
    desertGround?: DesertGroundData;
    private _depthMats?: ShaderMaterial[];
    private _boundDeform?: BaseTexture;
    water?: WorldWater;
    obstacles?: PropCollisions;

    constructor(scene: Scene, sky: TerrainSky, shadows: TerrainShadows, { exalted = false }: TerrainOptions = {}) {
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
        shadows.registerCaster(this.mesh, (c: number) => this._makeDepthMaterial(c));

        this.setDeformTexture(this.deform.texture);
    }

    private _makeSnowMaterial(local = false): ShaderMaterial {
        const mat = new ShaderMaterial(
            "snow",
            this.scene,
            { vertex: this.exalted ? "exalted" : "snow", fragment: "snow" },
            {
                attributes: this.exalted && !local ? ["position", "normal", "color"] : ["position"],
                defines: this.exalted ? ["EXALTED_TERRAIN", ...(local ? ['LOCAL_DETAIL'] : [])] : [],
                uniforms: [
                    "viewProjection", "cameraPos", "lodCenter", "patchCenter",
                    'desertU','desertV','desertBaseMatrix','desertNormalMatrix','desertColor','desertRoughness','desertNormalScale','desertGamma','useDesertTextures',
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
                    'desertBaseTex','desertNormalTex',
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

    /** Borrow the regional ground textures; its mesh is never added to the scene. */
    setDesertGround(ground: Mesh): void {
        const data=VertexData.ExtractFromMesh(ground,true,true);
        data.transform(ground.computeWorldMatrix(true));
        if (!data.positions) throw new Error('Desert ground must supply vertex positions');
        if (!data.uvs) throw new Error('Desert ground must supply texture coordinates');
        const uv=fitPlanarUV(data.positions,data.uvs), source=ground.material;
        if (!(source instanceof PBRMaterial)) throw new Error('Desert ground must use a PBR material');
        if(!source.albedoTexture || !source.bumpTexture) throw new Error('Desert ground must supply colour and normal textures');
        this.desertGround={material:source.name,uv,roughness:source.roughness,color:source.albedoColor,base:source.albedoTexture,normal:source.bumpTexture};
        for(const m of this.materials) {
            m.setVector3('desertU',Vector3.FromArray(uv.u));
            m.setVector3('desertV',Vector3.FromArray(uv.v));
            m.setTexture('desertBaseTex',source.albedoTexture);
            m.setTexture('desertNormalTex',source.bumpTexture);
            m.setMatrix('desertBaseMatrix',source.albedoTexture.getTextureMatrix());
            m.setMatrix('desertNormalMatrix',source.bumpTexture.getTextureMatrix());
            m.setColor3('desertColor',source.albedoColor);
            m.setFloat('desertRoughness',source.roughness ?? 1);
            m.setVector2('desertNormalScale',new Vector2(source.bumpTexture.level*(source.invertNormalMapX?-1:1),source.bumpTexture.level*(source.invertNormalMapY?-1:1)));
            m.setFloat('desertGamma',source.albedoTexture.gammaSpace && !source.albedoTexture._texture?._useSRGBBuffer ? 1 : 0);
        }
    }

    /**
     * The camera-space depth prepass material.
     *
     * Same clipmap and deformation code as the beauty pass through the same
     * includes; only the fragment stage differs. Registered with the prepass
     * rather than with the shadow system, so it takes `viewProjection` РІР‚вЂќ which
     * Babylon binds from the active camera, and which by then carries this
     * frame's temporal jitter.
     */
    makePrepassMaterial(local = false): ShaderMaterial {
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
        if (local) {
            if (!this.local) throw new Error('Local terrain must exist before its prepass material.');
            this.localPrepassMat = mat; mat.setTexture('patchTex', this.local.texture);
        }
        else this.prepassMat = mat;
        return mat;
    }

    private _makeDepthMaterial(cascade: number, local = false): ShaderMaterial {
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
        if (local) {
            if (!this.local) throw new Error('Local terrain must exist before its depth material.');
            mat.setTexture('patchTex', this.local.texture);
        }
        return mat;
    }

    /**
     * Prepare the chosen terrain source and dependent render resources before interactive updates; imported and procedural sources share the outer interface.
     */
    async build(): Promise<void> {
        this.detailTex.setFloat("resolution", DETAIL_RES);
        // Tilts a grain dome's flank to roughly 30 degrees. Higher reads as
        // gravel, lower stops registering at all.
        this.detailTex.setFloat("grainScale", 0.013);
        await bakeOnce(this.detailTex, "detailBake");

        if (this.exalted) await (this.heightfield as ExaltedWorld).loadInto(this.mesh);
        else await (this.heightfield as Heightfield).bake();
        if (this.exalted) {
            const world = this.heightfield as ExaltedWorld;
            this.local = new LocalTerrain(this.scene, world, this.mesh);
            this.localMaterial = this._makeSnowMaterial(true);
            this.localMaterial.setTexture('patchTex', this.local.texture);
            this.local.mesh.material = this.localMaterial;
            this.materials.push(this.localMaterial);
            this.local.update({ x: -65, z: 604 });
            this.shadows.registerCaster(this.local.mesh, (c: number) => this._makeDepthMaterial(c, true));
            this.deform.surfaceWeightsAt = (x: number, z: number) => world.weightsAt(x, z);
            if (!world.surfaceMap) throw new Error('Exalted surface map was not created during terrain load.');
            this.deform.setSurfaceMap(world.surfaceMap, world.origin, world.extent);
            this.groundProbe = new GroundProbe(this.scene, { heightfield: { surfaceMap: world.surfaceMap, origin: world.origin, extent: world.extent, weightsAt: (x, z) => world.weightsAt(x, z) }, deform: this.deform, local: this.local });
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
    async warmUp(): Promise<void> {
        // Before the snow material, because its first compile binds whatever is
        // in the deformation target and reading uninitialised VRAM as a height
        // can put NaN into a vertex position.
        await this.deform.warmUp();
        this.setDeformTexture(this.deform.texture);

        await whenReady(this.material, "snow material", [this.mesh, false]);
        if (this.local) {
            if (!this.localMaterial || !this.groundProbe) throw new Error('Local terrain resources are incomplete.');
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
    setDeformTexture(tex: BaseTexture): void {
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
    update(cameraPos: Vector3, focus: TerrainFocus, dt: number): void {
        const hf = this.heightfield;
        const windAngle = (TS.windDirection * Math.PI) / 180;
        if (this.local) {
            this.local.update(focus);
            this.local.mesh.isVisible = TS.showTerrain && this.local.triangleCount > 0;
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

        // Clipmap rings follow the player, not the viewer РІР‚вЂќ see the note on
        // `lodCenter` in snow.vertex.wgsl. No extra snapping here;
        // `placeClipmapVertex` snaps per ring already.
        _lod.set(focus.x, focus.z);

        for (const m of this.materials) {
        m.setFloat('useDesertTextures',this.useDesertTextures ? 1 : 0);
        if (this.local) m.setVector2('patchCenter', this.local.focus);
        m.setVector3("cameraPos", cameraPos);
        m.setVector2("lodCenter", _lod);
        m.setFloat("baseSpacing", BASE_SPACING);
        m.setFloat("gridHalfN", GRID_HALF_N);
        m.setVector2("worldOrigin", hf.origin);
        m.setFloat("worldSize", hf.size);
        m.setFloat("heightRes", 4096);
        m.setFloat("windAngle", windAngle);
        m.setFloat("macroAmp", TS.macroHeightScale);
        m.setFloat("sastrugiAmp", TS.sastrugiStrength);

        m.setVector3("sunDir", this.sky.sunDir);
        m.setColor3("sunRadiance", this.sky.sunRadiance);
        // Babylon declares number[] here, although Effect accepts the retained
        // Float32Array without conversion or a per-frame allocation.
        m.setArray4("shR", this.sky.sh as unknown as number[]);

        bindMatrixArray(m, "cascadeMatrices", this.shadows.matrixData);
        _splits.set(
            this.shadows.splits[0], this.shadows.splits[1],
            this.shadows.splits[2], this.shadows.splits[3]
        );
        m.setVector4("cascadeSplits", _splits);
        m.setArray4("cascadeParams", this.shadows.paramData as unknown as number[]);
        m.setFloat("shadowTexel", this.shadows.texelSize);
        m.setFloat("shadowSoftness", 1.8);
        // Metres. Snow has no thin geometry to peter-pan, so this can stay
        // small and keep contact shadows attached.
        m.setFloat("shadowBias", 0.022);

        m.setFloat("detailStrength", TS.detailNormalStrength);
        m.setFloat("glintIntensity", TS.glintIntensity);
        m.setFloat("glintGrazing", TS.glintGrazing);
        m.setFloat("sssStrength", TS.sssStrength);
        m.setFloat("sssRadius", TS.sssRadius);

        m.setFloat("fogDensity", TS.fogDensity);
        m.setFloat("fogHeightFalloff", TS.fogHeightFalloff);
        m.setFloat("fogStart", TS.fogStart);
        m.setFloat("aerialStrength", TS.aerialStrength);
        m.setFloat("ambientIntensity", TS.ambientIntensity);

        m.setVector2("deformCenter", deformCenter);
        m.setFloat("deformSize", deformSize);
        m.setFloat("deformTexel", this.deform.texel);
        m.setFloat("deformDepthScale", TS.deformDepth);

        m.setFloat("debugMode", DEBUG_MODES[TS.debugView] ?? 0);
        _screen.set(
            this.scene.getEngine().getRenderWidth(),
            this.scene.getEngine().getRenderHeight()
        );
        m.setVector2("screenSize", _screen);
        m.wireframe = TS.wireframe;
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
            pm.setFloat("sastrugiAmp", TS.sastrugiStrength);
            pm.setVector2("deformCenter", deformCenter);
            pm.setFloat("deformSize", deformSize);
            pm.setFloat("deformDepthScale", TS.deformDepth);
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
                d.setFloat("sastrugiAmp", TS.sastrugiStrength);
                d.setVector2("deformCenter", deformCenter);
                d.setFloat("deformSize", deformSize);
                d.setFloat("deformDepthScale", TS.deformDepth);
            }
        }
        this.groundProbe?.update(focus);
    }

    /**
     * Register terrain depth variants so displaced visible ground and post-processing depth agree.
     */
    registerPrepass(pass: TerrainPrepass): void {
        pass.registerCaster(this.mesh, this.makePrepassMaterial());
        if (this.local) pass.registerCaster(this.local.mesh, this.makePrepassMaterial(true));
    }

    /**
     * @param {number} x
     * @param {number} z
     */
    heightAt(x: number, z: number): number {
        return this.heightfield.heightAt(x, z) + (this.groundProbe?.heightAt(x, z) || 0);
    }

    /**
     * @param {number} x
     * @param {number} z
     * @param {Vector3} out
     */
    normalAt<T extends Vector3>(x: number, z: number, out: T): T {
        if (this.heightfield instanceof ExaltedWorld) this.heightfield.normalAt(x, z, out);
        else this.heightfield.normalAt(x, z, out);
        if (this.groundProbe) {
            const e = 0.125, g = this.groundProbe;
            const gx = -out.x / Math.max(out.y, 0.001) + (g.heightAt(x + e, z) - g.heightAt(x - e, z)) / (2 * e);
            const gz = -out.z / Math.max(out.y, 0.001) + (g.heightAt(x, z + e) - g.heightAt(x, z - e)) / (2 * e);
            out.set(-gx, 1, -gz).normalize();
        }
        return out;
    }

    /** Release terrain-owned rendering and simulation resources when the owning system is torn down. */
    dispose(): void {
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
