import '@babylonjs/core/Meshes/thinInstanceMesh';
import { Matrix, Quaternion, Vector2, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore';
import type { Scene } from '@babylonjs/core/scene';
import { createGrassBlade } from './GrassGeometry.ts';
import type { GrassSamplers, GrassSettings, GrassStats, GrassUpdateContext } from './grassTypes.ts';
import type { ImportedGrassPrototype } from './ImportedGrass.ts';
import vertexShader from './grass.vertex.wgsl?raw';
import fragmentShader from './grass.fragment.wgsl?raw';

interface GrassPatch {
    x: number;
    z: number;
    instances: number;
    near: Mesh;
    mid: Mesh;
    nearTriangles: number;
    midTriangles: number;
}

const PATCH_SIZE = 16;

function hash(x: number): number {
    let value = x | 0;
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    return ((value ^ (value >>> 16)) >>> 0) / 0x1_0000_0000;
}

/** DOM-independent procedural grass renderer used by the lab and later world integration. */
export class GrassSystem {
    public readonly stats: GrassStats = { updateMs: 0, visiblePatches: 0, nearInstances: 0, midInstances: 0, triangles: 0, draws: 0 };
    private readonly patches: GrassPatch[] = [];
    private readonly nearTemplate: Mesh;
    private readonly midTemplate: Mesh;
    private readonly nearGeometry: VertexData;
    private readonly midGeometry: VertexData;
    private importedPrototypes = new Map<string, ImportedGrassPrototype>();
    private readonly nearMaterial: ShaderMaterial;
    private readonly midMaterial: ShaderMaterial;
    private builtDensity = -1;
    private builtGeometryKey = '';

    public constructor(
        private readonly scene: Scene,
        private readonly samplers: GrassSamplers,
        public readonly settings: GrassSettings,
        private readonly centre = new Vector2(-250, 60),
        private readonly extent = 256,
    ) {
        ShaderStore.ShadersStoreWGSL.exaltedGrassVertexShader = vertexShader;
        ShaderStore.ShadersStoreWGSL.exaltedGrassPixelShader = fragmentShader;
        this.nearTemplate = createGrassBlade('grass-near-template', scene, 4);
        this.midTemplate = createGrassBlade('grass-mid-template', scene, 1);
        // Patch meshes need independent vertex-buffer bindings. Babylon mesh
        // cloning can share the internal thin-instance storage as well as the
        // intended blade geometry, causing one patch's count to address a
        // sibling patch's shorter matrix buffer.
        this.nearGeometry = VertexData.ExtractFromMesh(this.nearTemplate, true, true);
        this.midGeometry = VertexData.ExtractFromMesh(this.midTemplate, true, true);
        this.nearMaterial = this.createMaterial('near', 0);
        this.midMaterial = this.createMaterial('mid', 1);
        this.nearTemplate.material = this.nearMaterial;
        this.midTemplate.material = this.midMaterial;
        this.nearTemplate.setEnabled(false);
        this.midTemplate.setEnabled(false);
        this.rebuild();
    }

    /** Supplies normalized GLB prototypes without coupling the renderer to asset loading. */
    public setImportedPrototypes(prototypes: Map<string, ImportedGrassPrototype>): void {
        this.importedPrototypes = prototypes;
        this.rebuild();
    }

    public getPrototypeTriangleCounts(): readonly [number, number] {
        const imported = this.importedPrototypes.get(this.settings.importedVariant)?.triangles ?? 0;
        if (this.settings.bladeSource === 'procedural') return [8, 2];
        if (this.settings.bladeSource === 'hybrid') return [imported, 2];
        return [imported, imported];
    }

    private createMaterial(name: string, lodKind: number): ShaderMaterial {
        const material = new ShaderMaterial(`grass-${name}`, this.scene, 'exaltedGrass', {
            shaderLanguage: ShaderLanguage.WGSL,
            attributes: ['position', 'normal'],
            uniforms: ['world', 'viewProjection', 'time', 'wind', 'cameraPosition', 'interactionEnabled', 'visualization', 'lodKind'],
        });
        material.backFaceCulling = false;
        material.setFloat('lodKind', lodKind);
        material.setFloat('time', 0);
        material.setVector2('wind', Vector2.Zero());
        material.setVector3('cameraPosition', Vector3.Zero());
        material.setFloat('interactionEnabled', 1);
        material.setFloat('visualization', 0);
        return material;
    }

    /** Rebuilds deterministic patch buffers when density or blade dimensions change. */
    public rebuild(): void {
        for (const patch of this.patches) {
            patch.near.dispose();
            patch.mid.dispose();
        }
        this.patches.length = 0;
        const imported = this.importedPrototypes.get(this.settings.importedVariant);
        const useImportedNear = this.settings.bladeSource !== 'procedural' && imported;
        const useImportedMid = this.settings.bladeSource === 'imported' && imported;
        const nearGeometry = useImportedNear ? imported.geometry : this.nearGeometry;
        const midGeometry = useImportedMid ? imported.geometry : this.midGeometry;
        const nearTriangles = useImportedNear ? imported.triangles : 8;
        const midTriangles = useImportedMid ? imported.triangles : 2;
        const half = this.extent * 0.5;
        const firstX = Math.floor((this.centre.x - half) / PATCH_SIZE);
        const lastX = Math.floor((this.centre.x + half) / PATCH_SIZE);
        const firstZ = Math.floor((this.centre.y - half) / PATCH_SIZE);
        const lastZ = Math.floor((this.centre.y + half) / PATCH_SIZE);
        // Blade-scale grass needs several candidates per square metre. The
        // earlier 0.72 m spacing was appropriate for authored plant clumps but
        // left individual imported blades visibly isolated.
        const spacing = 0.42 / Math.sqrt(this.settings.density);
        const cells = Math.floor(PATCH_SIZE / spacing);
        for (let patchZ = firstZ; patchZ <= lastZ; patchZ++) {
            for (let patchX = firstX; patchX <= lastX; patchX++) {
                const nearMatrices: number[] = [];
                const midMatrices: number[] = [];
                for (let cellZ = 0; cellZ < cells; cellZ++) {
                    for (let cellX = 0; cellX < cells; cellX++) {
                        const seed = (((patchX * 73856093) ^ (patchZ * 19349663) ^ (cellX * 83492791) ^ cellZ) >>> 0);
                        const x = patchX * PATCH_SIZE + (cellX + 0.12 + hash(seed) * 0.76) * PATCH_SIZE / cells;
                        const z = patchZ * PATCH_SIZE + (cellZ + 0.12 + hash(seed + 11) * 0.76) * PATCH_SIZE / cells;
                        const weight = this.samplers.grassWeightAt(x, z);
                        const coverage = Math.max(0, Math.min(1, (weight - 0.06) / 0.48));
                        if (coverage <= 0 || hash(seed + 23) > coverage || this.samplers.excludedAt(x, z)) continue;
                        const slope = this.samplers.heightAt(x + 1, z) - this.samplers.heightAt(x - 1, z);
                        const slopeZ = this.samplers.heightAt(x, z + 1) - this.samplers.heightAt(x, z - 1);
                        if (Math.hypot(slope, slopeZ) > 0.8) continue;
                        const height = this.settings.bladeHeight * (0.72 + hash(seed + 31) * 0.52);
                        const width = this.settings.bladeWidth * (0.78 + hash(seed + 47) * 0.44);
                        const rotation = Quaternion.FromEulerAngles(0, hash(seed + 59) * Math.PI * 2, 0);
                        const translation = new Vector3(x, this.samplers.heightAt(x, z) + 0.015, z);
                        const proceduralScale = new Vector3(width, height, width);
                        const importedScale = new Vector3(height, height, height);
                        nearMatrices.push(...Matrix.Compose(useImportedNear ? importedScale : proceduralScale, rotation, translation).m);
                        midMatrices.push(...Matrix.Compose(useImportedMid ? importedScale : proceduralScale, rotation, translation).m);
                    }
                }
                if (!nearMatrices.length) continue;
                const near = new Mesh(`grass:${patchX}:${patchZ}:near`, this.scene);
                const mid = new Mesh(`grass:${patchX}:${patchZ}:mid`, this.scene);
                nearGeometry.applyToMesh(near);
                midGeometry.applyToMesh(mid);
                near.material = this.nearMaterial;
                mid.material = this.midMaterial;
                near.isPickable = false;
                mid.isPickable = false;
                const nearBuffer = Float32Array.from(nearMatrices);
                const midBuffer = Float32Array.from(midMatrices);
                near.thinInstanceSetBuffer('matrix', nearBuffer, 16, false);
                mid.thinInstanceSetBuffer('matrix', midBuffer, 16, false);
                const instanceCount = nearBuffer.length / 16;
                near.thinInstanceCount = instanceCount;
                mid.thinInstanceCount = instanceCount;
                near.thinInstanceRefreshBoundingInfo(true);
                mid.thinInstanceRefreshBoundingInfo(true);
                near.setEnabled(false);
                mid.setEnabled(false);
                this.patches.push({
                    x: (patchX + 0.5) * PATCH_SIZE,
                    z: (patchZ + 0.5) * PATCH_SIZE,
                    instances: instanceCount,
                    near, mid, nearTriangles, midTriangles,
                });
            }
        }
        this.builtDensity = this.settings.density;
        this.builtGeometryKey = `${this.settings.bladeSource}:${this.settings.importedVariant}:${this.settings.bladeHeight}:${this.settings.bladeWidth}`;
    }

    /** Selects patch LODs and updates shared wind/interaction uniforms. */
    public update(context: GrassUpdateContext): void {
        const started = performance.now();
        const geometryKey = `${this.settings.bladeSource}:${this.settings.importedVariant}:${this.settings.bladeHeight}:${this.settings.bladeWidth}`;
        if (this.builtDensity !== this.settings.density || this.builtGeometryKey !== geometryKey) this.rebuild();
        const visualization = { final: 0, lod: 1, biome: 2, patches: 3 }[this.settings.visualization];
        const time = this.settings.freezeWind ? 0 : context.elapsedSeconds * this.settings.windSpeed;
        for (const material of [this.nearMaterial, this.midMaterial]) {
            material.setFloat('time', time);
            material.setVector2('wind', new Vector2(this.settings.windStrength, this.settings.windSpeed));
            material.setVector3('cameraPosition', context.cameraPosition);
            material.setFloat('interactionEnabled', this.settings.interaction ? 1 : 0);
            material.setFloat('visualization', visualization);
        }
        Object.assign(this.stats, { visiblePatches: 0, nearInstances: 0, midInstances: 0, triangles: 0, draws: 0 });
        for (const patch of this.patches) {
            const distance = Math.hypot(patch.x - context.cameraPosition.x, patch.z - context.cameraPosition.z);
            const nearVisible = this.settings.enabled && distance <= this.settings.nearDistance;
            const midVisible = this.settings.enabled && distance > this.settings.nearDistance && distance <= this.settings.farDistance;
            patch.near.setEnabled(nearVisible);
            patch.mid.setEnabled(midVisible);
            if (nearVisible) {
                this.stats.visiblePatches++;
                this.stats.nearInstances += patch.instances;
                this.stats.triangles += patch.instances * patch.nearTriangles;
                this.stats.draws++;
            } else if (midVisible) {
                this.stats.visiblePatches++;
                this.stats.midInstances += patch.instances;
                this.stats.triangles += patch.instances * patch.midTriangles;
                this.stats.draws++;
            }
        }
        this.stats.updateMs = performance.now() - started;
    }

    public dispose(): void {
        for (const patch of this.patches) { patch.near.dispose(); patch.mid.dispose(); }
        this.nearTemplate.dispose(); this.midTemplate.dispose();
        this.nearMaterial.dispose(); this.midMaterial.dispose();
    }
}
