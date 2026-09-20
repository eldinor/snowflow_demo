import type { PlacementPrototype } from '../fields/placements.ts';

export type AssetCategory = 'tree' | 'bush' | 'grass' | 'rock';
export type CollisionPolicy = 'none' | 'trunk' | 'simple-hull' | 'authored';

export interface AssetCatalogEntry {
    readonly prototypeId: string;
    readonly displayName: string;
    readonly category: AssetCategory;
    readonly source: string | null;
    readonly lods: readonly string[];
    readonly distantCard: string | null;
    readonly placement: PlacementPrototype;
    readonly grounding: {
        readonly pivotOffset: readonly [number, number, number];
        readonly burialDepth: number;
        readonly footprintRadius: number;
    };
    readonly collision: CollisionPolicy;
    readonly wind: { readonly profile: 'none' | 'grass' | 'foliage' | 'tree'; readonly strength: number };
    readonly shadowDistance: number;
    readonly materialClass: 'foliage' | 'bark' | 'ground-cover' | 'stone';
}

export interface AssetCatalog {
    readonly schema: 'exalted-asset-catalog';
    readonly version: 1;
    readonly entries: readonly AssetCatalogEntry[];
}

export interface AssetValidationEntry {
    readonly prototypeId: string;
    readonly status: 'unassigned' | 'valid' | 'invalid';
    readonly source: string | null;
    readonly byteLength?: number;
    readonly meshes?: number;
    readonly nodes?: number;
    readonly materials?: number;
    readonly errors: readonly string[];
    readonly warnings: readonly string[];
}

export interface AssetValidationReport {
    readonly schema: 'exalted-asset-validation';
    readonly version: 1;
    readonly valid: number;
    readonly invalid: number;
    readonly unassigned: number;
    readonly entries: readonly AssetValidationEntry[];
}
