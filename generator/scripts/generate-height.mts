import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORLD_CONFIG } from '../config/world.ts';
import { sampleElevation } from '../fields/elevation.ts';
import {
    applyThermalErosion,
    bakeHeightValues,
    type HeightFieldMetadata,
} from '../package/heightField.ts';

function integerArgument(name: string, fallback: number): number {
    const flag = process.argv.indexOf(`--${name}`);
    if (flag < 0) return fallback;
    const value = Number(process.argv[flag + 1]);
    if (!Number.isInteger(value) || value < 0) throw new Error(`--${name} requires a non-negative integer.`);
    return value;
}

const generatorRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = resolve(generatorRoot, 'work/generated-world');
const resolution = integerArgument('resolution', WORLD_CONFIG.heightResolution);
const erosionIterations = integerArgument('erosion-iterations', 6);
const started = performance.now();

console.log(`[generator] sampling ${resolution} x ${resolution} elevation field`);
const values = bakeHeightValues(WORLD_CONFIG, resolution, (x, z) => sampleElevation(WORLD_CONFIG, x, z));
if (erosionIterations > 0) {
    console.log(`[generator] applying ${erosionIterations} thermal erosion iterations`);
    applyThermalErosion(values, resolution, resolution, WORLD_CONFIG.width / resolution, erosionIterations);
}

let minimum = Infinity;
let maximum = -Infinity;
let sum = 0;
for (const value of values) {
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
    sum += value;
}
const bytes = Buffer.from(values.buffer, values.byteOffset, values.byteLength);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const metadata: HeightFieldMetadata = {
    schema: 'exalted-height-field',
    version: 1,
    width: resolution,
    height: resolution,
    origin: WORLD_CONFIG.origin,
    extent: [WORLD_CONFIG.width, WORLD_CONFIG.depth],
    sampleSpacing: [WORLD_CONFIG.width / resolution, WORLD_CONFIG.depth / resolution],
    sampling: 'texel-centres',
    format: 'float32-le',
    minimum,
    maximum,
    mean: sum / values.length,
    sha256,
};

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
    writeFile(resolve(outputDirectory, 'height.f32'), bytes),
    writeFile(resolve(outputDirectory, 'height.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8'),
]);
console.log(`[generator] wrote ${(bytes.byteLength / 1_048_576).toFixed(1)} MiB in ${((performance.now() - started) / 1000).toFixed(2)} s`);
console.log(`[generator] range ${minimum.toFixed(2)}..${maximum.toFixed(2)} m; sha256 ${sha256}`);
