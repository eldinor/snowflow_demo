import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORLD_CONFIG } from '../config/world.ts';
import { buildLandmarkClearance, selectLandmarks, type LandmarkCandidate, type LandmarkRequest } from '../fields/landmarks.ts';
import { BiomeField, type BiomeFieldMetadata } from '../package/biomeField.ts';
import { HeightField, type HeightFieldMetadata } from '../package/heightField.ts';
import type { HydrologyFieldMetadata } from '../package/hydrologyField.ts';
import type { LandmarkMetadata } from '../package/landmarks.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'work/generated-world');
const [heightText, heightBytes, biomeText, biome0, biome1, hydrologyText, waterMask] = await Promise.all([
    readFile(resolve(output, 'height.json'), 'utf8'), readFile(resolve(output, 'height.f32')),
    readFile(resolve(output, 'biomes.json'), 'utf8'), readFile(resolve(output, 'biomes-0.rgba8')), readFile(resolve(output, 'biomes-1.rgba8')),
    readFile(resolve(output, 'hydrology.json'), 'utf8'), readFile(resolve(output, 'water-mask.u8')),
]);
const heightMetadata = JSON.parse(heightText) as HeightFieldMetadata;
const height = new HeightField(heightMetadata, new Float32Array(heightBytes.buffer, heightBytes.byteOffset, heightBytes.byteLength / 4));
const biomeMetadata = JSON.parse(biomeText) as BiomeFieldMetadata;
const biomes = new BiomeField(biomeMetadata, new Uint8Array(biome0), new Uint8Array(biome1));
const hydrology = JSON.parse(hydrologyText) as HydrologyFieldMetadata;
const water = new Uint8Array(waterMask);
const candidates: LandmarkCandidate[] = [];
const step = 10;
for (let z = WORLD_CONFIG.origin[1] + 40; z < WORLD_CONFIG.origin[1] + WORLD_CONFIG.depth - 40; z += step) {
    for (let x = WORLD_CONFIG.origin[0] + 40; x < WORLD_CONFIG.origin[0] + WORLD_CONFIG.width - 40; x += step) {
        const waterX = Math.max(0, Math.min(hydrology.width - 1, Math.floor((x - hydrology.origin[0]) / hydrology.extent[0] * hydrology.width)));
        const waterZ = Math.max(0, Math.min(hydrology.height - 1, Math.floor((z - hydrology.origin[1]) / hydrology.extent[1] * hydrology.height)));
        candidates.push({
            x, z,
            elevation: height.sample(x, z),
            slope: height.sampleDerivatives(x, z, 4).slope,
            water: water[waterZ * hydrology.width + waterX] > 0,
            weights: biomes.sample(x, z),
        });
    }
}
const requests: LandmarkRequest[] = [
    { name: 'Desert 1', biome: 'desert' },
    { name: 'Forest 1', biome: 'forest' },
    { name: 'Grass 1', biome: 'grassland' },
    { name: 'Grass 2', biome: 'grassland' },
    { name: 'Snow 1', biome: 'snow' },
    { name: 'Rock 1', biome: 'rock', maximumSlope: 0.35 },
    { name: 'Lakeside 1', biome: 'lakeside', maximumSlope: 0.15 },
];
const minimumSeparation = 220;
const selected = selectLandmarks(candidates, requests, minimumSeparation);
const clearanceResolution = WORLD_CONFIG.waterResolution;
const clearanceRadii = [18, 32] as const;
const maximumClearanceAdjustment = 4;
const clearance = buildLandmarkClearance(
    clearanceResolution, clearanceResolution,
    WORLD_CONFIG.origin, [WORLD_CONFIG.width, WORLD_CONFIG.depth],
    selected,
    (x, z) => height.sample(x, z),
    clearanceRadii[0], clearanceRadii[1],
    maximumClearanceAdjustment,
);
const metadata: LandmarkMetadata = {
    schema: 'exalted-landmarks', version: 1, minimumSeparation,
    clearance: 'landmark-clearance.f32',
    clearanceResolution: [clearanceResolution, clearanceResolution],
    clearanceRadii,
    maximumClearanceAdjustment,
    landmarks: selected.map((landmark) => ({
        name: landmark.name,
        biome: landmark.biome,
        position: [landmark.x, landmark.elevation + 2, landmark.z],
        slope: landmark.slope,
    })),
};
await Promise.all([
    writeFile(resolve(output, 'landmarks.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8'),
    writeFile(resolve(output, metadata.clearance), new Uint8Array(clearance.buffer)),
]);
console.log(`[generator] wrote ${metadata.landmarks.length} landmarks`);
for (const landmark of metadata.landmarks) console.log(`[generator] ${landmark.name}: ${landmark.position.map((value) => value.toFixed(1)).join(', ')} slope=${landmark.slope.toFixed(3)}`);
