import test from 'node:test';
import assert from 'node:assert/strict';
import { BIOME_NAMES } from '../config/biomes.ts';
import { TERRAIN_MATERIALS } from '../config/terrainMaterials.ts';
import { WORLD_CONFIG } from '../config/world.ts';
import { sampleBiomeWeights } from '../fields/biomes.ts';
import { sampleClimate } from '../fields/climate.ts';
import { sampleElevation, sampleTerrainDerivatives } from '../fields/elevation.ts';
import { fractalNoise2D, hash2D } from '../fields/noise.ts';
import { accumulateDirections, buildHydrology, classifyLakes, fillDepressions } from '../fields/hydrology.ts';
import { selectRiverNetwork } from '../fields/rivers.ts';
import { buildLandmarkClearance, selectLandmarks, type LandmarkCandidate } from '../fields/landmarks.ts';
import { paintRoadMask, roundRoadCorners, routeRoad, simplifyRoadPoints } from '../fields/roads.ts';
import { buildRoadGrade } from '../fields/roadGrading.ts';
import { generatePlacements, type PlacementPrototype } from '../fields/placements.ts';
import { inspectGlb } from '../fields/assetValidation.ts';
import { buildWaterRuntimeFields, buildWaterSurface, carveRiverBeds, detectWaterfalls } from '../fields/riverCarving.ts';
import {
    applyThermalErosion,
    bakeHeightValues,
    HeightField,
    type HeightFieldMetadata,
} from '../package/heightField.ts';
import { BiomeField, quantizeBiomeWeights, type BiomeFieldMetadata } from '../package/biomeField.ts';
import { BIOME_SURFACE_RESPONSE, blendSurfaceResponse } from '../config/surfaceResponse.ts';
import {
    assertValidWorldManifest,
    getWorldBounds,
    getWorldChunkCounts,
} from '../package/schema.ts';

test('world contract describes exact 2 km bounds and clipped edge chunks', () => {
    assert.doesNotThrow(() => assertValidWorldManifest(WORLD_CONFIG));
    assert.deepEqual(getWorldBounds(WORLD_CONFIG), {
        minX: -1_000,
        maxX: 1_000,
        minZ: -1_000,
        maxZ: 1_000,
    });
    assert.equal(WORLD_CONFIG.width / WORLD_CONFIG.heightResolution, 0.5);
    assert.equal(WORLD_CONFIG.width / WORLD_CONFIG.biomeResolution, 2);
    assert.deepEqual(getWorldChunkCounts(WORLD_CONFIG), [63, 63]);
    assert.equal(WORLD_CONFIG.width % WORLD_CONFIG.chunkSize, 16);
});

test('seeded field noise is deterministic, finite, and normalized', () => {
    for (let z = -8; z <= 8; z++) {
        for (let x = -8; x <= 8; x++) {
            const hash = hash2D(WORLD_CONFIG.seed, x, z);
            const first = fractalNoise2D(WORLD_CONFIG.seed, x / 7, z / 7);
            const second = fractalNoise2D(WORLD_CONFIG.seed, x / 7, z / 7);
            assert.equal(first, second);
            assert.ok(hash >= 0 && hash < 1);
            assert.ok(Number.isFinite(first) && first >= 0 && first < 1);
        }
    }
});

test('climate is deterministic and remains within normalized limits', () => {
    const input = { x: 120, z: -340, elevation: 86, waterProximity: 0.4, rainShadow: 0.2 };
    const first = sampleClimate(WORLD_CONFIG, input);
    assert.deepEqual(sampleClimate(WORLD_CONFIG, input), first);
    assert.ok(first.temperature >= 0 && first.temperature <= 1);
    assert.ok(first.moisture >= 0 && first.moisture <= 1);
});

test('elevation and derivatives are deterministic and finite across the exact world', () => {
    let minimum = Infinity;
    let maximum = -Infinity;
    for (let z = -1_000; z <= 1_000; z += 100) {
        for (let x = -1_000; x <= 1_000; x += 100) {
            const elevation = sampleElevation(WORLD_CONFIG, x, z);
            const derivatives = sampleTerrainDerivatives(WORLD_CONFIG, x, z);
            assert.equal(sampleElevation(WORLD_CONFIG, x, z), elevation);
            assert.ok(Number.isFinite(elevation));
            assert.ok(Number.isFinite(derivatives.slope));
            assert.ok(Number.isFinite(derivatives.curvature));
            assert.ok(Number.isFinite(derivatives.exposure));
            assert.ok(derivatives.slope >= 0 && derivatives.slope <= 1);
            assert.ok(derivatives.exposure >= 0 && derivatives.exposure <= 1);
            minimum = Math.min(minimum, elevation);
            maximum = Math.max(maximum, elevation);
        }
    }
    assert.ok(minimum < 20, `expected a low basin, sampled minimum ${minimum}`);
    assert.ok(maximum > 250, `expected mountain relief, sampled maximum ${maximum}`);
    assert.ok(maximum - minimum > 250, `expected broad relief, sampled range ${maximum - minimum}`);
});

test('baked texel centres and bilinear CPU sampling preserve a planar source', () => {
    const resolution = 16;
    const values = bakeHeightValues(WORLD_CONFIG, resolution, (x, z) => 20 + x * 0.05 - z * 0.025);
    const metadata: HeightFieldMetadata = {
        schema: 'exalted-height-field', version: 1,
        width: resolution, height: resolution,
        origin: WORLD_CONFIG.origin, extent: [WORLD_CONFIG.width, WORLD_CONFIG.depth],
        sampleSpacing: [WORLD_CONFIG.width / resolution, WORLD_CONFIG.depth / resolution],
        sampling: 'texel-centres', format: 'float32-le',
        minimum: -55, maximum: 95, mean: 20, sha256: 'test',
    };
    const field = new HeightField(metadata, values);
    for (const [x, z] of [[-500, -500], [0, 0], [375, -250], [500, 500]]) {
        const expected = 20 + x * 0.05 - z * 0.025;
        assert.ok(Math.abs(field.sample(x, z) - expected) < 1e-5);
    }
});

test('thermal erosion conserves terrain mass while relaxing a sharp peak', () => {
    const values = new Float32Array(9 * 9);
    values[4 * 9 + 4] = 100;
    const before = values.reduce((sum, value) => sum + value, 0);
    applyThermalErosion(values, 9, 9, 1, 8, 35, 0.25);
    const after = values.reduce((sum, value) => sum + value, 0);
    assert.ok(values[4 * 9 + 4] < 100);
    assert.ok(values[4 * 9 + 3] > 0);
    assert.ok(Math.abs(after - before) < 1e-3);
});

test('biome fields expose eight finite non-negative weights summing to one', () => {
    for (let z = -1_000; z <= 1_000; z += 125) {
        for (let x = -1_000; x <= 1_000; x += 125) {
            const climate = sampleClimate(WORLD_CONFIG, { x, z, elevation: (x + 1_000) * 0.08 });
            const weights = sampleBiomeWeights(WORLD_CONFIG, {
                x,
                z,
                elevation: (x + 1_000) * 0.08,
                slope: Math.abs(z) / 1_000,
                ...climate,
            });
            assert.deepEqual(Object.keys(weights), [...BIOME_NAMES]);
            const total = BIOME_NAMES.reduce((sum, name) => sum + weights[name], 0);
            assert.ok(Math.abs(total - 1) < 1e-12, `${x},${z}: ${total}`);
            for (const name of BIOME_NAMES) {
                assert.ok(Number.isFinite(weights[name]) && weights[name] >= 0, name);
            }
        }
    }
});

test('representative conditions produce the intended dominant biomes', () => {
    const desert = sampleBiomeWeights(WORLD_CONFIG, {
        x: 0, z: -800, elevation: 20, slope: 0.05, temperature: 0.95, moisture: 0.05,
    });
    const forest = sampleBiomeWeights(WORLD_CONFIG, {
        x: 0, z: 0, elevation: 80, slope: 0.08, temperature: 0.65, moisture: 0.88,
    });
    const rock = sampleBiomeWeights(WORLD_CONFIG, {
        x: 500, z: 400, elevation: 360, slope: 0.95, temperature: 0.4, moisture: 0.3,
    });
    const settlement = sampleBiomeWeights(WORLD_CONFIG, {
        x: -200, z: 100, elevation: 50, slope: 0.05, temperature: 0.6, moisture: 0.4,
        structuralOverride: 1,
    });
    assert.equal(Math.max(...BIOME_NAMES.map((name) => desert[name])), desert.desert);
    assert.equal(Math.max(...BIOME_NAMES.map((name) => forest[name])), forest.forest);
    assert.equal(Math.max(...BIOME_NAMES.map((name) => rock[name])), rock.rock);
    assert.equal(Math.max(...BIOME_NAMES.map((name) => settlement[name])), settlement.settlement);
});

test('biome quantization preserves a 255 total and CPU sampling renormalizes blends', () => {
    const source = sampleBiomeWeights(WORLD_CONFIG, {
        x: 42, z: -170, elevation: 70, slope: 0.22, temperature: 0.64, moisture: 0.51,
    });
    const packed = quantizeBiomeWeights(source);
    assert.equal(packed.reduce((sum, value) => sum + value, 0), 255);
    const metadata: BiomeFieldMetadata = {
        schema: 'exalted-biome-field', version: 1, width: 2, height: 2,
        origin: [0, 0], extent: [4, 4], sampleSpacing: [2, 2],
        sampling: 'texel-centres', format: 'rgba8-unorm',
        maps: ['biomes-0.rgba8', 'biomes-1.rgba8'], sha256: ['test', 'test'],
    };
    const map0 = new Uint8Array(16), map1 = new Uint8Array(16);
    for (let pixel = 0; pixel < 4; pixel++) {
        map0.set(packed.subarray(0, 4), pixel * 4);
        map1.set(packed.subarray(4, 8), pixel * 4);
    }
    const sampled = new BiomeField(metadata, map0, map1).sample(2, 2);
    const total = BIOME_NAMES.reduce((sum, name) => sum + sampled[name], 0);
    assert.ok(Math.abs(total - 1) < 1e-12);
});

test('surface response distinguishes snow, sand, wet ground, and firm terrain', () => {
    assert.ok(BIOME_SURFACE_RESPONSE.snow.compressionDepth > BIOME_SURFACE_RESPONSE.desert.compressionDepth);
    assert.ok(BIOME_SURFACE_RESPONSE.desert.bermRatio > BIOME_SURFACE_RESPONSE.snow.bermRatio);
    assert.equal(BIOME_SURFACE_RESPONSE.rock.compressionDepth, 0);
    assert.equal(BIOME_SURFACE_RESPONSE.settlement.compressionDepth, 0);
    const blended = blendSurfaceResponse({
        desert: 0.5, grassland: 0, forest: 0, snow: 0.5,
        rock: 0, wetland: 0, shore: 0, settlement: 0,
    });
    assert.ok(Math.abs(blended.compressionDepth - 0.36) < 1e-12);
    assert.ok(blended.hardness > BIOME_SURFACE_RESPONSE.snow.hardness);
});

test('hydrology routes every draining cell downhill and conserves upstream area', () => {
    const width = 4;
    const height = 3;
    const elevation = new Float32Array([
        9, 8, 7, 6,
        8, 7, 6, 5,
        7, 6, 5, 0,
    ]);
    const result = buildHydrology(elevation, width, height);
    assert.equal(result.sinks, 1);
    assert.equal(result.maximumAccumulation, width * height);
    assert.equal(result.accumulation[width * height - 1], width * height);
    assert.equal(result.direction[width * height - 1], 0);
    assert.deepEqual(buildHydrology(elevation, width, height).direction, result.direction);
});

test('priority flood fills and classifies a closed lake basin deterministically', () => {
    const width = 5;
    const elevation = new Float32Array([
        10, 10, 10, 10, 10,
        10,  4,  4,  4, 10,
        10,  4,  0,  4, 10,
        10,  4,  4,  4, 10,
        10, 10, 10, 10, 10,
    ]);
    const fill = fillDepressions(elevation, width, width);
    const lakes = classifyLakes(fill, width, width);
    const accumulation = accumulateDirections(fill.direction, width, width);
    assert.equal(fill.elevation[12], 10);
    assert.equal(fill.depth[12], 10);
    assert.equal(lakes.count, 1);
    assert.equal(lakes.largestCellCount, 9);
    assert.equal(lakes.mask[12], 255);
    assert.ok(Math.max(...accumulation) > 1);
    assert.deepEqual(fillDepressions(elevation, width, width).direction, fill.direction);
});

test('visible river selection obeys the one-primary two-small budget', () => {
    const width = 50;
    const height = 50;
    const direction = new Uint8Array(width * height).fill(4);
    const accumulation = new Float32Array(width * height).fill(500);
    const lakes = new Uint8Array(width * height);
    const network = selectRiverNetwork(direction, accumulation, lakes, width, height, {
        primaryCount: 1, smallCount: 2, minimumCells: 10, maximumSmallCells: 60,
        minimumSourceSeparation: 5, primaryWidth: 2, smallWidth: 1,
    });
    assert.equal(network.routes.filter((route) => route.kind === 'primary').length, 1);
    assert.equal(network.routes.filter((route) => route.kind === 'small').length, 2);
    assert.ok(network.mask.some((value) => value === 255));
    assert.ok(network.mask.some((value) => value === 150));
});

test('river carving is negative-only and waterfall detection stays on retained routes', () => {
    const route = { kind: 'primary' as const, cells: [6, 7, 8, 9] };
    const carve = carveRiverBeds([route], 5, 5, 2, 1, 2.4, 0.9);
    assert.ok(Math.abs(Math.min(...carve) + 2.4) < 1e-5);
    assert.equal(Math.max(...carve), 0);
    const elevation = new Float32Array(25);
    elevation[6] = 20; elevation[7] = 18; elevation[8] = 8; elevation[9] = 7;
    const falls = detectWaterfalls([route], elevation, 2, 7, 2, 4);
    assert.equal(falls.length, 1);
    assert.equal(falls[0].route, 0);
    assert.ok(falls[0].drop >= 7);
    const water = buildWaterSurface(
        new Float32Array([10, 10]), new Uint8Array([255, 0]), new Float32Array([12, 0]),
        new Uint8Array([0, 150]), new Float32Array([0, -2]),
        2, 1, [],
    );
    assert.deepEqual(water.mask, new Uint8Array([255, 150]));
    assert.deepEqual(water.surface, new Float32Array([12, 9.5]));
    const padded = buildWaterSurface(
        new Float32Array([10, 8, 6]), new Uint8Array([255, 0, 0]), new Float32Array([12, 0, 0]),
        new Uint8Array(3), new Float32Array(3), 3, 1, [], 1,
    );
    assert.deepEqual(padded.mask, new Uint8Array([255, 0, 0]));
    assert.equal(padded.surface[1], 12);
    const runtime = buildWaterRuntimeFields(
        new Uint8Array([255, 255, 0]), new Float32Array([12, 11, 6]),
        new Float32Array([10, 10, 6]), new Float32Array(3),
        new Uint8Array([255, 255, 0]),
        [{ kind: 'primary', cells: [0, 1] }], 3, 1,
    );
    assert.deepEqual(runtime.swimmable, new Uint8Array([255, 0, 0]));
    assert.deepEqual(runtime.shoreline, new Uint8Array([255, 255, 0]));
    assert.equal(runtime.uphillRiverSegments, 0);
    assert.equal(runtime.maximumLakeNeighbourDelta, 1);
});

test('landmark selection is deterministic, biome-driven, dry, and separated', () => {
    const weights = (desert: number, forest: number): LandmarkCandidate['weights'] => ({
        desert, forest, grassland: 0, snow: 0, rock: 0,
        wetland: 0, shore: 0, settlement: 0,
    });
    const candidates: LandmarkCandidate[] = [
        { x: 0, z: 0, elevation: 2, slope: 0.02, water: false, weights: weights(0.9, 0.1) },
        { x: 300, z: 0, elevation: 4, slope: 0.03, water: false, weights: weights(0.1, 0.9) },
        { x: 600, z: 0, elevation: 0, slope: 0, water: true, weights: weights(1, 0) },
    ];
    const requests = [{ name: 'Desert 1', biome: 'desert' as const }, { name: 'Forest 1', biome: 'forest' as const }];
    const selected = selectLandmarks(candidates, requests, 200);
    assert.deepEqual(selected.map((entry) => entry.name), ['Desert 1', 'Forest 1']);
    assert.equal(selected[0].x, 0);
    assert.equal(selected[1].x, 300);
    assert.deepEqual(selectLandmarks(candidates, requests, 200), selected);
    const clearance = buildLandmarkClearance(
        5, 5, [0, 0], [10, 10], [{ x: 5, z: 5, elevation: 10 }],
        () => 7, 2, 4,
    );
    assert.equal(clearance[12], 3);
    assert.equal(clearance[0], 0);
});

test('road routing is deterministic and avoids water cells', () => {
    const blocked = (x: number, z: number): boolean => x === 20 && z === 20;
    const route = routeRoad(
        { x: 0, z: 20 }, { x: 40, z: 20 }, [0, 0], 40, 40, 10,
        () => 0, blocked,
    );
    assert.ok(route.length >= 5);
    assert.ok(route.every((point) => !blocked(point.x, point.z)));
    assert.deepEqual(routeRoad(
        { x: 0, z: 20 }, { x: 40, z: 20 }, [0, 0], 40, 40, 10,
        () => 0, blocked,
    ), route);
});

test('road masks paint continuous segments and road points discard straight runs', () => {
    const points = simplifyRoadPoints([
        { x: 0, z: 0 }, { x: 10, z: 10 }, { x: 20, z: 20 },
        { x: 30, z: 20 }, { x: 40, z: 20 },
    ]);
    assert.deepEqual(points, [
        { x: 0, z: 0 }, { x: 20, z: 20 }, { x: 40, z: 20 },
    ]);
    const mask = paintRoadMask([{ from: 'A', to: 'B', points }], 9, [0, 0], [45, 45], 0);
    for (let cell = 0; cell <= 4; cell++) assert.equal(mask[cell * 9 + cell], 255);
    for (let cell = 4; cell <= 8; cell++) assert.equal(mask[4 * 9 + cell], 255);
});

test('road corner refinement rounds valid turns and preserves blocked corners', () => {
    const corner = [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 20 }];
    const rounded = roundRoadCorners(corner, 8, () => true, 2);
    assert.ok(rounded.length > corner.length);
    assert.deepEqual(rounded[0], corner[0]);
    assert.deepEqual(rounded[rounded.length - 1], corner[2]);
    assert.ok(rounded.some((point) => point.x < 20 && point.z > 0));
    const blocked = roundRoadCorners(corner, 8, (x, z) => !(x > 15 && z > 0), 2);
    assert.ok(blocked.some((point) => point.x === 20 && point.z === 0));
});

test('road grading changes only the road corridor and blends through its shoulder', () => {
    const grade = buildRoadGrade(
        [{ from: 'A', to: 'B', points: [{ x: 10, z: 50 }, { x: 90, z: 50 }] }],
        50, 50, [0, 0], [100, 100],
        (x) => x < 50 ? 0 : 8,
        4, 12, 0.12, 2,
    );
    assert.equal(grade[2 * 50 + 2], 0);
    assert.ok(grade[25 * 50 + 24] > 0);
    assert.ok(grade[25 * 50 + 25] < 0);
    assert.ok(Math.abs(grade[25 * 50 + 20]) < Math.abs(grade[25 * 50 + 24]));
    assert.ok(grade.every((offset) => Math.abs(offset) <= 4));
});

test('placement generation is deterministic, chunked, and respects exclusions', () => {
    const prototype: PlacementPrototype = {
        id: 'tree-1', spacing: 10, density: 1, biomeWeights: { forest: 1 }, maximumSlope: 0.5,
        scale: [0.8, 1.2], roadClearance: 4, waterClearance: 4, landmarkClearance: 10,
    };
    const context = {
        seed: 42, origin: [0, 0] as const, extent: [64, 64] as const, chunkSize: 32,
        biomeAt: () => ({ desert: 0, grassland: 0, forest: 1, snow: 0, rock: 0, wetland: 0, shore: 0, settlement: 0 }),
        heightAt: (x: number, z: number) => x + z,
        slopeAt: () => 0.1, excluded: (_prototype: PlacementPrototype, x: number) => x < 16,
    };
    const first = generatePlacements([prototype], context);
    assert.deepEqual(generatePlacements([prototype], context), first);
    assert.ok(first.length > 0);
    assert.ok(first.every((entry) => entry.x >= 16 && entry.chunkX >= 0 && entry.chunkX < 2 && entry.chunkZ >= 0 && entry.chunkZ < 2));
});

test('asset validation rejects malformed GLBs and reads structural counts', () => {
    assert.equal(inspectGlb(new Uint8Array(20)).valid, false);
    const jsonText = JSON.stringify({ asset: { version: '2.0' }, meshes: [{}], nodes: [{}], materials: [{}] });
    const paddedJson = jsonText.padEnd(Math.ceil(jsonText.length / 4) * 4, ' ');
    const bytes = new Uint8Array(20 + paddedJson.length);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.length, true);
    view.setUint32(12, paddedJson.length, true); view.setUint32(16, 0x4e4f534a, true);
    bytes.set(new TextEncoder().encode(paddedJson), 20);
    const inspection = inspectGlb(bytes);
    assert.equal(inspection.valid, true);
    assert.deepEqual([inspection.meshes, inspection.nodes, inspection.materials], [1, 1, 1]);
});

test('terrain material layers preserve biome order and array-compatible channels', () => {
    assert.deepEqual(TERRAIN_MATERIALS.layers.map((layer) => layer.biome), [...BIOME_NAMES]);
    assert.equal(new Set(TERRAIN_MATERIALS.layers.map((layer) => layer.id)).size, BIOME_NAMES.length);
    assert.ok(TERRAIN_MATERIALS.layers.every((layer) => layer.metresPerTile > 0 && layer.normalStrength >= 0));
    assert.deepEqual(TERRAIN_MATERIALS.arrayFormat.requiredDimensions, [2048, 2048]);
});
