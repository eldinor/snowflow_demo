import type { AssetCatalog } from '../package/assetCatalog.ts';

/** Stable prototype contracts; source GLBs can be assigned without changing placement IDs. */
export const ASSET_CATALOG: AssetCatalog = {
    schema: 'exalted-asset-catalog', version: 1,
    entries: [
        {
            prototypeId: 'tree-1', displayName: 'Tree 1', category: 'tree', source: null, lods: [], distantCard: null,
            placement: { id: 'tree-1', spacing: 18, density: 0.82, biomeWeights: { forest: 1, grassland: 0.08, wetland: 0.12 }, maximumSlope: 0.42, scale: [0.82, 1.22], roadClearance: 10, waterClearance: 8, landmarkClearance: 28 },
            grounding: { pivotOffset: [0, 0, 0], burialDepth: 0.12, footprintRadius: 1.2 }, collision: 'trunk',
            wind: { profile: 'tree', strength: 1 }, shadowDistance: 90, materialClass: 'foliage',
        },
        {
            prototypeId: 'bush-1', displayName: 'Bush 1', category: 'bush', source: null, lods: [], distantCard: null,
            placement: { id: 'bush-1', spacing: 13, density: 0.78, biomeWeights: { forest: 0.72, grassland: 0.34, wetland: 0.42, shore: 0.08 }, maximumSlope: 0.48, scale: [0.72, 1.28], roadClearance: 5, waterClearance: 3, landmarkClearance: 20 },
            grounding: { pivotOffset: [0, 0, 0], burialDepth: 0.08, footprintRadius: 0.7 }, collision: 'none',
            wind: { profile: 'foliage', strength: 1 }, shadowDistance: 45, materialClass: 'foliage',
        },
        {
            prototypeId: 'grass-1', displayName: 'Grass 1', category: 'grass', source: null, lods: [], distantCard: null,
            placement: { id: 'grass-1', spacing: 8, density: 0.72, biomeWeights: { grassland: 1, forest: 0.25, wetland: 0.32, shore: 0.18 }, maximumSlope: 0.38, scale: [0.72, 1.18], roadClearance: 2, waterClearance: 1, landmarkClearance: 12 },
            grounding: { pivotOffset: [0, 0, 0], burialDepth: 0.03, footprintRadius: 0.45 }, collision: 'none',
            wind: { profile: 'grass', strength: 1 }, shadowDistance: 24, materialClass: 'ground-cover',
        },
        {
            prototypeId: 'rock-1', displayName: 'Rock 1', category: 'rock', source: null, lods: [], distantCard: null,
            placement: { id: 'rock-1', spacing: 20, density: 0.48, biomeWeights: { rock: 1, desert: 0.22, snow: 0.24, shore: 0.08 }, maximumSlope: 0.72, scale: [0.65, 1.45], roadClearance: 4, waterClearance: 2, landmarkClearance: 18 },
            grounding: { pivotOffset: [0, 0, 0], burialDepth: 0.18, footprintRadius: 1 }, collision: 'simple-hull',
            wind: { profile: 'none', strength: 0 }, shadowDistance: 70, materialClass: 'stone',
        },
    ],
};
