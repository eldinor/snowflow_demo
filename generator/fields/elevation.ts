import { ELEVATION_CONFIG } from '../config/elevation.ts';
import type { WorldManifest } from '../package/schema.ts';
import { fractalNoise2D, valueNoise2D } from './noise.ts';

export interface TerrainDerivatives {
    /** Rise over run normalized to a useful biome-classification range. */
    readonly slope: number;
    /** Signed discrete Laplacian: positive in bowls and negative on crowns. */
    readonly curvature: number;
    /** Dot product proxy for exposure to the prevailing west wind. */
    readonly exposure: number;
}

function saturate(value: number): number {
    return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
    const t = saturate((value - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
}

function bell(distance: number, radius: number): number {
    const normalized = distance / radius;
    return Math.exp(-normalized * normalized * 2.25);
}

function ridged(value: number): number {
    const ridge = 1 - Math.abs(value * 2 - 1);
    // Hermite shaping has zero derivative at the crest. A simple squared
    // inverted-absolute ridge retains a cusp and produces needle-like summits.
    return ridge * ridge * (3 - 2 * ridge);
}

/**
 * Samples the authoritative analytic elevation used to bake the generated world.
 * It combines deliberately positioned landforms with seeded irregularity so the
 * macro silhouette stays art-directable while local structure remains natural.
 */
export function sampleElevation(world: WorldManifest, x: number, z: number): number {
    const config = ELEVATION_CONFIG;
    const broad = fractalNoise2D(world.seed + 401, x / 720, z / 720, 4) - 0.5;
    const regional = fractalNoise2D(world.seed + 409, x / 235, z / 235, 4) - 0.5;
    const warpX = (valueNoise2D(world.seed + 419, x / 610, z / 610) - 0.5) * 170;
    const warpZ = (valueNoise2D(world.seed + 421, x / 590, z / 590) - 0.5) * 150;

    const chainCentre = config.mountainChain.centreZ
        + x * config.mountainChain.xSlope
        + (valueNoise2D(world.seed + 431, x / 510, 0.37) - 0.5) * 180;
    const chainMask = bell(z + warpZ - chainCentre, config.mountainChain.halfWidth);
    const chainMass = ridged(fractalNoise2D(world.seed + 433, (x + warpX) / 245, z / 205, 3));
    const chainErosion = ridged(fractalNoise2D(world.seed + 437, (x + warpX) / 150, z / 135, 4));
    const chainRidges = chainMass * 0.76 + chainErosion * 0.24;
    const mountainChain = chainMask
        * config.mountainChain.height
        * (0.3 + chainRidges * 0.7)
        * (0.86 + broad * 0.28);

    const westernMask = bell(x + warpX - config.westernRidge.centreX, config.westernRidge.halfWidth)
        * smoothstep(-720, 450, z);
    const westernMass = ridged(fractalNoise2D(world.seed + 439, x / 185, z / 240, 3));
    const westernErosion = ridged(fractalNoise2D(world.seed + 443, x / 125, z / 185, 4));
    const westernRidges = westernMass * 0.8 + westernErosion * 0.2;
    const westernRidge = westernMask * config.westernRidge.height * (0.34 + westernRidges * 0.66);

    const basinDistance = Math.hypot(
        x - config.desertBasin.centreX,
        z - config.desertBasin.centreZ,
    );
    const basin = (1 - smoothstep(config.desertBasin.radius * 0.35, config.desertBasin.radius, basinDistance))
        * config.desertBasin.depth;
    const plateauMask = smoothstep(120, 480, x) * smoothstep(-180, 260, z) * (1 - chainMask * 0.75);
    const plateau = plateauMask * (42 + broad * 18);

    const valleyPath = -120 + Math.sin((z + 240) / 290) * 150;
    const valleyMask = bell(x + warpX * 0.25 - valleyPath, 115) * smoothstep(-680, 520, z);
    const valleyCarve = valleyMask * (34 + mountainChain * 0.16);

    const foothillDetail = regional * (20 + chainMask * 42 + westernMask * 18);
    const height = config.baseHeight
        + broad * 54
        + foothillDetail
        + mountainChain
        + westernRidge
        + plateau
        - basin
        - valleyCarve;
    return Math.max(-18, Math.min(config.maximumExpectedHeight, height));
}

/** Derives stable terrain descriptors from the same elevation function. */
export function sampleTerrainDerivatives(
    world: WorldManifest,
    x: number,
    z: number,
    step: number = ELEVATION_CONFIG.derivativeStep,
): TerrainDerivatives {
    const centre = sampleElevation(world, x, z);
    const west = sampleElevation(world, x - step, z);
    const east = sampleElevation(world, x + step, z);
    const south = sampleElevation(world, x, z - step);
    const north = sampleElevation(world, x, z + step);
    const dx = (east - west) / (step * 2);
    const dz = (north - south) / (step * 2);
    const gradient = Math.hypot(dx, dz);
    return {
        slope: saturate(gradient / 1.6),
        curvature: (west + east + south + north - centre * 4) / (step * step),
        exposure: saturate(0.5 + dx / Math.max(0.01, gradient) * 0.5),
    };
}
