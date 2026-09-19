/**
 * The character system.
 *
 * Owns the skeleton, the garment simulation, the three meshes and the seven
 * pipelines that draw them, and the single small texture that carries every
 * per-frame transform to the GPU.
 *
 * The transform texture is the spine of the whole thing. Rows 0-3 hold bone
 * skinning matrices, rows 4 and beyond hold simulated cloth nodes, and one
 * `update()` per frame writes both into a pre-allocated staging array and
 * uploads it once. Nothing else crosses to the GPU: no per-frame buffers, no
 * matrix uniforms, no vertex data.
 *
 * Allocation per frame: none.
 *
 * @module character/character
 */

import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Vector2, Vector3, Vector4, Color3 } from "@babylonjs/core/Maths/math";
import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';

import { Figure, BONE_COUNT } from "./figure.ts";
import { makePanels, ClothSolver } from "./cloth.ts";
import { buildBody, buildFur, buildClothMesh } from "./build.ts";
import { S } from "../core/settings.ts";
import { whenReady, bindMatrixArray } from "../core/gpuUtil.ts";
import { CASCADE_COUNT } from "../render/shadows.ts";
import { SPELL_LIGHT_UNIFORMS } from "../spells/spellLights.ts";
import type { Terrain } from '../terrain/terrain.ts';
import type { Sky } from '../render/sky.ts';
import type { ShadowSystem } from '../render/shadows.ts';
import type { DepthPass } from '../render/depthPass.ts';
import type { CharacterController } from './controller.ts';

/** Transform texture geometry. Width covers the widest of bones or panel cols. */
const TEX_W = 48;
const TEX_H = 64;
/** First texture row available to cloth panels; 0-3 are the bone matrices. */
const CLOTH_ROW0 = 4;

/** How many cascades the figure casts into. See `ShadowSystem.registerCaster`. */
const CHAR_CASCADES = 2;

interface CharacterSettings {
    showCharacter:boolean; windDirection:number; windStrength:number;
    fogDensity:number; fogHeightFalloff:number; fogStart:number;
    aerialStrength:number; ambientIntensity:number; sssStrength:number;
}
const CS = S as unknown as CharacterSettings;
type ClothPanels = ReturnType<typeof makePanels>;

/**
 * Material palette. Eight slots, uploaded as two vec4 arrays so every value is
 * live-tunable and nothing is baked into the shader: deep indigo wool, a
 * lighter blue-grey mantle, a pale under-layer at the collar, dark leather.
 *
 * Two properties of these numbers are deliberate and were measured off the
 * render rather than picked as colours.
 *
 * They are *very* saturated. At thirteen degrees the sun has lost most of its
 * blue Р В Р’В Р В РІР‚В Р В Р’В Р Р†Р вЂљРЎв„ўР В Р вЂ Р В РІР‚С™Р РЋРЎС™ the direct beam here is roughly 17:13:6 Р В Р’В Р В РІР‚В Р В Р’В Р Р†Р вЂљРЎв„ўР В Р вЂ Р В РІР‚С™Р РЋРЎС™ so a merely blue-ish albedo
 * comes back out of the multiply as warm grey. The blue has to be about four
 * times the red in the albedo just to survive to two-to-one in the lit areas.
 *
 * They are *very* dark. AgX compresses hard, so an eighth of the snow's albedo
 * is only about three stops down and lands near mid grey on screen. Anything
 * lighter stops reading as a silhouette against the field, which is the one
 * thing the figure has to do at fifteen metres.
 */
const PALETTE = [
    // rgb, roughness
    [0.030, 0.048, 0.125, 0.80], // 0 robe, deep indigo
    [0.075, 0.105, 0.185, 0.74], // 1 mantle, blue-grey
    [0.230, 0.225, 0.205, 0.82], // 2 collar lining, warm pale
    [0.048, 0.033, 0.024, 0.60], // 3 leather
    [0.135, 0.095, 0.072, 0.85], // 4 skin, deep in shade
    [0.120, 0.195, 0.310, 0.70], // 5 trim / scarf, pale blue
    [0.700, 0.720, 0.760, 0.85], // 6 fur (unused by the fabric shader)
    [0.100, 0.100, 0.100, 0.80], // 7 spare
];

/**
 * (sheen, anisotropy, transmission, weave depth) per slot.
 *
 * Transmission is the number to be careful with. Sunlight through a *blue*
 * robe, multiplied by a *warm* sun, comes back grey Р В Р’В Р В РІР‚В Р В Р’В Р Р†Р вЂљРЎв„ўР В Р вЂ Р В РІР‚С™Р РЋРЎС™ so a generous
 * transmission term does not make the garment glow, it desaturates it to the
 * point where the albedo stops mattering. Heavy wool is close to opaque; only
 * the thin under-layer gets a real value.
 */
const PARAMS = [
    [0.22, 0.55, 0.05, 1.00],
    [0.28, 0.45, 0.07, 0.90],
    [0.35, 0.30, 0.22, 1.10],
    [0.06, 0.20, 0.01, 0.35],
    [0.05, 0.00, 0.08, 0.00],
    [0.25, 0.60, 0.12, 1.00],
    [1.00, 0.00, 0.90, 0.00],
    [0.20, 0.00, 0.00, 0.50],
];

// ------------------------------------------------------- module-scope scratch
const _droop = new Vector3();
const _screen = new Vector2();
const _furCol = new Color3(0.74, 0.755, 0.795);

/** Own the procedural avatar meshes, materials and transform texture; movement remains in CharacterController. */
export class Character {
    readonly scene:Scene;
    readonly terrain:Terrain;
    readonly sky:Sky;
    readonly shadows:ShadowSystem;
    readonly controller:CharacterController;
    readonly figure:Figure;
    readonly panels:ClothPanels;
    readonly solver:ClothSolver;
    private readonly _texData:Float32Array;
    private readonly _panelParams:Float32Array;
    readonly charTex:RawTexture;
    private readonly _matAlbedo:Float32Array;
    private readonly _matParams:Float32Array;
    readonly bodyMesh:Mesh;
    readonly clothMesh:Mesh;
    readonly furMesh:Mesh;
    readonly bodyMat:ShaderMaterial;
    readonly clothMat:ShaderMaterial;
    readonly furMat:ShaderMaterial;
    private readonly _depthMats:ShaderMaterial[] = [];
    private _prepassMats?:ShaderMaterial[];
    readonly triangles:number;
    private readonly _cameraPos = new Vector3();
    private readonly _splits = new Vector4(0,0,0,0);
    private _needSettle = true;
    private _visible = true;

    constructor(scene:Scene, terrain:Terrain, sky:Sky, shadows:ShadowSystem, controller:CharacterController) {
        this.scene = scene;
        this.terrain = terrain;
        this.sky = sky;
        this.shadows = shadows;
        this.controller = controller;

        this.figure = new Figure(terrain);
        this.panels = makePanels();
        this.solver = new ClothSolver(this.panels, terrain);

        // ---- transform texture -------------------------------------------
        this._texData = new Float32Array(TEX_W * TEX_H * 4);
        let row = CLOTH_ROW0;
        /** Flat (rowBase, cols, rows, 0) per panel, for the vertex shaders. */
        this._panelParams = new Float32Array(6 * 4);
        for (let i = 0; i < this.panels.length; i++) {
            const p = this.panels[i];
            if (p.cols > TEX_W) throw new Error("panel wider than the transform texture");
            p.nodeRow = row;
            this._panelParams[i * 4] = row;
            this._panelParams[i * 4 + 1] = p.cols;
            this._panelParams[i * 4 + 2] = p.rows;
            row += p.rows;
        }
        if (row > TEX_H) throw new Error("transform texture too short for the panels");

        this.charTex = RawTexture.CreateRGBATexture(
            this._texData, TEX_W, TEX_H, scene,
            false, false,
            Constants.TEXTURE_NEAREST_SAMPLINGMODE,
            Constants.TEXTURETYPE_FLOAT
        );
        this.charTex.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE;
        this.charTex.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;

        // ---- palette ------------------------------------------------------
        this._matAlbedo = new Float32Array(32);
        this._matParams = new Float32Array(32);
        for (let i = 0; i < 8; i++) {
            for (let k = 0; k < 4; k++) {
                this._matAlbedo[i * 4 + k] = PALETTE[i][k];
                this._matParams[i * 4 + k] = PARAMS[i][k];
            }
        }

        // ---- meshes and materials -----------------------------------------
        this.bodyMesh = buildBody(scene);
        this.clothMesh = buildClothMesh(scene, this.panels);
        this.furMesh = buildFur(scene);

        this.bodyMat = this._makeSurfaceMaterial("charBody", "char", "char", false);
        this.clothMat = this._makeSurfaceMaterial("charCloth", "cloth", "char", true);
        this.furMat = this._makeFurMaterial();

        this.bodyMesh.material = this.bodyMat;
        this.clothMesh.material = this.clothMat;
        this.furMesh.material = this.furMat;

        for (const m of [this.bodyMesh, this.clothMesh, this.furMesh]) {
            m.renderingGroupId = 1;
        }

        shadows.registerCaster(
            this.bodyMesh, (c:number) => this._makeDepthMaterial("charDepth", c, false), CHAR_CASCADES
        );
        shadows.registerCaster(
            this.clothMesh, (c:number) => this._makeDepthMaterial("clothDepth", c, true), CHAR_CASCADES
        );
        // Fur is not registered as a caster. Its shadow lands inside the hood's
        // own, an alpha-tested 22-shell depth pass is not cheap, and what it
        // would contribute is a slightly fuzzier edge on a shadow already an
        // order of magnitude softer than that.

        this.triangles =
            this.bodyMesh.metadata.triangles +
            this.clothMesh.metadata.triangles +
            this.furMesh.metadata.triangles;

        this.setVisible(CS.showCharacter !== false);
    }

    /**
     * One surface material. The body and the garments differ only in their
     * vertex program Р В Р’В Р В РІР‚В Р В Р’В Р Р†Р вЂљРЎв„ўР В Р вЂ Р В РІР‚С™Р РЋРЎС™ the fabric shading, the shadow lookup and the aerial
     * perspective are literally the same code.
     */
    private _makeSurfaceMaterial(name:string, vertex:string, fragment:string, isCloth:boolean):ShaderMaterial {
        const uniforms = [
            "viewProjection", "cameraPos",
            "sunDir", "sunRadiance", "shR",
            "cascadeMatrices", "cascadeSplits", "cascadeParams",
            "shadowTexel", "shadowSoftness", "shadowBias",
            "matAlbedo", "matParams",
            "fogDensity", "fogHeightFalloff", "fogStart", "aerialStrength",
            "ambientIntensity", "sssStrength", "weaveDensity",
            "screenSize",
            ...SPELL_LIGHT_UNIFORMS,
        ];
        const attributes = isCloth
            ? ["position", "uv", "aux"]
            : ["position", "normal", "uv", "aux", "boneIdx", "boneWt"];
        if (isCloth) uniforms.push("panelParams");

        const mat = new ShaderMaterial(
            name, this.scene, { vertex, fragment },
            {
                attributes,
                uniforms,
                samplers: [
                    "charTex", "skyLUT", "cascade0", "cascade1", "cascade2",
                ],
                shaderLanguage: ShaderLanguage.WGSL,
            }
        );
        // Every garment is an open sheet and the cowl is a shell, so both faces
        // are visible. The fragment shader turns the normal toward the viewer
        // rather than trusting winding Р В Р’В Р В РІР‚В Р В Р’В Р Р†Р вЂљРЎв„ўР В Р вЂ Р В РІР‚С™Р РЋРЎС™ see the note there.
        mat.backFaceCulling = false;
        mat.setTexture("charTex", this.charTex);
        mat.setTexture("skyLUT", this.sky.lut);
        for (let i = 0; i < CASCADE_COUNT; i++) {
            mat.setTexture("cascade" + i, this.shadows.maps[i]);
        }
        return mat;
    }

    private _makeFurMaterial():ShaderMaterial {
        const mat = new ShaderMaterial(
            "charFur", this.scene, { vertex: "fur", fragment: "fur" },
            {
                attributes: ["position", "normal", "uv", "aux", "boneIdx", "boneWt"],
                uniforms: [
                    "viewProjection", "cameraPos", "furDroop",
                    "sunDir", "sunRadiance", "shR",
                    "cascadeMatrices", "cascadeSplits", "cascadeParams",
                    "shadowTexel", "shadowSoftness", "shadowBias",
                    "fogDensity", "fogHeightFalloff", "fogStart", "aerialStrength",
                    "ambientIntensity", "furDensity", "furColor",
                ],
                samplers: ["charTex", "skyLUT", "cascade0", "cascade1", "cascade2"],
                shaderLanguage: ShaderLanguage.WGSL,
            }
        );
        mat.backFaceCulling = false;
        mat.setTexture("charTex", this.charTex);
        mat.setTexture("skyLUT", this.sky.lut);
        for (let i = 0; i < CASCADE_COUNT; i++) {
            mat.setTexture("cascade" + i, this.shadows.maps[i]);
        }
        return mat;
    }

    private _makeDepthMaterial(vertex:string, cascade:number, isCloth:boolean):ShaderMaterial {
        const uniforms = ["lightViewProjection"];
        if (isCloth) uniforms.push("panelParams");
        const mat = new ShaderMaterial(
            vertex + cascade, this.scene,
            { vertex, fragment: "terrainDepth" },
            {
                attributes: isCloth ? ["position"] : ["position", "boneIdx", "boneWt"],
                uniforms,
                samplers: ["charTex"],
                shaderLanguage: ShaderLanguage.WGSL,
                // Forces a distinct Effect per cascade, so each can hold its own
                // matrix without any mid-frame uniform juggling.
                defines: ["CHAR_CASCADE " + cascade],
            }
        );
        mat.backFaceCulling = false;
        mat.setTexture("charTex", this.charTex);
        if (isCloth) mat.setArray4("panelParams", this._panelParams as unknown as number[]);
        this._depthMats.push(mat);
        return mat;
    }

    /**
     * Depth-prepass materials for the body and the garments.
     *
     * The fur is left out on the same grounds it is left out of the shadow
     * cascades: it is an alpha-tested twenty-two-shell pass, and what it would
     * contribute is a fractionally fuzzier occlusion edge on a hood rim that is
     * already inside its own baked cavity.
     *
     * @param {import("../render/depthPass.ts").DepthPass} depth
     */
    registerPrepass(depth:DepthPass):void {
        this._prepassMats = [];
        for (const spec of [
            { mesh: this.bodyMesh, vertex: "charPrepass", cloth: false },
            { mesh: this.clothMesh, vertex: "clothPrepass", cloth: true },
        ]) {
            const uniforms = ["viewProjection"];
            if (spec.cloth) uniforms.push("panelParams");
            const mat = new ShaderMaterial(
                spec.vertex, this.scene,
                { vertex: spec.vertex, fragment: "prepass" },
                {
                    attributes: spec.cloth
                        ? ["position"]
                        : ["position", "boneIdx", "boneWt"],
                    uniforms,
                    samplers: ["charTex"],
                    shaderLanguage: ShaderLanguage.WGSL,
                }
            );
            mat.backFaceCulling = false;
            mat.setTexture("charTex", this.charTex);
            if (spec.cloth) mat.setArray4("panelParams", this._panelParams as unknown as number[]);
            this._prepassMats.push(mat);
            depth.registerCaster(spec.mesh, mat);
        }
    }

    /**
     * Set visibility of body, cloth and fur together through the character's visibility flag.
     */
    setVisible(v:boolean):void {
        this._visible = !!v;
        this.bodyMesh.isVisible = this._visible;
        this.clothMesh.isVisible = this._visible;
        this.furMesh.isVisible = this._visible;
    }

    /**
     * Advance the figure and the garments, then push one texture upload and one
     * set of uniforms.
     *
     * Order matters: the skeleton has to be posed before the cloth can find its
     * kinematic targets, and both have to be written before the texture goes up,
     * or the garments render one frame behind the body they hang from.
     *
     * @param {number} dt
     */
    resetPose():void {
        // Preserve the Figure object referenced by contacts and spells.
        Object.assign(this.figure, new Figure(this.terrain));
        this._needSettle = true;
        this.update(0);
    }

    /**
     * Pose the figure and advance garment simulation before uploading their shared transform texture.
     * @param {number} dt - Simulation seconds.
     */
    update(dt:number):void {
        const ch = this.controller;
        this.figure.update(dt, ch);
        if (this._needSettle) {
            this._settleCloth();
            this._needSettle = false;
        }
        this.solver.update(dt, this.figure, ch);
        this._uploadTransforms();
    }

    /**
     * Push this frame's uniforms. Split from `update` because the garments have
     * to be solved before the contact system reads the feet, while the uniforms
     * cannot be written until the camera has moved and the cascades have been
     * refitted. Doing both at one point in the frame means one of them is a
     * frame stale, and the visible symptom Р В Р’В Р В РІР‚В Р В Р’В Р Р†Р вЂљРЎв„ўР В Р вЂ Р В РІР‚С™Р РЋРЎС™ a shadow that lags the figure by a
     * frame during a fast carve Р В Р’В Р В РІР‚В Р В Р’В Р Р†Р вЂљРЎв„ўР В Р вЂ Р В РІР‚С™Р РЋРЎС™ is exactly the sort of thing that reads as
     * "cheap" without being identifiable.
     *
     * @param {Vector3} cameraPos
     */
    sync(cameraPos:Vector3):void {
        this._cameraPos.copyFrom(cameraPos);
        this._pushUniforms();
    }

    /**
     * Drop every garment straight onto its kinematic target.
     *
     * Done once, on the first update. The panels are authored in bind space at
     * the world origin, and letting them fall from there to wherever the player
     * actually spawned takes a second of visible flapping Р В Р’В Р В РІР‚В Р В Р’В Р Р†Р вЂљРЎв„ўР В Р вЂ Р В РІР‚С™Р РЋРЎС™ behind the loading
     * screen if we are lucky, in shot if we are not.
     */
    private _settleCloth():void {
        const skin = this.figure.skin;
        for (let pi = 0; pi < this.panels.length; pi++) {
            const p = this.panels[pi];
            for (let k = 0; k < p.count; k++) {
                const b = p.bone[k] * 16;
                const o = k * 3;
                const x = p.bindPos[o], y = p.bindPos[o + 1], z = p.bindPos[o + 2];
                p.pos[o] = skin[b] * x + skin[b + 4] * y + skin[b + 8] * z + skin[b + 12];
                p.pos[o + 1] = skin[b + 1] * x + skin[b + 5] * y + skin[b + 9] * z + skin[b + 13];
                p.pos[o + 2] = skin[b + 2] * x + skin[b + 6] * y + skin[b + 10] * z + skin[b + 14];
            }
            p.prev.set(p.pos);
        }
    }

    /**
     * Pack skin matrices and cloth nodes into the shared float texture so all character render passes consume the same pose.
     */
    private _uploadTransforms():void {
        const d = this._texData;
        const skin = this.figure.skin;

        // Rows 0-3: bone matrices, one column per bone, one row per matrix
        // column. Written as four separate row writes rather than one blit,
        // because the texture is column-major in bones and row-major in memory.
        for (let b = 0; b < BONE_COUNT; b++) {
            const s = b * 16;
            for (let c = 0; c < 4; c++) {
                const o = (c * TEX_W + b) * 4;
                d[o] = skin[s + c * 4];
                d[o + 1] = skin[s + c * 4 + 1];
                d[o + 2] = skin[s + c * 4 + 2];
                d[o + 3] = skin[s + c * 4 + 3];
            }
        }

        for (let pi = 0; pi < this.panels.length; pi++) {
            const p = this.panels[pi];
            const pos = p.pos;
            for (let j = 0; j < p.rows; j++) {
                const rowO = ((p.nodeRow + j) * TEX_W) * 4;
                for (let i = 0; i < p.cols; i++) {
                    const s = (j * p.cols + i) * 3;
                    const o = rowO + i * 4;
                    d[o] = pos[s];
                    d[o + 1] = pos[s + 1];
                    d[o + 2] = pos[s + 2];
                    d[o + 3] = 1;
                }
            }
        }

        this.charTex.update(d);
    }

    private _pushUniforms():void {
        const sky = this.sky;
        const sh = this.shadows;
        const ch = this.controller;

        // Fur droop: gravity, plus the apparent wind, plus the character's own
        // acceleration thrown the other way. Scaled to metres of tip travel.
        const a = (CS.windDirection * Math.PI) / 180;
        const ws = 0.6 * CS.windStrength;
        _droop.set(
            Math.sin(a) * ws * 0.006 - ch.velocity.x * 0.0016 - ch.acceleration.x * 0.00018,
            -0.018,
            Math.cos(a) * ws * 0.006 - ch.velocity.z * 0.0016 - ch.acceleration.z * 0.00018
        );

        this._splits.set(sh.splits[0], sh.splits[1], sh.splits[2], sh.splits[3]);

        const mats = [this.bodyMat, this.clothMat, this.furMat];
        for (let i = 0; i < mats.length; i++) {
            const m = mats[i];
            m.setVector3("cameraPos", this._cameraPos);
            m.setVector3("sunDir", sky.sunDir);
            m.setColor3("sunRadiance", sky.sunRadiance);
            m.setArray4("shR", sky.sh as unknown as number[]);

            bindMatrixArray(m, "cascadeMatrices", sh.matrixData);
            m.setVector4("cascadeSplits", this._splits);
            m.setArray4("cascadeParams", sh.paramData as unknown as number[]);
            m.setFloat("shadowTexel", sh.texelSize);
            m.setFloat("shadowSoftness", 1.4);
            // Tighter than the terrain's: the figure is small, its cascade is
            // the near one, and a large bias here detaches the contact shadow
            // between the boots and the snow Р В Р’В Р В РІР‚В Р В Р’В Р Р†Р вЂљРЎв„ўР В Р вЂ Р В РІР‚С™Р РЋРЎС™ which is the shadow that tells
            // you the character is standing on the ground rather than in it.
            m.setFloat("shadowBias", 0.012);

            m.setFloat("fogDensity", CS.fogDensity);
            m.setFloat("fogHeightFalloff", CS.fogHeightFalloff);
            m.setFloat("fogStart", CS.fogStart);
            m.setFloat("aerialStrength", CS.aerialStrength);
            m.setFloat("ambientIntensity", CS.ambientIntensity);
        }

        const eng = this.scene.getEngine();
        _screen.set(eng.getRenderWidth(), eng.getRenderHeight());

        for (const m of [this.bodyMat, this.clothMat]) {
            m.setArray4("matAlbedo", this._matAlbedo as unknown as number[]);
            m.setArray4("matParams", this._matParams as unknown as number[]);
            m.setFloat("sssStrength", CS.sssStrength);
            m.setVector2("screenSize", _screen);
            // Threads per metre. Coarse hand-woven wool, which is what puts the
            // weave right at the edge of visibility at the distance the figure
            // is normally framed Р В Р’В Р В РІР‚В Р В Р’В Р Р†Р вЂљРЎв„ўР В Р вЂ Р В РІР‚С™Р РЋРЎС™ present in a close-up, gone by ten metres.
            m.setFloat("weaveDensity", 210);
        }
        this.clothMat.setArray4("panelParams", this._panelParams as unknown as number[]);

        this.furMat.setVector3("furDroop", _droop);
        this.furMat.setFloat("furDensity", 250);
        this.furMat.setColor3("furColor", _furCol);
    }

    /** Compile every pipeline behind the loading screen. */
    async warmUp():Promise<void> {
        await whenReady(this.bodyMat, "character body material", [this.bodyMesh, false]);
        await whenReady(this.clothMat, "character cloth material", [this.clothMesh, false]);
        await whenReady(this.furMat, "character fur material", [this.furMesh, false]);
        for (let i = 0; i < this._depthMats.length; i++) {
            const m = this._depthMats[i];
            const mesh = m.name.indexOf("cloth") === 0 ? this.clothMesh : this.bodyMesh;
            await whenReady(m, m.name, [mesh, false]);
        }
        if (this._prepassMats) {
            for (let i = 0; i < this._prepassMats.length; i++) {
                const m = this._prepassMats[i];
                const mesh = m.name.indexOf("cloth") === 0 ? this.clothMesh : this.bodyMesh;
                await whenReady(m, m.name, [mesh, false]);
            }
        }
    }

    /** Release avatar meshes, materials and the pose/cloth texture when the owning system is torn down. */
    dispose():void {
        this.bodyMesh.dispose();
        this.clothMesh.dispose();
        this.furMesh.dispose();
        this.bodyMat.dispose();
        this.clothMat.dispose();
        this.furMat.dispose();
        this.charTex.dispose();
    }
}
