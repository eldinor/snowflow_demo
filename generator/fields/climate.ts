import type { WorldManifest } from '../package/schema.ts';
import { fractalNoise2D } from './noise.ts';

export interface ClimateInput {
    readonly x: number;
    readonly z: number;
    readonly elevation: number;
    readonly waterProximity?: number;
    readonly rainShadow?: number;
    readonly drainage?: number;
}

export interface ClimateSample {
    readonly temperature: number;
    readonly moisture: number;
}

function saturate(value: number): number {
    return Math.max(0, Math.min(1, value));
}

/** Samples broad deterministic climate fields; later hydrology can supply refinements. */
export function sampleClimate(world: WorldManifest, input: ClimateInput): ClimateSample {
    const north = saturate((input.z - world.origin[1]) / world.depth);
    const regionalTemperature = fractalNoise2D(
        world.seed + 101,
        input.x / 520,
        input.z / 520,
        3,
    ) - 0.5;
    const regionalMoisture = fractalNoise2D(
        world.seed + 211,
        input.x / 430,
        input.z / 430,
        4,
    );
    const elevationCooling = Math.max(0, input.elevation) * 0.00125;
    const temperature = saturate(0.86 - north * 0.52 - elevationCooling + regionalTemperature * 0.2);
    const moisture = saturate(
        0.12
        + regionalMoisture * 0.64
        + saturate(input.waterProximity ?? 0) * 0.22
        + saturate(input.drainage ?? 0) * 0.15
        - saturate(input.rainShadow ?? 0) * 0.32,
    );
    return { temperature, moisture };
}
