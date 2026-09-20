import type { RoadPoint } from '../fields/roads.ts';

export interface RoadMetadata {
    readonly schema: 'exalted-roads';
    readonly version: 1;
    readonly mask: string;
    readonly grade: string;
    readonly resolution: number;
    readonly roadHalfWidth: number;
    readonly shoulderWidth: number;
    readonly targetMaximumGrade: number;
    readonly maximumEarthwork: number;
    readonly roadTurnRadius: number;
    readonly trailTurnRadius: number;
    readonly routes: readonly {
        readonly from: string;
        readonly to: string;
        readonly points: readonly RoadPoint[];
        readonly length: number;
        readonly maximumGrade: number;
        readonly routingMaximumGrade: number;
        readonly gradedMaximumGrade: number;
        readonly gradedP95Grade: number;
        readonly kind: 'road' | 'trail';
    }[];
}
