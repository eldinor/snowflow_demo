import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Color3, Color4, Vector2, Vector3 } from '@babylonjs/core/Maths/math';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Constants } from '@babylonjs/core/Engines/constants';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Scene } from '@babylonjs/core/scene';
// Installs Scene.createPickingRay, which Babylon keeps as a tree-shaken side effect.
import '@babylonjs/core/Culling/ray';
import { BIOME_NAMES, type BiomeName } from '../config/biomes.ts';
import { WORLD_CONFIG } from '../config/world.ts';
import { sampleBiomeWeights } from '../fields/biomes.ts';
import { sampleClimate } from '../fields/climate.ts';
import { sampleElevation, sampleTerrainDerivatives } from '../fields/elevation.ts';
import { loadBakedHeightField } from './loadHeightField.ts';
import { loadBakedBiomeField } from './loadBiomeField.ts';
import { loadBakedHydrologyField } from './loadHydrologyField.ts';
import { loadGeneratedLandmarks } from './loadLandmarks.ts';
import { loadGeneratedRoads } from './loadRoads.ts';
import { registerGeneratedTerrainShaders } from './registerShaders.ts';
import { runHeightParityProbe } from './heightParity.ts';
import { runBiomeParityProbe } from './biomeParity.ts';
import { blendSurfaceResponse } from '../config/surfaceResponse.ts';
import {
    DEFORMATION_RESOLUTION,
    DEFORMATION_SIZE,
    DEFORMATION_MIN,
    DEFORMATION_RANGE,
    LocalDeformation,
} from './localDeformation.ts';
import {
    buildGeneratedClipmap,
    CLIPMAP_BASE_SPACING,
    CLIPMAP_GRID_HALF,
    CLIPMAP_LEVELS,
} from './clipmapMesh.ts';
import type { HeightField } from '../package/heightField.ts';

type FieldMode = 'composite' | 'elevation' | 'temperature' | 'moisture' | BiomeName;

const BIOME_COLORS: Readonly<Record<BiomeName, readonly [number, number, number]>> = {
    desert: [0.72, 0.50, 0.25],
    grassland: [0.28, 0.48, 0.20],
    forest: [0.08, 0.24, 0.14],
    snow: [0.88, 0.94, 0.96],
    rock: [0.28, 0.29, 0.28],
    wetland: [0.12, 0.31, 0.27],
    shore: [0.68, 0.62, 0.42],
    settlement: [0.62, 0.30, 0.18],
};

function requiredElement<T extends HTMLElement>(id: string, kind: new (...args: never[]) => T): T {
    const element = document.getElementById(id);
    if (!(element instanceof kind)) throw new Error(`Missing required #${id} element.`);
    return element;
}

function getPreviewColor(
    x: number,
    z: number,
    elevation: number,
    slope: number,
    mode: FieldMode,
): readonly [number, number, number] {
    const climate = sampleClimate(WORLD_CONFIG, { x, z, elevation });
    if (mode === 'elevation') {
        const height = Math.max(0, Math.min(1, (elevation + 18) / 538));
        return [height * 0.85, height * 0.9, height];
    }
    if (mode === 'temperature') return [climate.temperature, 0.18, 1 - climate.temperature];
    if (mode === 'moisture') return [0.12, climate.moisture * 0.65, climate.moisture];
    const weights = sampleBiomeWeights(WORLD_CONFIG, { x, z, elevation, slope, ...climate });
    if (mode !== 'composite') {
        const value = weights[mode];
        const tint = BIOME_COLORS[mode];
        return [tint[0] * value, tint[1] * value, tint[2] * value];
    }
    const result: [number, number, number] = [0, 0, 0];
    for (const biome of BIOME_NAMES) {
        const tint = BIOME_COLORS[biome];
        result[0] += tint[0] * weights[biome];
        result[1] += tint[1] * weights[biome];
        result[2] += tint[2] * weights[biome];
    }
    return result;
}

function pickHeightField(
    scene: Scene,
    field: HeightField,
    pointerX: number,
    pointerY: number,
): Vector3 | null {
    const ray = scene.createPickingRay(pointerX, pointerY, null, scene.activeCamera);
    let previousDistance = ray.origin.y - field.sample(ray.origin.x, ray.origin.z);
    let previousT = 0;
    for (let t = 20; t <= 5_000; t += 20) {
        const x = ray.origin.x + ray.direction.x * t;
        const y = ray.origin.y + ray.direction.y * t;
        const z = ray.origin.z + ray.direction.z * t;
        const distance = y - field.sample(x, z);
        if (previousDistance >= 0 && distance <= 0) {
            let low = previousT, high = t;
            for (let iteration = 0; iteration < 12; iteration++) {
                const middle = (low + high) * 0.5;
                const mx = ray.origin.x + ray.direction.x * middle;
                const my = ray.origin.y + ray.direction.y * middle;
                const mz = ray.origin.z + ray.direction.z * middle;
                if (my - field.sample(mx, mz) > 0) low = middle;
                else high = middle;
            }
            const hit = (low + high) * 0.5;
            return ray.origin.add(ray.direction.scale(hit));
        }
        previousDistance = distance;
        previousT = t;
    }
    return null;
}

async function boot(): Promise<void> {
    const canvas = requiredElement('view', HTMLCanvasElement);
    const status = requiredElement('status', HTMLElement);
    const field = requiredElement('field', HTMLSelectElement);
    const renderer = requiredElement('renderer', HTMLElement);
    const parity = requiredElement('parity', HTMLElement);
    const biomeParity = requiredElement('biome-parity', HTMLElement);
    const clearDeformation = requiredElement('clear-deformation', HTMLButtonElement);
    const deformationTool = requiredElement('deformation-tool', HTMLButtonElement);
    const cameraMode = requiredElement('camera-mode', HTMLButtonElement);
    const clipmapStats = requiredElement('clipmap-stats', HTMLElement);
    const frameTime = requiredElement('frame-time', HTMLElement);
    const deformationStatus = requiredElement('deformation-status', HTMLElement);
    const hydrologyStatus = requiredElement('hydrology-status', HTMLElement);
    const terrainShadows = requiredElement('terrain-shadows', HTMLInputElement);
    const waterVisible = requiredElement('water-visible', HTMLInputElement);
    const waterOpacity = requiredElement('water-opacity', HTMLInputElement);
    const waterOpacityValue = requiredElement('water-opacity-value', HTMLOutputElement);
    const waterValidation = requiredElement('water-validation', HTMLElement);
    const spawnPoint = requiredElement('spawn-point', HTMLSelectElement);
    const landmarkStatus = requiredElement('landmark-status', HTMLElement);
    const roadStatus = requiredElement('road-status', HTMLElement);
    if (!navigator.gpu) throw new Error('WebGPU is unavailable. Use a current desktop Chrome or Edge browser.');

    const engine = new WebGPUEngine(canvas, { antialias: true, powerPreference: 'high-performance' });
    await engine.initAsync();
    status.textContent = 'Loading authoritative height field…';
    const [bakedHeight, bakedBiomes, bakedHydrology, landmarks, roads] = await Promise.all([
        loadBakedHeightField(),
        loadBakedBiomeField(),
        loadBakedHydrologyField(),
        loadGeneratedLandmarks(),
        loadGeneratedRoads(),
    ]);
    registerGeneratedTerrainShaders();
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.075, 0.12, 0.15, 1);

    const camera = new ArcRotateCamera('generator-camera', -Math.PI / 2, 0.78, 1_700, Vector3.Zero(), scene);
    camera.lowerRadiusLimit = 120;
    camera.upperRadiusLimit = 3_500;
    camera.wheelPrecision = 0.7;
    camera.panningSensibility = 4;
    camera.attachControl(canvas, true);
    const walkStartX = 0;
    const walkStartZ = -520;
    const walkStartY = (bakedHeight?.sample(walkStartX, walkStartZ) ?? 0) + 7;
    const walkCamera = new UniversalCamera('generator-ground-camera', new Vector3(walkStartX, walkStartY, walkStartZ), scene);
    walkCamera.setTarget(new Vector3(0, walkStartY, -420));
    walkCamera.speed = 10;
    walkCamera.angularSensibility = 2_400;
    walkCamera.keysUp.push(87);
    walkCamera.keysDown.push(83);
    walkCamera.keysLeft.push(65);
    walkCamera.keysRight.push(68);

    const light = new HemisphericLight('generator-light', new Vector3(-0.35, 1, 0.2), scene);
    light.intensity = 1.25;
    light.groundColor = new Color3(0.08, 0.11, 0.12);

    // The analytic field contains roughly 8-10 m features. A 256² review mesh
    // gives its skyline adequate sampling until the full 0.5 m bake is wired in.
    const subdivisions = 256;
    const ground = CreateGround('generated-field-preview', {
        width: WORLD_CONFIG.width,
        height: WORLD_CONFIG.depth,
        subdivisions,
        updatable: true,
    }, scene);
    const positions = ground.getVerticesData(VertexBuffer.PositionKind);
    if (!positions) throw new Error('Preview ground has no position data.');
    const elevations = new Float32Array(positions.length / 3);
    const slopes = new Float32Array(positions.length / 3);
    for (let vertex = 0; vertex < positions.length / 3; vertex++) {
        const offset = vertex * 3;
        const x = positions[offset];
        const z = positions[offset + 2];
        const elevation = bakedHeight?.sample(x, z) ?? sampleElevation(WORLD_CONFIG, x, z);
        elevations[vertex] = elevation;
        slopes[vertex] = bakedHeight?.sampleDerivatives(x, z, 4).slope
            ?? sampleTerrainDerivatives(WORLD_CONFIG, x, z, 4).slope;
        if (!bakedHeight) positions[offset + 1] = elevation;
    }
    let gpuMaterial: ShaderMaterial | null = null;
    let waterMaterial: ShaderMaterial | null = null;
    let deformation: LocalDeformation | null = null;
    if (bakedHeight) {
        const heightTexture = RawTexture.CreateRTexture(
            bakedHeight.values,
            bakedHeight.metadata.width,
            bakedHeight.metadata.height,
            scene,
            false,
            false,
            Constants.TEXTURE_NEAREST_SAMPLINGMODE,
            Constants.TEXTURETYPE_FLOAT,
        );
        gpuMaterial = new ShaderMaterial(
            'generated-height-terrain',
            scene,
            'generatedHeightTerrain',
            {
                shaderLanguage: ShaderLanguage.WGSL,
                attributes: ['position', 'color'],
                uniforms: ['viewProjection', 'worldOrigin', 'worldExtent', 'heightRes', 'normalSampleStep', 'lightDirection', 'cameraPosition', 'biomeDebug', 'shadowDebug', 'hydrologyDebug', 'maximumAccumulation', 'deformCenter', 'deformSize', 'deformRes', 'deformEnabled', 'deformMinimum', 'deformRange', 'useClipmap', 'lodCenter', 'baseSpacing', 'gridHalfN', 'shadowEnabled'],
                samplers: ['heightTex', 'biomes0', 'biomes1', 'deformTex', 'hydrologyMasks', 'flowAccumulation', 'lakeSurface', 'riverCarve', 'waterDepth', 'shorelineMask', 'swimmableMask', 'landmarkClearance', 'roadMask', 'roadGrade', 'desertAlbedo', 'desertNormal', 'desertArm'],
            },
        );
        gpuMaterial.setTexture('heightTex', heightTexture);
        gpuMaterial.setVector2('worldOrigin', new Vector2(
            bakedHeight.metadata.origin[0],
            bakedHeight.metadata.origin[1],
        ));
        gpuMaterial.setVector2('worldExtent', new Vector2(
            bakedHeight.metadata.extent[0],
            bakedHeight.metadata.extent[1],
        ));
        gpuMaterial.setFloat('heightRes', bakedHeight.metadata.width);
        gpuMaterial.setFloat('normalSampleStep', 4);
        gpuMaterial.setVector3('lightDirection', new Vector3(-0.58, 0.52, 0.63).normalize());
        gpuMaterial.setVector3('cameraPosition', camera.position);
        gpuMaterial.setFloat('biomeDebug', bakedBiomes ? 0 : -1);
        const emptyBiome = new Uint8Array([0, 0, 0, 0]);
        const biomeTexture0 = RawTexture.CreateRGBATexture(
            bakedBiomes?.map0 ?? emptyBiome,
            bakedBiomes?.metadata.width ?? 1,
            bakedBiomes?.metadata.height ?? 1,
            scene, false, false, Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
        );
        const biomeTexture1 = RawTexture.CreateRGBATexture(
            bakedBiomes?.map1 ?? emptyBiome,
            bakedBiomes?.metadata.width ?? 1,
            bakedBiomes?.metadata.height ?? 1,
            scene, false, false, Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
        );
        gpuMaterial.setTexture('biomes0', biomeTexture0);
        gpuMaterial.setTexture('biomes1', biomeTexture1);
        const desertAlbedoTexture = new Texture(
            '/terrain/atlas/terrain_diff_atlas_2k.jpg?v=2', scene, false, false,
            Constants.TEXTURE_TRILINEAR_SAMPLINGMODE,
        );
        const desertNormalTexture = new Texture(
            '/terrain/atlas/terrain_nor_gl_atlas_2k.jpg?v=2', scene, false, false,
            Constants.TEXTURE_TRILINEAR_SAMPLINGMODE,
        );
        const desertArmTexture = new Texture(
            '/terrain/atlas/terrain_arm_atlas_2k.jpg?v=2', scene, false, false,
            Constants.TEXTURE_TRILINEAR_SAMPLINGMODE,
        );
        desertAlbedoTexture.gammaSpace = true;
        desertNormalTexture.gammaSpace = false;
        desertArmTexture.gammaSpace = false;
        for (const texture of [desertAlbedoTexture, desertNormalTexture, desertArmTexture]) {
            texture.wrapU = Texture.WRAP_ADDRESSMODE;
            texture.wrapV = Texture.WRAP_ADDRESSMODE;
            texture.anisotropicFilteringLevel = 8;
        }
        gpuMaterial.setTexture('desertAlbedo', desertAlbedoTexture);
        gpuMaterial.setTexture('desertNormal', desertNormalTexture);
        gpuMaterial.setTexture('desertArm', desertArmTexture);
        const hydrologyResolution = bakedHydrology?.metadata.width ?? 1;
        const hydrologyMasks = new Uint8Array(hydrologyResolution * hydrologyResolution * 4);
        for (let cell = 0; cell < hydrologyResolution * hydrologyResolution; cell++) {
            hydrologyMasks[cell * 4] = bakedHydrology?.direction[cell] ?? 0;
            hydrologyMasks[cell * 4 + 1] = bakedHydrology?.lakeMask[cell] ?? 0;
            hydrologyMasks[cell * 4 + 2] = bakedHydrology?.riverMask[cell] ?? 0;
            hydrologyMasks[cell * 4 + 3] = bakedHydrology?.waterfallMask[cell] ?? 0;
        }
        const hydrologyMasksTexture = RawTexture.CreateRGBATexture(
            hydrologyMasks, hydrologyResolution, hydrologyResolution,
            scene, false, false, Constants.TEXTURE_NEAREST_SAMPLINGMODE,
        );
        const flowAccumulationTexture = RawTexture.CreateRTexture(
            bakedHydrology?.accumulation ?? new Float32Array([1]),
            bakedHydrology?.metadata.width ?? 1,
            bakedHydrology?.metadata.height ?? 1,
            scene, false, false, Constants.TEXTURE_NEAREST_SAMPLINGMODE,
            Constants.TEXTURETYPE_FLOAT,
        );
        gpuMaterial.setTexture('hydrologyMasks', hydrologyMasksTexture);
        gpuMaterial.setTexture('flowAccumulation', flowAccumulationTexture);
        const lakeSurfaceTexture = RawTexture.CreateRTexture(
            bakedHydrology?.lakeSurface ?? new Float32Array([0]),
            bakedHydrology?.metadata.width ?? 1,
            bakedHydrology?.metadata.height ?? 1,
            scene, false, false, Constants.TEXTURE_NEAREST_SAMPLINGMODE,
            Constants.TEXTURETYPE_FLOAT,
        );
        gpuMaterial.setTexture('lakeSurface', lakeSurfaceTexture);
        const riverCarveTexture = RawTexture.CreateRTexture(
            bakedHydrology?.riverCarve ?? new Float32Array([0]),
            bakedHydrology?.metadata.width ?? 1,
            bakedHydrology?.metadata.height ?? 1,
            scene, false, false, Constants.TEXTURE_NEAREST_SAMPLINGMODE,
            Constants.TEXTURETYPE_FLOAT,
        );
        gpuMaterial.setTexture('riverCarve', riverCarveTexture);
        const waterDepthTexture = RawTexture.CreateRTexture(
            bakedHydrology?.waterDepth ?? new Float32Array([0]),
            bakedHydrology?.metadata.width ?? 1,
            bakedHydrology?.metadata.height ?? 1,
            scene, false, false, Constants.TEXTURE_NEAREST_SAMPLINGMODE,
            Constants.TEXTURETYPE_FLOAT,
        );
        const shorelineMaskTexture = RawTexture.CreateRTexture(
            bakedHydrology?.shorelineMask ?? new Uint8Array([0]),
            bakedHydrology?.metadata.width ?? 1,
            bakedHydrology?.metadata.height ?? 1,
            scene, false, false, Constants.TEXTURE_NEAREST_SAMPLINGMODE,
            Constants.TEXTURETYPE_UNSIGNED_BYTE,
        );
        const swimmableMaskTexture = RawTexture.CreateRTexture(
            bakedHydrology?.swimmableMask ?? new Uint8Array([0]),
            bakedHydrology?.metadata.width ?? 1,
            bakedHydrology?.metadata.height ?? 1,
            scene, false, false, Constants.TEXTURE_NEAREST_SAMPLINGMODE,
            Constants.TEXTURETYPE_UNSIGNED_BYTE,
        );
        gpuMaterial.setTexture('waterDepth', waterDepthTexture);
        gpuMaterial.setTexture('shorelineMask', shorelineMaskTexture);
        gpuMaterial.setTexture('swimmableMask', swimmableMaskTexture);
        const landmarkClearanceTexture = RawTexture.CreateRTexture(
            landmarks?.clearance ?? new Float32Array([0]),
            landmarks?.metadata.clearanceResolution[0] ?? 1,
            landmarks?.metadata.clearanceResolution[1] ?? 1,
            scene, false, false, Constants.TEXTURE_NEAREST_SAMPLINGMODE,
            Constants.TEXTURETYPE_FLOAT,
        );
        gpuMaterial.setTexture('landmarkClearance', landmarkClearanceTexture);
        const roadMaskTexture = RawTexture.CreateRTexture(
            roads?.mask ?? new Uint8Array([0]),
            roads?.metadata.resolution ?? 1,
            roads?.metadata.resolution ?? 1,
            scene, false, false, Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
            Constants.TEXTURETYPE_UNSIGNED_BYTE,
        );
        gpuMaterial.setTexture('roadMask', roadMaskTexture);
        const roadGradeTexture = RawTexture.CreateRTexture(
            roads?.grade ?? new Float32Array([0]),
            roads?.metadata.resolution ?? 1,
            roads?.metadata.resolution ?? 1,
            scene, false, false, Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
            Constants.TEXTURETYPE_FLOAT,
        );
        gpuMaterial.setTexture('roadGrade', roadGradeTexture);
        roadStatus.textContent = roads
            ? `${roads.metadata.routes.filter((route) => route.kind === 'road').length} roads · ${roads.metadata.routes.filter((route) => route.kind === 'trail').length} trails · ±${roads.metadata.maximumEarthwork.toFixed(0)} m`
            : 'Not generated';
        const waterMaskTexture = RawTexture.CreateRTexture(
            bakedHydrology?.waterMask ?? new Uint8Array([0]),
            bakedHydrology?.metadata.width ?? 1,
            bakedHydrology?.metadata.height ?? 1,
            scene, false, false, Constants.TEXTURE_NEAREST_SAMPLINGMODE,
            Constants.TEXTURETYPE_UNSIGNED_BYTE,
        );
        const waterSurfaceTexture = RawTexture.CreateRTexture(
            bakedHydrology?.waterSurface ?? new Float32Array([0]),
            bakedHydrology?.metadata.width ?? 1,
            bakedHydrology?.metadata.height ?? 1,
            scene, false, false, Constants.TEXTURE_NEAREST_SAMPLINGMODE,
            Constants.TEXTURETYPE_FLOAT,
        );
        gpuMaterial.setFloat('maximumAccumulation', bakedHydrology?.metadata.maximumAccumulation ?? 1);
        gpuMaterial.setFloat('hydrologyDebug', 0);
        hydrologyStatus.textContent = bakedHydrology
            ? `${bakedHydrology.metadata.lakes} lakes · ${bakedHydrology.metadata.rivers.length} rivers · ${bakedHydrology.metadata.waterfalls.length} falls`
            : 'Not baked';
        deformation = new LocalDeformation(scene);
        gpuMaterial.setTexture('deformTex', deformation.texture);
        gpuMaterial.setVector2('deformCenter', Vector2.Zero());
        gpuMaterial.setFloat('deformSize', DEFORMATION_SIZE);
        gpuMaterial.setFloat('deformRes', DEFORMATION_RESOLUTION);
        gpuMaterial.setFloat('deformEnabled', 0);
        gpuMaterial.setFloat('deformMinimum', DEFORMATION_MIN);
        gpuMaterial.setFloat('deformRange', DEFORMATION_RANGE);
        gpuMaterial.setFloat('useClipmap', 0);
        gpuMaterial.setVector2('lodCenter', Vector2.Zero());
        gpuMaterial.setFloat('baseSpacing', CLIPMAP_BASE_SPACING);
        gpuMaterial.setFloat('gridHalfN', CLIPMAP_GRID_HALF);
        ground.material = gpuMaterial;
        ground.alwaysSelectAsActiveMesh = true;
        renderer.textContent = 'GPU height texture';
        const parityResult = await runHeightParityProbe(scene, heightTexture, bakedHeight);
        parity.textContent = `${(parityResult.maximumError * 100).toFixed(3)} cm max`;
        parity.title = `${parityResult.samples} probes · ${(parityResult.meanError * 100).toFixed(4)} cm mean error`;
        if (parityResult.maximumError > 0.002) {
            throw new Error(`CPU/GPU height parity exceeded 0.2 cm: ${parityResult.maximumError.toFixed(6)} m.`);
        }
        if (bakedBiomes) {
            const result = await runBiomeParityProbe(
                scene,
                biomeTexture0,
                biomeTexture1,
                bakedBiomes,
            );
            biomeParity.textContent = `${(result.maximumError * 100).toFixed(4)}% max`;
            biomeParity.title = `${result.samples} probes · ${(result.meanError * 100).toFixed(5)}% mean weight error`;
            if (result.maximumError > 0.002) {
                throw new Error(`CPU/GPU biome parity exceeded 0.2%: ${(result.maximumError * 100).toFixed(5)}%.`);
            }
        } else {
            biomeParity.textContent = 'Unavailable';
        }
        const clipmap = buildGeneratedClipmap(scene);
        clipmap.material = gpuMaterial;
        ground.isVisible = false;
        gpuMaterial.setFloat('useClipmap', 1);
        const clipmapMetadata = clipmap.metadata as { triangles: number; vertices: number };
        const waterClipmap = CreateGround('generated-water-grid', {
            width: WORLD_CONFIG.width,
            height: WORLD_CONFIG.depth,
            subdivisions: 500,
        }, scene);
        waterClipmap.alwaysSelectAsActiveMesh = true;
        waterClipmap.freezeWorldMatrix();
        // Keep water in the opaque terrain's rendering group. Babylon sorts its
        // transparent material after opaque meshes while preserving terrain
        // depth, so water behind mountains remains occluded.
        waterClipmap.renderingGroupId = 0;
        waterMaterial = new ShaderMaterial('generated-water-material', scene, 'generatedWaterTerrain', {
            shaderLanguage: ShaderLanguage.WGSL,
            attributes: ['position'],
            uniforms: ['viewProjection', 'worldOrigin', 'worldExtent', 'waterRes', 'lodCenter', 'baseSpacing', 'gridHalfN', 'useClipmap', 'cameraPosition', 'time', 'waterOpacity', 'lightDirection'],
            samplers: ['waterMask', 'waterSurface', 'waterDepth'],
        });
        waterMaterial.setTexture('waterMask', waterMaskTexture);
        waterMaterial.setTexture('waterSurface', waterSurfaceTexture);
        waterMaterial.setTexture('waterDepth', waterDepthTexture);
        waterMaterial.setVector2('worldOrigin', new Vector2(bakedHeight.metadata.origin[0], bakedHeight.metadata.origin[1]));
        waterMaterial.setVector2('worldExtent', new Vector2(bakedHeight.metadata.extent[0], bakedHeight.metadata.extent[1]));
        waterMaterial.setFloat('waterRes', bakedHydrology?.metadata.width ?? 1);
        waterMaterial.setVector2('lodCenter', new Vector2(camera.target.x, camera.target.z));
        waterMaterial.setFloat('baseSpacing', CLIPMAP_BASE_SPACING);
        waterMaterial.setFloat('gridHalfN', CLIPMAP_GRID_HALF);
        waterMaterial.setFloat('useClipmap', 0);
        waterMaterial.setVector3('cameraPosition', camera.position);
        waterMaterial.setFloat('time', 0);
        waterMaterial.setFloat('waterOpacity', Number(waterOpacity.value));
        waterMaterial.setVector3('lightDirection', new Vector3(-0.35, 1, 0.2).normalize());
        waterMaterial.alpha = 0.78;
        waterMaterial.backFaceCulling = false;
        waterMaterial.disableDepthWrite = true;
        waterClipmap.material = waterMaterial;
        waterVisible.addEventListener('change', () => { waterClipmap.isVisible = waterVisible.checked; });
        waterOpacity.addEventListener('input', () => {
            const value = Number(waterOpacity.value);
            waterMaterial?.setFloat('waterOpacity', value);
            waterOpacityValue.value = `${Math.round(value * 100)}%`;
        });
        waterValidation.textContent = bakedHydrology
            ? `${bakedHydrology.metadata.validation.uphillRiverSegments} uphill · ${bakedHydrology.metadata.validation.maximumLakeNeighbourDelta.toFixed(3)} m lake Δ`
            : 'Unavailable';
        if (bakedHydrology) {
            waterValidation.title = `${bakedHydrology.metadata.validation.shorelineCells.toLocaleString()} shoreline cells · ${(bakedHydrology.metadata.validation.swimmableCells * 4 / 1_000_000).toFixed(2)} km² swimmable`;
        }
        gpuMaterial.setFloat('shadowEnabled', 1);
        gpuMaterial.setFloat('shadowDebug', 0);
        clipmapStats.textContent = `${CLIPMAP_LEVELS} rings · ${(clipmapMetadata.triangles / 1_000).toFixed(0)}k tris`;
    } else {
        const material = new StandardMaterial('generated-field-material', scene);
        material.diffuseColor = Color3.White();
        material.specularColor = Color3.Black();
        material.ambientColor = Color3.White();
        ground.material = material;
        const indices = ground.getIndices();
        if (!indices) throw new Error('Preview ground has no index data.');
        const normals = new Float32Array(positions.length);
        VertexData.ComputeNormals(positions, indices, normals);
        ground.updateVerticesData(VertexBuffer.PositionKind, positions);
        ground.setVerticesData(VertexBuffer.NormalKind, normals, true, 3);
        ground.refreshBoundingInfo();
        renderer.textContent = 'CPU analytic fallback';
        parity.textContent = 'Unavailable';
        biomeParity.textContent = 'Unavailable';
        clipmapStats.textContent = 'Unavailable';
    }
    const updateColors = (): void => {
        const selectedMode = field.value;
        const showsRoads = selectedMode === 'roads';
        const diagnosticOverlay = selectedMode === 'shadows'
            || selectedMode === 'flow-direction'
            || selectedMode === 'water-accumulation'
            || selectedMode === 'lake-basins'
            || selectedMode === 'rivers'
            || selectedMode === 'water-depth'
            || selectedMode === 'shorelines'
            || showsRoads;
        const mode = (diagnosticOverlay ? 'composite' : selectedMode) as FieldMode;
        gpuMaterial?.setFloat('shadowDebug', selectedMode === 'shadows' ? 1 : 0);
        gpuMaterial?.setFloat('hydrologyDebug', selectedMode === 'flow-direction' ? 1
            : selectedMode === 'water-accumulation' ? 2
                : selectedMode === 'lake-basins' ? 3 : 0);
        if (selectedMode === 'rivers') gpuMaterial?.setFloat('hydrologyDebug', 4);
        if (selectedMode === 'water-depth') gpuMaterial?.setFloat('hydrologyDebug', 5);
        if (selectedMode === 'shorelines') gpuMaterial?.setFloat('hydrologyDebug', 6);
        if (showsRoads) gpuMaterial?.setFloat('hydrologyDebug', 7);
        const biomeIndex = BIOME_NAMES.indexOf(mode as BiomeName);
        const diagnosticMode = mode === 'elevation' ? -2
            : mode === 'temperature' ? -3
                : mode === 'moisture' ? -4 : -1;
        gpuMaterial?.setFloat(
            'biomeDebug',
            bakedBiomes && mode === 'composite' ? 0
                : bakedBiomes && biomeIndex >= 0 ? biomeIndex + 1 : diagnosticMode,
        );
        const colors = new Float32Array((positions.length / 3) * 4);
        for (let vertex = 0; vertex < positions.length / 3; vertex++) {
            const color = getPreviewColor(
                positions[vertex * 3],
                positions[vertex * 3 + 2],
                elevations[vertex],
                slopes[vertex],
                mode,
            );
            colors[vertex * 4] = color[0];
            colors[vertex * 4 + 1] = color[1];
            colors[vertex * 4 + 2] = color[2];
            colors[vertex * 4 + 3] = 1;
        }
        ground.setVerticesData(VertexBuffer.ColorKind, colors, true, 4);
    };
    updateColors();
    field.addEventListener('change', updateColors);
    cameraMode.addEventListener('click', () => {
        if (scene.activeCamera === camera) {
            camera.detachControl();
            scene.activeCamera = walkCamera;
            walkCamera.attachControl(canvas, true);
            cameraMode.textContent = 'Return to overview';
        } else {
            walkCamera.detachControl();
            scene.activeCamera = camera;
            camera.attachControl(canvas, true);
            cameraMode.textContent = 'Enter ground view';
        }
    });
    if (landmarks) {
        for (const landmark of landmarks.metadata.landmarks) {
            const option = document.createElement('option');
            option.value = landmark.name;
            option.textContent = landmark.name;
            spawnPoint.append(option);
        }
        landmarkStatus.textContent = `${landmarks.metadata.landmarks.length} generated`;
        spawnPoint.addEventListener('change', () => {
            const landmark = landmarks.metadata.landmarks.find((entry) => entry.name === spawnPoint.value);
            if (!landmark) return;
            const [x, y, z] = landmark.position;
            camera.setTarget(new Vector3(x, y, z));
            camera.radius = 180;
            walkCamera.position.set(x, y + 2, z - 12);
            walkCamera.setTarget(new Vector3(x, y + 2, z + 20));
        });
    } else {
        landmarkStatus.textContent = 'Not generated';
    }

    clearDeformation.addEventListener('click', () => {
        deformation?.clear();
        gpuMaterial?.setFloat('deformEnabled', 0);
        deformationStatus.textContent = 'None';
    });
    terrainShadows.addEventListener('change', () => {
        gpuMaterial?.setFloat('shadowEnabled', terrainShadows.checked ? 1 : 0);
    });
    let deformationToolEnabled = false;
    deformationTool.addEventListener('click', () => {
        deformationToolEnabled = !deformationToolEnabled;
        deformationTool.textContent = `Deformation tool: ${deformationToolEnabled ? 'On' : 'Off'}`;
        deformationTool.classList.toggle('active', deformationToolEnabled);
        deformationStatus.textContent = deformationToolEnabled ? 'Click terrain' : 'None';
    });
    window.addEventListener('pointerdown', (event) => {
        if (!event.composedPath().includes(canvas)) return;
        if ((!deformationToolEnabled && !event.shiftKey)
            || !deformation || !gpuMaterial || !bakedBiomes || !bakedHeight) return;
        event.preventDefault();
        event.stopPropagation();
        deformationStatus.textContent = 'Picking terrain…';
        const bounds = canvas.getBoundingClientRect();
        const pointerX = event.clientX - bounds.left;
        const pointerY = event.clientY - bounds.top;
        const point = pickHeightField(scene, bakedHeight, pointerX, pointerY);
        if (!point) {
            deformationStatus.textContent = 'No terrain hit';
            return;
        }
        const weights = bakedBiomes.sample(point.x, point.z);
        const dominantBiome = BIOME_NAMES.reduce((best, name) => weights[name] > weights[best] ? name : best);
        const response = blendSurfaceResponse(weights);
        if (!deformation.stamp(point.x, point.z, response, 18, 0.82)) {
            deformationStatus.textContent = `${dominantBiome} · firm`;
            return;
        }
        gpuMaterial.setVector2('deformCenter', new Vector2(deformation.centerX, deformation.centerZ));
        gpuMaterial.setFloat('deformEnabled', 1);
        deformationStatus.textContent = `${dominantBiome} · ${(response.compressionDepth * 100).toFixed(1)} cm`;
    }, { capture: true });

    const frameSamples = new Float32Array(60);
    let frameSample = 0;
    let frameCount = 0;
    let lastFrame = performance.now();
    scene.onBeforeRenderObservable.add(() => {
        const activeCamera = scene.activeCamera ?? camera;
        gpuMaterial?.setVector3('cameraPosition', activeCamera.position);
        const lodX = activeCamera === camera ? camera.target.x : activeCamera.position.x;
        const lodZ = activeCamera === camera ? camera.target.z : activeCamera.position.z;
        gpuMaterial?.setVector2('lodCenter', new Vector2(lodX, lodZ));
        waterMaterial?.setVector2('lodCenter', new Vector2(lodX, lodZ));
        waterMaterial?.setVector3('cameraPosition', activeCamera.position);
        waterMaterial?.setFloat('time', performance.now() * 0.001);
        if (activeCamera === walkCamera && bakedHeight) {
            walkCamera.position.x = Math.max(-995, Math.min(995, walkCamera.position.x));
            walkCamera.position.z = Math.max(-995, Math.min(995, walkCamera.position.z));
            walkCamera.position.y = Math.max(
                walkCamera.position.y,
                bakedHeight.sample(walkCamera.position.x, walkCamera.position.z) + 2,
            );
        }
        const now = performance.now();
        frameSamples[frameSample] = now - lastFrame;
        frameSample = (frameSample + 1) % frameSamples.length;
        frameCount++;
        lastFrame = now;
        if (frameCount % 30 === 0) {
            const count = Math.min(frameCount, frameSamples.length);
            let total = 0;
            for (let index = 0; index < count; index++) total += frameSamples[index];
            frameTime.textContent = `${(total / count).toFixed(2)} ms`;
        }
    });

    engine.runRenderLoop(() => scene.render());
    window.addEventListener('resize', () => engine.resize());
    status.textContent = bakedHeight
        ? `Ready · baked ${bakedHeight.metadata.width}² height · ${bakedBiomes?.metadata.width ?? 0}² biomes`
        : 'Ready · analytic height fallback (run npm run generator:height)';
}

boot().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const status = document.getElementById('status');
    if (status) status.textContent = `Startup failed · ${message}`;
    console.error('[exalted-generator]', error);
});
