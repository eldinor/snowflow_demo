import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Color3, Color4, Vector3 } from '@babylonjs/core/Maths/math';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Scene } from '@babylonjs/core/scene';
import { loadBakedHeightField } from '../preview/loadHeightField.ts';
import { loadBakedBiomeField } from '../preview/loadBiomeField.ts';
import { loadBakedHydrologyField } from '../preview/loadHydrologyField.ts';
import { loadGeneratedRoads } from '../preview/loadRoads.ts';
import { GrassSystem } from './GrassSystem.ts';
import { loadImportedGrass } from './ImportedGrass.ts';
import type { GrassSettings } from './grassTypes.ts';

const CENTRE_X = -250;
const CENTRE_Z = 60;
const TERRAIN_SIZE = 280;

function element<T extends HTMLElement>(id: string, constructor: new (...args: never[]) => T): T {
    const value = document.getElementById(id);
    if (!(value instanceof constructor)) throw new Error(`Missing #${id}.`);
    return value;
}

function fieldIndex(x: number, z: number, metadata: { width: number; height: number; origin: readonly [number, number]; sampleSpacing: readonly [number, number] }): number {
    const ix = Math.max(0, Math.min(metadata.width - 1, Math.floor((x - metadata.origin[0]) / metadata.sampleSpacing[0])));
    const iz = Math.max(0, Math.min(metadata.height - 1, Math.floor((z - metadata.origin[1]) / metadata.sampleSpacing[1])));
    return iz * metadata.width + ix;
}

async function boot(): Promise<void> {
    if (!navigator.gpu) throw new Error('Grass Lab requires WebGPU.');
    const canvas = element('view', HTMLCanvasElement);
    const status = element('status', HTMLElement);
    const engine = new WebGPUEngine(canvas, { antialias: true, powerPreference: 'high-performance' });
    await engine.initAsync();
    const [heightField, biomeField, hydrology, roads] = await Promise.all([
        loadBakedHeightField(), loadBakedBiomeField(), loadBakedHydrologyField(), loadGeneratedRoads(),
    ]);
    if (!heightField || !biomeField) throw new Error('Generate the height and biome fields before opening Grass Lab.');

    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.36, 0.48, 0.54, 1);
    scene.ambientColor = new Color3(0.18, 0.22, 0.18);
    const light = new HemisphericLight('grass-lab-light', new Vector3(-0.4, 1, -0.25), scene);
    light.intensity = 1.15;
    light.groundColor = new Color3(0.08, 0.12, 0.07);

    const baseHeight = heightField.sample(CENTRE_X, CENTRE_Z);
    const groundCamera = new UniversalCamera('grass-ground-camera', new Vector3(CENTRE_X, baseHeight + 1.72, CENTRE_Z - 14), scene);
    groundCamera.setTarget(new Vector3(CENTRE_X, baseHeight + 1.6, CENTRE_Z + 10));
    groundCamera.speed = 0.8;
    groundCamera.angularSensibility = 2600;
    groundCamera.keysUp.push(87); groundCamera.keysDown.push(83); groundCamera.keysLeft.push(65); groundCamera.keysRight.push(68);
    groundCamera.attachControl(canvas, true);
    const overviewCamera = new ArcRotateCamera('grass-overview-camera', -Math.PI / 2, 0.76, 105, new Vector3(CENTRE_X, baseHeight, CENTRE_Z), scene);
    overviewCamera.lowerRadiusLimit = 35;
    overviewCamera.upperRadiusLimit = 260;
    overviewCamera.wheelPrecision = 1.5;
    scene.activeCamera = groundCamera;

    const terrain = CreateGround('grass-lab-terrain', { width: TERRAIN_SIZE, height: TERRAIN_SIZE, subdivisions: 180, updatable: true }, scene);
    terrain.position.x = CENTRE_X;
    terrain.position.z = CENTRE_Z;
    const positions = terrain.getVerticesData(VertexBuffer.PositionKind)!;
    const colors: number[] = [];
    for (let offset = 0; offset < positions.length; offset += 3) {
        const x = positions[offset] + CENTRE_X;
        const z = positions[offset + 2] + CENTRE_Z;
        positions[offset + 1] = heightField.sample(x, z);
        const weights = biomeField.sample(x, z);
        const green = Math.max(weights.grassland, weights.forest * 0.55, weights.wetland * 0.6);
        colors.push(0.20 + green * 0.10, 0.25 + green * 0.20, 0.13 + green * 0.08, 1);
    }
    const indices = terrain.getIndices()!;
    const normals = new Array<number>(positions.length);
    VertexData.ComputeNormals(positions, indices, normals);
    terrain.setVerticesData(VertexBuffer.PositionKind, positions, true);
    terrain.setVerticesData(VertexBuffer.NormalKind, normals, true);
    terrain.setVerticesData(VertexBuffer.ColorKind, colors, true);
    terrain.refreshBoundingInfo();
    const terrainMaterial = new StandardMaterial('grass-lab-ground', scene);
    terrainMaterial.diffuseColor = Color3.White();
    terrainMaterial.specularColor = new Color3(0.03, 0.03, 0.025);
    terrain.useVertexColors = true;
    terrain.material = terrainMaterial;

    const settings: GrassSettings = {
        enabled: true, density: 2, nearDistance: 22, farDistance: 70,
        bladeHeight: 0.85, bladeWidth: 0.045, windStrength: 0.3, windSpeed: 1,
        interaction: true, freezeWind: false, visualization: 'final',
        bladeSource: 'procedural', importedVariant: 'grass_medium_01_tall_a_LOD2',
    };
    const grass = new GrassSystem(scene, {
        heightAt: (x, z) => heightField.sample(x, z),
        grassWeightAt: (x, z) => {
            const weights = biomeField.sample(x, z);
            return Math.max(weights.grassland, weights.forest * 0.32, weights.wetland * 0.45);
        },
        excludedAt: (x, z) => {
            const wet = hydrology ? hydrology.waterMask[fieldIndex(x, z, hydrology.metadata)] > 0 : false;
            const road = roads ? roads.mask[fieldIndex(x, z, {
                width: roads.metadata.resolution,
                height: roads.metadata.resolution,
                origin: heightField.metadata.origin,
                sampleSpacing: [
                    heightField.metadata.extent[0] / roads.metadata.resolution,
                    heightField.metadata.extent[1] / roads.metadata.resolution,
                ],
            })] > 18 : false;
            return wet || road;
        },
    }, settings);
    status.textContent = 'Loading imported grass prototypes…';
    const importedPrototypes = await loadImportedGrass(scene);
    grass.setImportedPrototypes(importedPrototypes);

    const proxy = CreateSphere('interaction-proxy', { diameter: 0.34, segments: 12 }, scene);
    const proxyMaterial = new StandardMaterial('interaction-proxy-material', scene);
    proxyMaterial.emissiveColor = new Color3(0.72, 0.88, 0.72);
    proxyMaterial.alpha = 0.65;
    proxy.material = proxyMaterial;
    proxy.isPickable = false;

    const bindRange = (id: string, outputId: string, apply: (value: number) => void, format: (value: number) => string): void => {
        const input = element(id, HTMLInputElement);
        const output = element(outputId, HTMLOutputElement);
        const update = (): void => { const value = Number(input.value); apply(value); output.value = format(value); };
        input.addEventListener('input', update); update();
    };
    element('enabled', HTMLInputElement).addEventListener('change', event => { settings.enabled = (event.currentTarget as HTMLInputElement).checked; });
    element('interaction', HTMLInputElement).addEventListener('change', event => { settings.interaction = (event.currentTarget as HTMLInputElement).checked; });
    element('freeze-wind', HTMLInputElement).addEventListener('change', event => { settings.freezeWind = (event.currentTarget as HTMLInputElement).checked; });
    bindRange('density', 'density-value', value => { settings.density = value; }, value => `${value.toFixed(1)}×`);
    bindRange('near', 'near-value', value => { settings.nearDistance = value; }, value => `${value.toFixed(0)} m`);
    bindRange('far', 'far-value', value => { settings.farDistance = value; }, value => `${value.toFixed(0)} m`);
    bindRange('height', 'height-value', value => { settings.bladeHeight = value; grass.rebuild(); }, value => `${value.toFixed(2)} m`);
    bindRange('width', 'width-value', value => { settings.bladeWidth = value; grass.rebuild(); }, value => `${(value * 100).toFixed(1)} cm`);
    bindRange('wind', 'wind-value', value => { settings.windStrength = value; }, value => value.toFixed(2));
    bindRange('wind-speed', 'wind-speed-value', value => { settings.windSpeed = value; }, value => value.toFixed(1));
    element('visualization', HTMLSelectElement).addEventListener('change', event => { settings.visualization = (event.currentTarget as HTMLSelectElement).value as GrassSettings['visualization']; });
    const bladeSource = element('blade-source', HTMLSelectElement);
    const importedVariant = element('imported-variant', HTMLSelectElement);
    bladeSource.addEventListener('change', () => {
        settings.bladeSource = bladeSource.value as GrassSettings['bladeSource'];
        importedVariant.disabled = settings.bladeSource === 'procedural';
        grass.rebuild();
    });
    importedVariant.addEventListener('change', () => {
        settings.importedVariant = importedVariant.value;
        grass.rebuild();
    });
    importedVariant.disabled = true;

    let groundMode = true;
    const cameraMode = element('camera-mode', HTMLButtonElement);
    const selectCamera = (): void => {
        groundCamera.detachControl(); overviewCamera.detachControl();
        scene.activeCamera = groundMode ? groundCamera : overviewCamera;
        scene.activeCamera.attachControl(canvas, true);
        cameraMode.textContent = `Camera: ${groundMode ? 'Ground' : 'Overview'}`;
    };
    cameraMode.addEventListener('click', () => { groundMode = !groundMode; selectCamera(); });
    element('reset-camera', HTMLButtonElement).addEventListener('click', () => {
        groundCamera.position.set(CENTRE_X, baseHeight + 1.72, CENTRE_Z - 14);
        groundCamera.setTarget(new Vector3(CENTRE_X, baseHeight + 1.6, CENTRE_Z + 10));
        overviewCamera.setPosition(new Vector3(CENTRE_X, baseHeight + 78, CENTRE_Z - 72));
        overviewCamera.setTarget(new Vector3(CENTRE_X, baseHeight, CENTRE_Z));
    });

    const frameSamples: number[] = [];
    let elapsed = 0;
    let lastStats = 0;
    scene.onBeforeRenderObservable.add(() => {
        const delta = Math.min(engine.getDeltaTime(), 50) / 1000;
        elapsed += delta;
        if (groundMode) {
            groundCamera.position.y = heightField.sample(groundCamera.position.x, groundCamera.position.z) + 1.72;
            proxy.position.set(groundCamera.position.x, heightField.sample(groundCamera.position.x, groundCamera.position.z) + 0.18, groundCamera.position.z);
        } else {
            proxy.position.set(overviewCamera.target.x, heightField.sample(overviewCamera.target.x, overviewCamera.target.z) + 0.18, overviewCamera.target.z);
        }
        proxy.setEnabled(settings.interaction);
        grass.update({ cameraPosition: proxy.position, elapsedSeconds: elapsed });
        frameSamples.push(engine.getDeltaTime());
        if (frameSamples.length > 180) frameSamples.shift();
        if (performance.now() - lastStats > 400) {
            const sorted = [...frameSamples].sort((a, b) => a - b);
            const median = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
            const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
            element('frame', HTMLElement).textContent = `${median.toFixed(1)} / ${p95.toFixed(1)} ms`;
            element('cpu', HTMLElement).textContent = `${grass.stats.updateMs.toFixed(2)} ms`;
            element('patches', HTMLElement).textContent = String(grass.stats.visiblePatches);
            element('instances', HTMLElement).textContent = `${grass.stats.nearInstances.toLocaleString()} / ${grass.stats.midInstances.toLocaleString()}`;
            element('triangles', HTMLElement).textContent = grass.stats.triangles.toLocaleString();
            element('draws', HTMLElement).textContent = String(grass.stats.draws);
            const [nearTriangles, midTriangles] = grass.getPrototypeTriangleCounts();
            element('prototype-tris', HTMLElement).textContent = `${nearTriangles.toLocaleString()} / ${midTriangles.toLocaleString()}`;
            lastStats = performance.now();
        }
    });

    window.addEventListener('keydown', event => { groundCamera.speed = event.shiftKey ? 3.2 : 0.8; });
    window.addEventListener('keyup', () => { groundCamera.speed = 0.8; });
    window.addEventListener('resize', () => engine.resize());
    status.textContent = 'Ready · deterministic blades on Grass 1';
    engine.runRenderLoop(() => scene.render());
}

boot().catch(error => {
    console.error(error);
    const status = document.getElementById('status');
    if (status) status.textContent = `Startup failed — ${error instanceof Error ? error.message : String(error)}`;
});
