/** Named Rev B destinations in chart coordinates before Babylon conversion. */

export type BiomeName = 'Desert' | 'Snow' | 'Grassland' | 'Forest' | 'Mountains' | 'Lake' | 'Pass';

/** Authored player inspection point; X/Y are map-plane coordinates and yaw is radians. */
export interface SpawnPoint {
    readonly id: string;
    readonly name: string;
    readonly biome: BiomeName;
    readonly x: number;
    readonly y: number;
    readonly yaw: number;
}

const points: SpawnPoint[] = [
    // 12 m south of the authored road-fork spawn, on loose sand for immediate footprints.
    { id: 'desert-start', name: 'Desert Start', biome: 'Desert', x: 65, y: -616, yaw: Math.PI },
    { id: 'C5', name: 'The Palecrown', biome: 'Snow', x: -218, y: 251, yaw: 0 },
    { id: 'C3', name: 'The Long Green', biome: 'Grassland', x: 310, y: 0, yaw: Math.PI },
    { id: 'C2', name: 'The Thornwood', biome: 'Forest', x: 767, y: -104, yaw: 0.8 },
    { id: 'C6', name: 'The Ironspine', biome: 'Mountains', x: 515, y: 380, yaw: 0 },
    { id: 'lakeside-overlook', name: 'Lakeside Overlook', biome: 'Lake', x: -334, y: 41, yaw: 0.7 },
    { id: 'stone-gate', name: 'Stone Gate', biome: 'Pass', x: 65, y: 325, yaw: Math.PI },
];

export const SPAWN_POINTS: readonly Readonly<SpawnPoint>[] = Object.freeze(
    points.map(point => Object.freeze(point)),
);

export const DEFAULT_SPAWN = SPAWN_POINTS[0];
