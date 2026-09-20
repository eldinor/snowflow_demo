export interface HydrologyFieldMetadata {
    readonly schema: 'exalted-hydrology-field';
    readonly version: 1;
    readonly width: number;
    readonly height: number;
    readonly origin: readonly [number, number];
    readonly extent: readonly [number, number];
    readonly sampleSpacing: readonly [number, number];
    readonly direction: string;
    readonly accumulation: string;
    readonly lakeMask: string;
    readonly lakeSurface: string;
    readonly riverMask: string;
    readonly riverCarve: string;
    readonly waterfallMask: string;
    readonly waterMask: string;
    readonly waterSurface: string;
    readonly waterDepth: string;
    readonly shorelineMask: string;
    readonly swimmableMask: string;
    readonly sinks: number;
    readonly lakes: number;
    readonly largestLakeCells: number;
    readonly rivers: readonly {
        readonly kind: 'primary' | 'small';
        readonly cells: number;
        readonly source: readonly [number, number];
        readonly mouth: readonly [number, number];
    }[];
    readonly waterfalls: readonly {
        readonly river: number;
        readonly position: readonly [number, number, number];
        readonly drop: number;
    }[];
    readonly validation: {
        readonly uphillRiverSegments: number;
        readonly maximumUphillRise: number;
        readonly maximumLakeNeighbourDelta: number;
        readonly shorelineCells: number;
        readonly swimmableCells: number;
    };
    readonly maximumAccumulation: number;
    readonly sha256: readonly string[];
}

/** Runtime representation of the first non-destructive hydrology bake. */
export class HydrologyField {
    public constructor(
        public readonly metadata: HydrologyFieldMetadata,
        public readonly direction: Uint8Array,
        public readonly accumulation: Float32Array,
        public readonly lakeMask: Uint8Array,
        public readonly lakeSurface: Float32Array,
        public readonly riverMask: Uint8Array,
        public readonly riverCarve: Float32Array,
        public readonly waterfallMask: Uint8Array,
        public readonly waterMask: Uint8Array,
        public readonly waterSurface: Float32Array,
        public readonly waterDepth: Float32Array,
        public readonly shorelineMask: Uint8Array,
        public readonly swimmableMask: Uint8Array,
    ) {}
}
