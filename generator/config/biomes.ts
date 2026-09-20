/** Channel order is stable because baked textures and runtime shaders depend on it. */
export const BIOME_NAMES = [
    'desert',
    'grassland',
    'forest',
    'snow',
    'rock',
    'wetland',
    'shore',
    'settlement',
] as const;

export type BiomeName = (typeof BIOME_NAMES)[number];
export type BiomeWeights = Readonly<Record<BiomeName, number>>;

export const BIOME_TEXTURE_CHANNELS = Object.freeze({
    desert: 'biomes-0.r',
    grassland: 'biomes-0.g',
    forest: 'biomes-0.b',
    snow: 'biomes-0.a',
    rock: 'biomes-1.r',
    wetland: 'biomes-1.g',
    shore: 'biomes-1.b',
    settlement: 'biomes-1.a',
} satisfies Record<BiomeName, string>);
