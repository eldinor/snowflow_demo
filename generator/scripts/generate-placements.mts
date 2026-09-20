import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORLD_CONFIG } from '../config/world.ts';
import { ASSET_CATALOG } from '../config/assets.ts';
import { generatePlacements } from '../fields/placements.ts';
import { BiomeField, type BiomeFieldMetadata } from '../package/biomeField.ts';
import { HeightField, type HeightFieldMetadata } from '../package/heightField.ts';
import type { HydrologyFieldMetadata } from '../package/hydrologyField.ts';
import type { LandmarkMetadata } from '../package/landmarks.ts';
import type { PlacementMetadata } from '../package/placements.ts';
import type { RoadMetadata } from '../package/roads.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'work/generated-world');
const texts = await Promise.all(['height.json', 'biomes.json', 'hydrology.json', 'landmarks.json', 'roads.json'].map((file) => readFile(resolve(output, file), 'utf8')));
const heightMetadata = JSON.parse(texts[0]) as HeightFieldMetadata;
const biomeMetadata = JSON.parse(texts[1]) as BiomeFieldMetadata;
const hydrology = JSON.parse(texts[2]) as HydrologyFieldMetadata;
const landmarks = JSON.parse(texts[3]) as LandmarkMetadata;
const roads = JSON.parse(texts[4]) as RoadMetadata;
const [heightBytes, biome0, biome1, water, riverCarveBytes, clearanceBytes, roadMask, roadGradeBytes] = await Promise.all([
    readFile(resolve(output, 'height.f32')), readFile(resolve(output, biomeMetadata.maps[0])), readFile(resolve(output, biomeMetadata.maps[1])),
    readFile(resolve(output, hydrology.waterMask)), readFile(resolve(output, hydrology.riverCarve)), readFile(resolve(output, landmarks.clearance)),
    readFile(resolve(output, roads.mask)), readFile(resolve(output, roads.grade)),
]);
const floatView = (bytes: Buffer): Float32Array => new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
const height = new HeightField(heightMetadata, floatView(heightBytes));
const biomes = new BiomeField(biomeMetadata, new Uint8Array(biome0), new Uint8Array(biome1));
const riverCarve = floatView(riverCarveBytes), clearance = floatView(clearanceBytes), roadGrade = floatView(roadGradeBytes);
const sample = (values: ArrayLike<number>, x: number, z: number, resolution: number): number => {
    const ix = Math.max(0, Math.min(resolution - 1, Math.floor((x - WORLD_CONFIG.origin[0]) / WORLD_CONFIG.width * resolution)));
    const iz = Math.max(0, Math.min(resolution - 1, Math.floor((z - WORLD_CONFIG.origin[1]) / WORLD_CONFIG.depth * resolution)));
    return values[iz * resolution + ix];
};
const finalHeight = (x: number, z: number): number => height.sample(x, z)
    + sample(riverCarve, x, z, hydrology.width)
    + sample(clearance, x, z, landmarks.clearanceResolution[0])
    + sample(roadGrade, x, z, roads.resolution);
const nearMask = (mask: ArrayLike<number>, resolution: number, x: number, z: number, radius: number): boolean => {
    const spacing = WORLD_CONFIG.width / resolution;
    const cx = Math.floor((x - WORLD_CONFIG.origin[0]) / spacing), cz = Math.floor((z - WORLD_CONFIG.origin[1]) / spacing);
    const cells = Math.ceil(radius / spacing);
    for (let dz = -cells; dz <= cells; dz++) for (let dx = -cells; dx <= cells; dx++) {
        if (dx * dx + dz * dz > cells * cells) continue;
        const px = cx + dx, pz = cz + dz;
        if (px >= 0 && px < resolution && pz >= 0 && pz < resolution && mask[pz * resolution + px] > 0) return true;
    }
    return false;
};
const prototypes = ASSET_CATALOG.entries.map((entry) => entry.placement);
const placements = generatePlacements(prototypes, {
    seed: WORLD_CONFIG.seed, origin: WORLD_CONFIG.origin, extent: [WORLD_CONFIG.width, WORLD_CONFIG.depth], chunkSize: WORLD_CONFIG.chunkSize,
    biomeAt: (x, z) => biomes.sample(x, z), heightAt: finalHeight,
    slopeAt: (x, z) => {
        const step = 4;
        return Math.hypot(finalHeight(x + step, z) - finalHeight(x - step, z), finalHeight(x, z + step) - finalHeight(x, z - step)) / (step * 2);
    },
    excluded: (prototype, x, z) => nearMask(water, hydrology.width, x, z, prototype.waterClearance)
        || nearMask(roadMask, roads.resolution, x, z, prototype.roadClearance)
        || landmarks.landmarks.some((landmark) => Math.hypot(x - landmark.position[0], z - landmark.position[2]) < prototype.landmarkClearance),
});
const stride = 32;
const bytes = new Uint8Array(placements.length * stride);
const view = new DataView(bytes.buffer);
for (let index = 0; index < placements.length; index++) {
    const placement = placements[index], offset = index * stride;
    view.setUint8(offset, placement.prototype); view.setUint8(offset + 1, placement.biome);
    view.setFloat32(offset + 4, placement.x, true); view.setFloat32(offset + 8, placement.y, true); view.setFloat32(offset + 12, placement.z, true);
    view.setFloat32(offset + 16, placement.yaw, true); view.setFloat32(offset + 20, placement.scale, true); view.setUint32(offset + 24, placement.seed, true);
    view.setUint16(offset + 28, placement.chunkX, true); view.setUint16(offset + 30, placement.chunkZ, true);
}
const chunks: PlacementMetadata['chunks'][number][] = [];
for (let first = 0; first < placements.length;) {
    const placement = placements[first];
    let end = first + 1;
    while (end < placements.length && placements[end].chunkX === placement.chunkX && placements[end].chunkZ === placement.chunkZ) end++;
    chunks.push({ chunk: [placement.chunkX, placement.chunkZ], first, count: end - first });
    first = end;
}
const metadata: PlacementMetadata = {
    schema: 'exalted-placements', version: 1, data: 'placements.bin',
    format: 'prototype:u8,biome:u8,pad:u16,x:f32,y:f32,z:f32,yaw:f32,scale:f32,seed:u32,chunkX:u16,chunkZ:u16',
    stride, count: placements.length, sha256: createHash('sha256').update(bytes).digest('hex'), chunkSize: WORLD_CONFIG.chunkSize, prototypes, chunks,
};
await Promise.all([
    writeFile(resolve(output, metadata.data), bytes),
    writeFile(resolve(output, 'placements.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8'),
]);
console.log(`[generator] wrote ${placements.length} placements in ${chunks.length} occupied 32 m chunks`);
for (let index = 0; index < prototypes.length; index++) console.log(`[generator] ${prototypes[index].id}: ${placements.filter((entry) => entry.prototype === index).length}`);
