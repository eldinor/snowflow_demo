import { BIOME_NAMES, type BiomeName, type BiomeWeights } from '../config/biomes.ts';
import { hash2D, valueNoise2D } from './noise.ts';

export interface PlacementPrototype {
    readonly id: string;
    readonly spacing: number;
    readonly density: number;
    readonly biomeWeights: Partial<Record<BiomeName, number>>;
    readonly maximumSlope: number;
    readonly scale: readonly [number, number];
    readonly roadClearance: number;
    readonly waterClearance: number;
    readonly landmarkClearance: number;
}

export interface Placement {
    readonly prototype: number;
    readonly biome: number;
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly yaw: number;
    readonly scale: number;
    readonly seed: number;
    readonly chunkX: number;
    readonly chunkZ: number;
}

export interface PlacementContext {
    readonly seed: number;
    readonly origin: readonly [number, number];
    readonly extent: readonly [number, number];
    readonly chunkSize: number;
    readonly biomeAt: (x: number, z: number) => BiomeWeights;
    readonly heightAt: (x: number, z: number) => number;
    readonly slopeAt: (x: number, z: number) => number;
    readonly excluded: (prototype: PlacementPrototype, x: number, z: number) => boolean;
}

/** Deterministic jittered-grid placement; asset geometry is deliberately absent from this stage. */
export function generatePlacements(prototypes: readonly PlacementPrototype[], context: PlacementContext): Placement[] {
    const placements: Placement[] = [];
    for (let prototypeIndex = 0; prototypeIndex < prototypes.length; prototypeIndex++) {
        const prototype = prototypes[prototypeIndex];
        const columns = Math.ceil(context.extent[0] / prototype.spacing);
        const rows = Math.ceil(context.extent[1] / prototype.spacing);
        const prototypeSeed = context.seed + prototypeIndex * 104_729;
        for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
            const jitterX = (hash2D(prototypeSeed + 11, column, row) - 0.5) * prototype.spacing * 0.72;
            const jitterZ = (hash2D(prototypeSeed + 23, column, row) - 0.5) * prototype.spacing * 0.72;
            const x = context.origin[0] + (column + 0.5) * prototype.spacing + jitterX;
            const z = context.origin[1] + (row + 0.5) * prototype.spacing + jitterZ;
            if (x >= context.origin[0] + context.extent[0] || z >= context.origin[1] + context.extent[1]) continue;
            const biomes = context.biomeAt(x, z);
            let suitability = 0;
            let dominantBiome = 0;
            let dominantContribution = -1;
            for (let biome = 0; biome < BIOME_NAMES.length; biome++) {
                const contribution = biomes[BIOME_NAMES[biome]] * (prototype.biomeWeights[BIOME_NAMES[biome]] ?? 0);
                suitability += contribution;
                if (contribution > dominantContribution) { dominantContribution = contribution; dominantBiome = biome; }
            }
            const clustering = 0.55 + valueNoise2D(prototypeSeed + 37, x / 85, z / 85) * 0.65;
            if (hash2D(prototypeSeed + 41, column, row) >= Math.min(1, suitability * prototype.density * clustering)) continue;
            if (context.slopeAt(x, z) > prototype.maximumSlope || context.excluded(prototype, x, z)) continue;
            const random = hash2D(prototypeSeed + 53, column, row);
            placements.push({
                prototype: prototypeIndex,
                biome: dominantBiome,
                x, y: context.heightAt(x, z), z,
                yaw: hash2D(prototypeSeed + 67, column, row) * Math.PI * 2,
                scale: prototype.scale[0] + (prototype.scale[1] - prototype.scale[0]) * random,
                seed: Math.floor(hash2D(prototypeSeed + 79, column, row) * 0x1_0000_0000) >>> 0,
                chunkX: Math.floor((x - context.origin[0]) / context.chunkSize),
                chunkZ: Math.floor((z - context.origin[1]) / context.chunkSize),
            });
        }
    }
    return placements.sort((a, b) => a.chunkZ - b.chunkZ || a.chunkX - b.chunkX || a.prototype - b.prototype || a.seed - b.seed);
}
