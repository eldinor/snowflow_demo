export interface LandmarkRecord {
    readonly name: string;
    readonly biome: string;
    readonly position: readonly [number, number, number];
    readonly slope: number;
}

export interface LandmarkMetadata {
    readonly schema: 'exalted-landmarks';
    readonly version: 1;
    readonly minimumSeparation: number;
    readonly clearance: string;
    readonly clearanceResolution: readonly [number, number];
    readonly clearanceRadii: readonly [number, number];
    readonly maximumClearanceAdjustment: number;
    readonly landmarks: readonly LandmarkRecord[];
}
