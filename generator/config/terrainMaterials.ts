import { BIOME_NAMES } from './biomes.ts';
import type { TerrainMaterialCatalog } from '../package/terrainMaterials.ts';

/** Layer order exactly matches the two baked biome-weight textures and future GPU arrays. */
export const TERRAIN_MATERIALS: TerrainMaterialCatalog = {
    schema: 'exalted-terrain-materials', version: 1,
    arrayFormat: {
        albedo: 'rgba8-srgb', normal: 'rgba8-linear-opengl',
        ormHeight: 'rgba8-linear-ao-roughness-height-mask', requiredDimensions: [2048, 2048],
    },
    layers: [
        { biome: 'desert', id: 'desert-sand', displayName: 'Desert sand', albedo: '/terrain/desert-sand/gravelly_sand_diff_2k.jpg', normal: '/terrain/desert-sand/gravelly_sand_nor_gl_2k.jpg', ormHeight: null, arm: '/terrain/desert-sand/gravelly_sand_arm_2k.jpg', displacement: '/terrain/desert-sand/sand_03_disp_2k.png', metresPerTile: 2.5, normalStrength: 0.72, heightBlend: 0.42, triplanarStartSlope: 0.58 },
        { biome: 'grassland', id: 'grass-soil', displayName: 'Grass soil', albedo: '/terrain/grassland/leafy_grass_diff_2k.jpg', normal: '/terrain/grassland/leafy_grass_nor_gl_2k.jpg', ormHeight: null, arm: '/terrain/grassland/leafy_grass_arm_2k.jpg', metresPerTile: 2, normalStrength: 0.82, heightBlend: 0.38, triplanarStartSlope: 0.52 },
        { biome: 'forest', id: 'forest-floor', displayName: 'Forest floor', albedo: null, normal: null, ormHeight: null, metresPerTile: 4, normalStrength: 0.9, heightBlend: 0.46, triplanarStartSlope: 0.48 },
        { biome: 'snow', id: 'packed-snow', displayName: 'Packed snow', albedo: null, normal: null, ormHeight: null, metresPerTile: 6, normalStrength: 0.54, heightBlend: 0.52, triplanarStartSlope: 0.5 },
        { biome: 'rock', id: 'mountain-rock', displayName: 'Mountain rock', albedo: null, normal: null, ormHeight: null, metresPerTile: 7, normalStrength: 1.15, heightBlend: 0.58, triplanarStartSlope: 0.22 },
        { biome: 'wetland', id: 'wet-soil', displayName: 'Wet soil', albedo: null, normal: null, ormHeight: null, metresPerTile: 3.5, normalStrength: 0.65, heightBlend: 0.4, triplanarStartSlope: 0.5 },
        { biome: 'shore', id: 'shore-gravel', displayName: 'Shore sand and gravel', albedo: null, normal: null, ormHeight: null, metresPerTile: 4, normalStrength: 0.88, heightBlend: 0.48, triplanarStartSlope: 0.46 },
        { biome: 'settlement', id: 'compacted-earth', displayName: 'Compacted earth', albedo: null, normal: null, ormHeight: null, metresPerTile: 4.5, normalStrength: 0.62, heightBlend: 0.34, triplanarStartSlope: 0.55 },
    ],
};

if (TERRAIN_MATERIALS.layers.some((layer, index) => layer.biome !== BIOME_NAMES[index])) {
    throw new Error('Terrain material layers must match BIOME_NAMES order.');
}
