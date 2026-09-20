import { BIOME_NAMES, type BiomeName, type BiomeWeights } from '../config/biomes.ts';
import type { WorldManifest } from '../package/schema.ts';
import type { ClimateSample } from './climate.ts';
import { fractalNoise2D } from './noise.ts';

export interface BiomeInput extends ClimateSample {
    readonly x: number;
    readonly z: number;
    readonly elevation: number;
    readonly slope: number;
    readonly curvature?: number;
    readonly waterProximity?: number;
    readonly structuralOverride?: number;
}

function saturate(value: number): number {
    return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
    const t = saturate((value - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
}

/** Produces all eight normalized biome weights from geography and climate. */
export function sampleBiomeWeights(world: WorldManifest, input: BiomeInput): BiomeWeights {
    const slope = saturate(input.slope);
    const moisture = saturate(input.moisture);
    const temperature = saturate(input.temperature);
    const water = saturate(input.waterProximity ?? 0);
    const structure = saturate(input.structuralOverride ?? 0);
    const elevation = saturate(input.elevation / 500);
    const transition = fractalNoise2D(world.seed + 307, input.x / 240, input.z / 240, 3);
    const regionDryness = saturate(1 - moisture + (transition - 0.5) * 0.28);
    const plantable = 1 - smoothstep(0.35, 0.82, slope);

    const raw: Record<BiomeName, number> = {
        desert: (0.08 + temperature * temperature * regionDryness * 2.3) * plantable,
        grassland: (0.12 + (1 - Math.abs(moisture - 0.46) * 1.7) * temperature) * plantable,
        forest: smoothstep(0.34, 0.78, moisture) * smoothstep(0.2, 0.62, temperature) * plantable * 1.5,
        snow: (smoothstep(0.56, 0.9, elevation) + smoothstep(0.42, 0.12, temperature)) * (0.7 + slope * 0.3),
        rock: (smoothstep(0.34, 0.82, slope) + smoothstep(0.72, 1, elevation) * 0.45) * 1.3,
        wetland: moisture * moisture * water * (1 - slope) * 1.8,
        shore: smoothstep(0.28, 0.72, water) * (1 - smoothstep(0.72, 0.98, water)) * (1 - slope) * 1.5,
        settlement: structure * 5,
    };

    if (structure > 0) {
        const suppression = 1 - structure * 0.9;
        for (const name of BIOME_NAMES) {
            if (name !== 'settlement') raw[name] *= suppression;
        }
    }

    const total = BIOME_NAMES.reduce((sum, name) => sum + Math.max(0, raw[name]), 0);
    const normalized = Object.fromEntries(
        BIOME_NAMES.map((name) => [name, Math.max(0, raw[name]) / total]),
    ) as Record<BiomeName, number>;
    return Object.freeze(normalized);
}
