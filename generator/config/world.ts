import type { WorldManifest } from '../package/schema.ts';
import { assertValidWorldManifest } from '../package/schema.ts';
import { GENERATOR_VERSION, PACKAGE_VERSION } from '../package/versions.ts';

/** Initial exact 2 km by 2 km world contract. */
export const WORLD_CONFIG: WorldManifest = Object.freeze({
    generator: 'exalted-world',
    generatorVersion: GENERATOR_VERSION,
    packageVersion: PACKAGE_VERSION,
    seed: 482_913,
    width: 2_000,
    depth: 2_000,
    origin: [-1_000, -1_000] as const,
    heightResolution: 4_000,
    biomeResolution: 1_000,
    waterResolution: 1_000,
    chunkSize: 32,
});

assertValidWorldManifest(WORLD_CONFIG);
