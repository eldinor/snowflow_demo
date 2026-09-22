import type { BiomeName } from '../config/biomes.ts';

export interface TerrainMaterialLayer {
    readonly biome: BiomeName;
    readonly id: string;
    readonly displayName: string;
    readonly albedo: string | null;
    readonly normal: string | null;
    readonly ormHeight: string | null;
    readonly arm?: string | null;
    readonly displacement?: string | null;
    readonly metresPerTile: number;
    readonly normalStrength: number;
    readonly heightBlend: number;
    readonly triplanarStartSlope: number;
}

export interface TerrainMaterialCatalog {
    readonly schema: 'exalted-terrain-materials';
    readonly version: 1;
    readonly arrayFormat: {
        readonly albedo: 'rgba8-srgb';
        readonly normal: 'rgba8-linear-opengl';
        readonly ormHeight: 'rgba8-linear-ao-roughness-height-mask';
        readonly requiredDimensions: readonly [number, number];
    };
    readonly layers: readonly TerrainMaterialLayer[];
}
