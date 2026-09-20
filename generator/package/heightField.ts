import type { WorldManifest } from './schema.ts';

export interface HeightFieldMetadata {
    readonly schema: 'exalted-height-field';
    readonly version: 1;
    readonly width: number;
    readonly height: number;
    readonly origin: readonly [number, number];
    readonly extent: readonly [number, number];
    readonly sampleSpacing: readonly [number, number];
    readonly sampling: 'texel-centres';
    readonly format: 'float32-le';
    readonly minimum: number;
    readonly maximum: number;
    readonly mean: number;
    readonly sha256: string;
}

export interface HeightDerivatives {
    readonly slope: number;
    readonly curvature: number;
    readonly exposure: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
}

/** CPU view of the same texel-centred field uploaded by the renderer. */
export class HeightField {
    public constructor(
        public readonly metadata: HeightFieldMetadata,
        public readonly values: Float32Array,
    ) {
        if (values.length !== metadata.width * metadata.height) {
            throw new Error(`Height field expected ${metadata.width * metadata.height} samples; received ${values.length}.`);
        }
    }

    /** Bilinear sample with coordinates outside the exact world clamped to its edge. */
    public sample(x: number, z: number): number {
        const [originX, originZ] = this.metadata.origin;
        const [spacingX, spacingZ] = this.metadata.sampleSpacing;
        const sampleX = clamp((x - originX) / spacingX - 0.5, 0, this.metadata.width - 1);
        const sampleZ = clamp((z - originZ) / spacingZ - 0.5, 0, this.metadata.height - 1);
        const x0 = Math.floor(sampleX);
        const z0 = Math.floor(sampleZ);
        const x1 = Math.min(x0 + 1, this.metadata.width - 1);
        const z1 = Math.min(z0 + 1, this.metadata.height - 1);
        const tx = sampleX - x0;
        const tz = sampleZ - z0;
        const bottom = this.values[z0 * this.metadata.width + x0] * (1 - tx)
            + this.values[z0 * this.metadata.width + x1] * tx;
        const top = this.values[z1 * this.metadata.width + x0] * (1 - tx)
            + this.values[z1 * this.metadata.width + x1] * tx;
        return bottom * (1 - tz) + top * tz;
    }

    /** Terrain descriptors derived from the baked source used for grounding. */
    public sampleDerivatives(x: number, z: number, step = 2): HeightDerivatives {
        const centre = this.sample(x, z);
        const west = this.sample(x - step, z);
        const east = this.sample(x + step, z);
        const south = this.sample(x, z - step);
        const north = this.sample(x, z + step);
        const dx = (east - west) / (step * 2);
        const dz = (north - south) / (step * 2);
        const gradient = Math.hypot(dx, dz);
        return {
            slope: clamp(gradient / 1.6, 0, 1),
            curvature: (west + east + south + north - centre * 4) / (step * step),
            exposure: clamp(0.5 + dx / Math.max(0.01, gradient) * 0.5, 0, 1),
        };
    }
}

/** Samples an analytic source at texel centres into the package's canonical layout. */
export function bakeHeightValues(
    world: WorldManifest,
    resolution: number,
    sampler: (x: number, z: number) => number,
): Float32Array {
    if (!Number.isInteger(resolution) || resolution < 2) {
        throw new Error(`Height resolution must be an integer of at least 2; received ${resolution}.`);
    }
    const values = new Float32Array(resolution * resolution);
    const spacingX = world.width / resolution;
    const spacingZ = world.depth / resolution;
    for (let zIndex = 0; zIndex < resolution; zIndex++) {
        const z = world.origin[1] + (zIndex + 0.5) * spacingZ;
        for (let xIndex = 0; xIndex < resolution; xIndex++) {
            const x = world.origin[0] + (xIndex + 0.5) * spacingX;
            values[zIndex * resolution + xIndex] = sampler(x, z);
        }
    }
    return values;
}

/** Applies deterministic thermal relaxation without changing field dimensions. */
export function applyThermalErosion(
    values: Float32Array,
    width: number,
    height: number,
    sampleSpacing: number,
    iterations: number,
    talusAngleDegrees = 38,
    strength = 0.18,
): void {
    const talus = Math.tan(talusAngleDegrees * Math.PI / 180) * sampleSpacing;
    const delta = new Float32Array(values.length);
    for (let iteration = 0; iteration < iterations; iteration++) {
        delta.fill(0);
        for (let z = 1; z < height - 1; z++) {
            for (let x = 1; x < width - 1; x++) {
                const index = z * width + x;
                const center = values[index];
                const neighbours = [index - 1, index + 1, index - width, index + width];
                for (const neighbour of neighbours) {
                    const excess = center - values[neighbour] - talus;
                    if (excess <= 0) continue;
                    const transfer = excess * strength * 0.25;
                    delta[index] -= transfer;
                    delta[neighbour] += transfer;
                }
            }
        }
        for (let index = 0; index < values.length; index++) values[index] += delta[index];
    }
}
