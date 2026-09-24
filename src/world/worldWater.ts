/** Persistent world water rendering, swimming lookup, and ripple state. */
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore';
import { Vector2, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Scene } from '@babylonjs/core/scene';
import { S } from '../core/settings.ts';
import { whenReady } from '../core/gpuUtil.ts';
import { buildWaterGeometry, withoutWaterfalls, type WaterReference } from './waterGeometry.ts';
import referenceJson from './waterReference.json';
import { WaterSurface, waterfallEmitters, type WaterSample, type WaterfallEmitter } from './waterSurface.ts';
import type { LoadedTerrainData } from '../terrain/exaltedWorld.ts';
import vertex from '../shaders/worldWater.vertex.wgsl?raw';
import fragment from '../shaders/worldWater.fragment.wgsl?raw';

interface WaterTerrain {
    heightfield: unknown;
    water?: WorldWater;
}

interface WaterSky {
    lut: BaseTexture;
    sunDir: Vector3;
    sunRadiance: Color3;
}

interface WaterDepthPass {
    registerCaster(mesh: Mesh, material: ShaderMaterial): void;
}

interface WaterAtmosphereSettings {
    windDirection: number;
    fogDensity: number;
    fogHeightFalloff: number;
    fogStart: number;
    aerialStrength: number;
}

const WS = S as unknown as WaterAtmosphereSettings;
const reference = referenceJson as unknown as WaterReference;
const atmosphereUniforms = ['fogDensity', 'fogHeightFalloff', 'fogStart', 'aerialStrength'] as const;

/** Narrow the imported terrain source before consuming its retained GLB vertex data. */
function loadedTerrainData(heightfield: unknown): LoadedTerrainData {
    if (
        typeof heightfield !== 'object' ||
        heightfield === null ||
        !('data' in heightfield)
    ) {
        throw new Error('World water requires loaded Exalted terrain geometry.');
    }
    return heightfield.data as LoadedTerrainData;
}

/** Render persistent lake/river water and expose its swimming and spray data. */
export class WorldWater {
    readonly sky: WaterSky;
    readonly wind = new Vector2();
    readonly meshes: Mesh[] = [];
    readonly materials: ShaderMaterial[] = [];
    readonly ripples = new Float32Array(16);
    readonly level: number;
    readonly surface: WaterSurface;
    readonly emitters: WaterfallEmitter[];
    readonly riverMouth: Vector2;
    time = 0;
    rippleIndex = 0;
    triangles = 0;
    private disposed = false;

    constructor(scene: Scene, terrain: WaterTerrain, sky: WaterSky, depthPass: WaterDepthPass) {
        this.sky = sky;
        for (let i = 0; i < 4; i++) this.ripples[i * 4 + 2] = -100;
        ShaderStore.ShadersStoreWGSL.worldWaterVertexShader = vertex;
        ShaderStore.ShadersStoreWGSL.worldWaterPixelShader = fragment;

        const geometry = buildWaterGeometry(loadedTerrainData(terrain.heightfield), reference, 0);
        this.level = geometry.level;
        this.surface = new WaterSurface(geometry.lake, this.level);
        this.emitters = waterfallEmitters(geometry.river);
        const mouth = reference.river[reference.river.length - 1];
        this.riverMouth = new Vector2(-mouth[0], -mouth[1]);
        terrain.water = this;

        const bodies = [
            { name: 'lake', flow: 0, data: geometry.lake },
            // Steep blue triangles are location markers for the dedicated GPU
            // fall. Leaving them here would retain the old solid waterfall.
            { name: 'river', flow: 0, data: withoutWaterfalls(geometry.river) },
        ] as const;
        for (const { name, flow, data } of bodies) {
            if (!data.indices.length) continue;
            const mesh = new Mesh(`world-water:${name}`, scene);
            const vertexData = new VertexData();
            Object.assign(vertexData, data);
            vertexData.applyToMesh(mesh);
            mesh.isPickable = false;
            mesh.renderingGroupId = 1;
            mesh.hasVertexAlpha = false;
            const material = this.makeMaterial(scene, flow);
            mesh.material = material;
            depthPass.registerCaster(mesh, this.makeMaterial(scene, flow, true));
            this.meshes.push(mesh);
            this.materials.push(material);
            this.triangles += data.indices.length / 3;
        }
        scene.onDisposeObservable.addOnce(() => this.dispose());
    }

    /** Delegate swimming coverage to the rendered lake triangle lookup. */
    sample(x: number, z: number): WaterSample | null {
        return this.surface.sample(x, z);
    }

    /** Overwrite the next of four bounded ripple slots. */
    ripple(x: number, z: number, strength: number): void {
        this.ripples.set([x, z, this.time, strength], this.rippleIndex * 4);
        this.rippleIndex = (this.rippleIndex + 1) % 4;
    }

    /** Create a visible or depth-prepass lake/river shader variant. */
    private makeMaterial(scene: Scene, flow: number, depth = false): ShaderMaterial {
        const material = new ShaderMaterial(
            `world-water:${depth ? 'depth' : flow ? 'river' : 'lake'}`,
            scene,
            'worldWater',
            {
                shaderLanguage: ShaderLanguage.WGSL,
                attributes: ['position', 'normal', 'color'],
                defines: depth ? ['#define WATER_PREPASS'] : [],
                uniforms: ['viewProjection', 'cameraPos', 'sunDir', 'sunRadiance', 'waterTime', 'flowMode', 'wind', 'waterRipples', ...atmosphereUniforms],
                samplers: ['skyLUT'],
            },
        );
        material.backFaceCulling = false;
        material.setFloat('flowMode', flow);
        material.setFloat('waterTime', 0);
        material.setVector2('wind', this.wind);
        material.setTexture('skyLUT', this.sky.lut);
        // Babylon declares number[] here, though Effect accepts Float32Array
        // directly; retaining it avoids a uniform allocation every frame.
        material.setArray4('waterRipples', this.ripples as unknown as number[]);
        return material;
    }

    /** Advance water time and publish wind, ripples, sun, and atmosphere. */
    update(dt: number, camera: Vector3): void {
        this.time += dt;
        const angle = WS.windDirection * Math.PI / 180;
        this.wind.set(Math.sin(angle), Math.cos(angle));
        for (const material of this.materials) {
            material.setFloat('waterTime', this.time);
            material.setVector2('wind', this.wind);
            material.setArray4('waterRipples', this.ripples as unknown as number[]);
            material.setVector3('cameraPos', camera);
            material.setVector3('sunDir', this.sky.sunDir);
            material.setColor3('sunRadiance', this.sky.sunRadiance);
            for (const name of atmosphereUniforms) material.setFloat(name, WS[name]);
        }
    }

    /** Compile visible water materials before the first interactive frame. */
    async warmUp(): Promise<void> {
        for (let i = 0; i < this.meshes.length; i++) {
            await whenReady(this.materials[i], this.materials[i].name, [this.meshes[i], false]);
        }
    }

    /** Release visible water resources once, including scene-driven disposal. */
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.meshes.forEach(mesh => mesh.dispose());
        this.materials.forEach(material => material.dispose());
    }
}
