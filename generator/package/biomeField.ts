import { BIOME_NAMES, type BiomeName, type BiomeWeights } from '../config/biomes.ts';

export interface BiomeFieldMetadata {
    readonly schema: 'exalted-biome-field';
    readonly version: 1;
    readonly width: number;
    readonly height: number;
    readonly origin: readonly [number, number];
    readonly extent: readonly [number, number];
    readonly sampleSpacing: readonly [number, number];
    readonly sampling: 'texel-centres';
    readonly format: 'rgba8-unorm';
    readonly maps: readonly ['biomes-0.rgba8', 'biomes-1.rgba8'];
    readonly sha256: readonly [string, string];
}

/** Largest-remainder quantization keeps the eight stored channels summing to 255. */
export function quantizeBiomeWeights(weights: BiomeWeights): Uint8Array {
    const scaled = BIOME_NAMES.map((name, index) => ({
        index,
        floor: Math.floor(weights[name] * 255),
        remainder: weights[name] * 255 - Math.floor(weights[name] * 255),
    }));
    let remaining = 255 - scaled.reduce((sum, channel) => sum + channel.floor, 0);
    scaled.sort((a, b) => b.remainder - a.remainder || a.index - b.index);
    for (let index = 0; index < remaining; index++) scaled[index].floor++;
    scaled.sort((a, b) => a.index - b.index);
    return Uint8Array.from(scaled.map((channel) => channel.floor));
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
}

/** CPU mirror of the two GPU biome textures for placement and gameplay rules. */
export class BiomeField {
    public constructor(
        public readonly metadata: BiomeFieldMetadata,
        public readonly map0: Uint8Array,
        public readonly map1: Uint8Array,
    ) {
        const expected = metadata.width * metadata.height * 4;
        if (map0.length !== expected || map1.length !== expected) {
            throw new Error(`Biome field expected ${expected} bytes per map.`);
        }
    }

    public sample(x: number, z: number): BiomeWeights {
        const sampleX = clamp(
            (x - this.metadata.origin[0]) / this.metadata.sampleSpacing[0] - 0.5,
            0,
            this.metadata.width - 1,
        );
        const sampleZ = clamp(
            (z - this.metadata.origin[1]) / this.metadata.sampleSpacing[1] - 0.5,
            0,
            this.metadata.height - 1,
        );
        const x0 = Math.floor(sampleX), z0 = Math.floor(sampleZ);
        const x1 = Math.min(x0 + 1, this.metadata.width - 1);
        const z1 = Math.min(z0 + 1, this.metadata.height - 1);
        const tx = sampleX - x0, tz = sampleZ - z0;
        const channels = new Array<number>(8);
        for (let channel = 0; channel < 8; channel++) {
            const map = channel < 4 ? this.map0 : this.map1;
            const component = channel % 4;
            const read = (px: number, pz: number): number => map[(pz * this.metadata.width + px) * 4 + component] / 255;
            const bottom = read(x0, z0) * (1 - tx) + read(x1, z0) * tx;
            const top = read(x0, z1) * (1 - tx) + read(x1, z1) * tx;
            channels[channel] = bottom * (1 - tz) + top * tz;
        }
        const total = channels.reduce((sum, value) => sum + value, 0);
        return Object.fromEntries(BIOME_NAMES.map((name, index) => [name, channels[index] / total])) as Record<BiomeName, number>;
    }
}
