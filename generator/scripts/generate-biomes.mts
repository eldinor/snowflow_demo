import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORLD_CONFIG } from '../config/world.ts';
import { sampleBiomeWeights } from '../fields/biomes.ts';
import { sampleClimate } from '../fields/climate.ts';
import { quantizeBiomeWeights, type BiomeFieldMetadata } from '../package/biomeField.ts';
import { HeightField, type HeightFieldMetadata } from '../package/heightField.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'work/generated-world');
const [heightMetadataText, heightBytes] = await Promise.all([
    readFile(resolve(output, 'height.json'), 'utf8'),
    readFile(resolve(output, 'height.f32')),
]);
const heightMetadata = JSON.parse(heightMetadataText) as HeightFieldMetadata;
const height = new HeightField(
    heightMetadata,
    new Float32Array(heightBytes.buffer, heightBytes.byteOffset, heightBytes.byteLength / 4),
);
const resolution = WORLD_CONFIG.biomeResolution;
const map0 = new Uint8Array(resolution * resolution * 4);
const map1 = new Uint8Array(resolution * resolution * 4);
const spacing = WORLD_CONFIG.width / resolution;
const started = performance.now();
console.log(`[generator] baking two ${resolution} x ${resolution} biome maps`);
for (let zIndex = 0; zIndex < resolution; zIndex++) {
    const z = WORLD_CONFIG.origin[1] + (zIndex + 0.5) * spacing;
    for (let xIndex = 0; xIndex < resolution; xIndex++) {
        const x = WORLD_CONFIG.origin[0] + (xIndex + 0.5) * spacing;
        const elevation = height.sample(x, z);
        const terrain = height.sampleDerivatives(x, z, 4);
        const climate = sampleClimate(WORLD_CONFIG, { x, z, elevation });
        const packed = quantizeBiomeWeights(sampleBiomeWeights(WORLD_CONFIG, {
            x, z, elevation, slope: terrain.slope, curvature: terrain.curvature, ...climate,
        }));
        const offset = (zIndex * resolution + xIndex) * 4;
        map0.set(packed.subarray(0, 4), offset);
        map1.set(packed.subarray(4, 8), offset);
    }
}
const hash0 = createHash('sha256').update(map0).digest('hex');
const hash1 = createHash('sha256').update(map1).digest('hex');
const metadata: BiomeFieldMetadata = {
    schema: 'exalted-biome-field', version: 1,
    width: resolution, height: resolution,
    origin: WORLD_CONFIG.origin, extent: [WORLD_CONFIG.width, WORLD_CONFIG.depth],
    sampleSpacing: [spacing, spacing], sampling: 'texel-centres', format: 'rgba8-unorm',
    maps: ['biomes-0.rgba8', 'biomes-1.rgba8'], sha256: [hash0, hash1],
};
await Promise.all([
    writeFile(resolve(output, metadata.maps[0]), map0),
    writeFile(resolve(output, metadata.maps[1]), map1),
    writeFile(resolve(output, 'biomes.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8'),
]);
console.log(`[generator] wrote ${(map0.byteLength + map1.byteLength) / 1_000_000} MB in ${((performance.now() - started) / 1000).toFixed(2)} s`);
console.log(`[generator] sha256 ${hash0} / ${hash1}`);
