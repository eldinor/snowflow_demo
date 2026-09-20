import type { RoadRoute } from './roads.ts';

interface Sample { readonly x: number; readonly z: number; height: number }

function smoothStep(value: number): number {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
}

/** Builds a signed terrain offset that grades road beds and softly blends their shoulders. */
export function buildRoadGrade(
    routes: readonly RoadRoute[],
    width: number,
    height: number,
    origin: readonly [number, number],
    extent: readonly [number, number],
    sampleHeight: (x: number, z: number) => number,
    roadHalfWidth = 4,
    shoulderWidth = 12,
    maximumGrade = 0.12,
    sampleStep = 2,
    maximumEarthwork = 4,
): Float32Array {
    const weightedOffsets = new Float32Array(width * height);
    const weights = new Float32Array(width * height);
    const spacingX = extent[0] / width;
    const spacingZ = extent[1] / height;
    for (const route of routes) {
        const samples: Sample[] = [];
        for (let segment = 1; segment < route.points.length; segment++) {
            const a = route.points[segment - 1], b = route.points[segment];
            const distance = Math.hypot(b.x - a.x, b.z - a.z);
            const steps = Math.max(1, Math.ceil(distance / sampleStep));
            for (let step = segment === 1 ? 0 : 1; step <= steps; step++) {
                const t = step / steps;
                const x = a.x + (b.x - a.x) * t;
                const z = a.z + (b.z - a.z) * t;
                samples.push({ x, z, height: sampleHeight(x, z) });
            }
        }
        if (samples.length < 2) continue;
        const sourceHeights = samples.map((sample) => sample.height);
        const smoothingRadius = Math.max(1, Math.round(10 / sampleStep));
        for (let index = 0; index < samples.length; index++) {
            let sum = 0, count = 0;
            for (let other = Math.max(0, index - smoothingRadius); other <= Math.min(samples.length - 1, index + smoothingRadius); other++) {
                sum += sourceHeights[other]; count++;
            }
            samples[index].height = sum / count;
        }
        for (let pass = 0; pass < 3; pass++) {
            for (let index = 1; index < samples.length; index++) {
                const distance = Math.hypot(samples[index].x - samples[index - 1].x, samples[index].z - samples[index - 1].z);
                const limit = maximumGrade * distance;
                samples[index].height = Math.max(samples[index - 1].height - limit, Math.min(samples[index - 1].height + limit, samples[index].height));
            }
            for (let index = samples.length - 2; index >= 0; index--) {
                const distance = Math.hypot(samples[index].x - samples[index + 1].x, samples[index].z - samples[index + 1].z);
                const limit = maximumGrade * distance;
                samples[index].height = Math.max(samples[index + 1].height - limit, Math.min(samples[index + 1].height + limit, samples[index].height));
            }
        }
        const radiusX = Math.ceil(shoulderWidth / spacingX);
        const radiusZ = Math.ceil(shoulderWidth / spacingZ);
        for (const sample of samples) {
            const centerX = Math.floor((sample.x - origin[0]) / spacingX);
            const centerZ = Math.floor((sample.z - origin[1]) / spacingZ);
            for (let dz = -radiusZ; dz <= radiusZ; dz++) for (let dx = -radiusX; dx <= radiusX; dx++) {
                const xIndex = centerX + dx, zIndex = centerZ + dz;
                if (xIndex < 0 || xIndex >= width || zIndex < 0 || zIndex >= height) continue;
                const worldX = origin[0] + (xIndex + 0.5) * spacingX;
                const worldZ = origin[1] + (zIndex + 0.5) * spacingZ;
                const distance = Math.hypot(worldX - sample.x, worldZ - sample.z);
                if (distance >= shoulderWidth) continue;
                const blend = distance <= roadHalfWidth ? 1 : 1 - smoothStep((distance - roadHalfWidth) / (shoulderWidth - roadHalfWidth));
                const cell = zIndex * width + xIndex;
                const offset = Math.max(-maximumEarthwork, Math.min(maximumEarthwork, sample.height - sampleHeight(worldX, worldZ)));
                weightedOffsets[cell] += offset * blend;
                weights[cell] += blend;
            }
        }
    }
    const result = new Float32Array(width * height);
    for (let cell = 0; cell < result.length; cell++) if (weights[cell] > 0) result[cell] = weightedOffsets[cell] / weights[cell];
    return result;
}
