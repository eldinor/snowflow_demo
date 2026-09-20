import type { PlacementPrototype } from '../fields/placements.ts';

export interface PlacementChunkRange {
    readonly chunk: readonly [number, number];
    readonly first: number;
    readonly count: number;
}

export interface PlacementMetadata {
    readonly schema: 'exalted-placements';
    readonly version: 1;
    readonly data: 'placements.bin';
    readonly format: 'prototype:u8,biome:u8,pad:u16,x:f32,y:f32,z:f32,yaw:f32,scale:f32,seed:u32,chunkX:u16,chunkZ:u16';
    readonly stride: 32;
    readonly count: number;
    readonly sha256: string;
    readonly chunkSize: number;
    readonly prototypes: readonly PlacementPrototype[];
    readonly chunks: readonly PlacementChunkRange[];
}
