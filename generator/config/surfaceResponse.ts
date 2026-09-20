import type { BiomeName, BiomeWeights } from './biomes.ts';

export interface SurfaceResponse {
    /** Maximum downward displacement in metres. */
    readonly compressionDepth: number;
    /** Fraction of displaced material raised around the contact. */
    readonly bermRatio: number;
    /** Seconds for a disturbed surface to substantially relax. */
    readonly relaxationSeconds: number;
    /** Resistance used to attenuate brush pressure. */
    readonly hardness: number;
}

/** Stable physical character of each generated biome surface. */
export const BIOME_SURFACE_RESPONSE: Readonly<Record<BiomeName, SurfaceResponse>> = Object.freeze({
    desert: { compressionDepth: 0.24, bermRatio: 0.42, relaxationSeconds: 38, hardness: 0.18 },
    grassland: { compressionDepth: 0.018, bermRatio: 0.08, relaxationSeconds: 240, hardness: 0.78 },
    forest: { compressionDepth: 0.012, bermRatio: 0.05, relaxationSeconds: 300, hardness: 0.84 },
    snow: { compressionDepth: 0.48, bermRatio: 0.34, relaxationSeconds: 720, hardness: 0.08 },
    rock: { compressionDepth: 0, bermRatio: 0, relaxationSeconds: 0, hardness: 1 },
    wetland: { compressionDepth: 0.09, bermRatio: 0.12, relaxationSeconds: 95, hardness: 0.42 },
    shore: { compressionDepth: 0.07, bermRatio: 0.18, relaxationSeconds: 150, hardness: 0.5 },
    settlement: { compressionDepth: 0, bermRatio: 0, relaxationSeconds: 0, hardness: 1 },
});

/** Blends physical response continuously across biome boundaries. */
export function blendSurfaceResponse(weights: BiomeWeights): SurfaceResponse {
    let compressionDepth = 0;
    let bermRatio = 0;
    let relaxationSeconds = 0;
    let hardness = 0;
    for (const [name, weight] of Object.entries(weights) as [BiomeName, number][]) {
        const response = BIOME_SURFACE_RESPONSE[name];
        compressionDepth += response.compressionDepth * weight;
        bermRatio += response.bermRatio * weight;
        relaxationSeconds += response.relaxationSeconds * weight;
        hardness += response.hardness * weight;
    }
    return { compressionDepth, bermRatio, relaxationSeconds, hardness };
}
