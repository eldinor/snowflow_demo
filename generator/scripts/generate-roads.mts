import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORLD_CONFIG } from '../config/world.ts';
import { paintRoadMask, roundRoadCorners, routeRoad, simplifyRoadPoints, type RoadRoute } from '../fields/roads.ts';
import { buildRoadGrade } from '../fields/roadGrading.ts';
import { HeightField, type HeightFieldMetadata } from '../package/heightField.ts';
import type { HydrologyFieldMetadata } from '../package/hydrologyField.ts';
import type { LandmarkMetadata } from '../package/landmarks.ts';
import type { RoadMetadata } from '../package/roads.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'work/generated-world');
const [heightText, heightBytes, hydrologyText, waterBytes, landmarksText, clearanceBytes] = await Promise.all([
    readFile(resolve(output, 'height.json'), 'utf8'), readFile(resolve(output, 'height.f32')),
    readFile(resolve(output, 'hydrology.json'), 'utf8'), readFile(resolve(output, 'water-mask.u8')),
    readFile(resolve(output, 'landmarks.json'), 'utf8'), readFile(resolve(output, 'landmark-clearance.f32')),
]);
const heightMetadata = JSON.parse(heightText) as HeightFieldMetadata;
const height = new HeightField(heightMetadata, new Float32Array(heightBytes.buffer, heightBytes.byteOffset, heightBytes.byteLength / 4));
const hydrology = JSON.parse(hydrologyText) as HydrologyFieldMetadata;
const water = new Uint8Array(waterBytes);
const landmarks = JSON.parse(landmarksText) as LandmarkMetadata;
const clearance = new Float32Array(clearanceBytes.buffer, clearanceBytes.byteOffset, clearanceBytes.byteLength / 4);
const byName = new Map(landmarks.landmarks.map((landmark) => [landmark.name, landmark]));
const connections = [
    ['Desert 1', 'Grass 1'],
    ['Grass 1', 'Grass 2'],
    ['Grass 1', 'Forest 1'],
    ['Grass 1', 'Lakeside 1'],
] as const;
const sampleGrid = (values: ArrayLike<number>, x: number, z: number, resolution: number): number => {
    const ix = Math.max(0, Math.min(resolution - 1, Math.floor((x - WORLD_CONFIG.origin[0]) / WORLD_CONFIG.width * resolution)));
    const iz = Math.max(0, Math.min(resolution - 1, Math.floor((z - WORLD_CONFIG.origin[1]) / WORLD_CONFIG.depth * resolution)));
    return values[iz * resolution + ix];
};
const sampleGridBilinear = (values: ArrayLike<number>, x: number, z: number, resolution: number): number => {
    const gridX = (x - WORLD_CONFIG.origin[0]) / WORLD_CONFIG.width * resolution - 0.5;
    const gridZ = (z - WORLD_CONFIG.origin[1]) / WORLD_CONFIG.depth * resolution - 0.5;
    const x0 = Math.max(0, Math.min(resolution - 1, Math.floor(gridX)));
    const z0 = Math.max(0, Math.min(resolution - 1, Math.floor(gridZ)));
    const x1 = Math.min(resolution - 1, x0 + 1), z1 = Math.min(resolution - 1, z0 + 1);
    const tx = Math.max(0, Math.min(1, gridX - x0)), tz = Math.max(0, Math.min(1, gridZ - z0));
    const north = values[z0 * resolution + x0] * (1 - tx) + values[z0 * resolution + x1] * tx;
    const south = values[z1 * resolution + x0] * (1 - tx) + values[z1 * resolution + x1] * tx;
    return north * (1 - tz) + south * tz;
};
const routingSpacing = 10;
const roadTurnRadius = 30;
const trailTurnRadius = 12;
const networkCells = new Set<string>();
const cellKey = (x: number, z: number): string => `${Math.round((x - WORLD_CONFIG.origin[0]) / routingSpacing)},${Math.round((z - WORLD_CONFIG.origin[1]) / routingSpacing)}`;
/** Reuses an existing centreline while making its surrounding corridor expensive. */
const networkTraversalCost = (x: number, z: number): number => {
    if (networkCells.size === 0) return 1;
    const gridX = Math.round((x - WORLD_CONFIG.origin[0]) / routingSpacing);
    const gridZ = Math.round((z - WORLD_CONFIG.origin[1]) / routingSpacing);
    if (networkCells.has(`${gridX},${gridZ}`)) return 0.18;
    for (let radius = 1; radius <= 4; radius++) {
        for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
            if (networkCells.has(`${gridX + dx},${gridZ + dz}`)) return [0, 6, 4, 2.2, 1.35][radius];
        }
    }
    return 1;
};
const routingHeightCache = new Map<string, number>();
/** Removes small terrain spikes from route feasibility while retaining broad landform slopes. */
const routingElevation = (x: number, z: number): number => {
    const key = cellKey(x, z);
    const cached = routingHeightCache.get(key);
    if (cached !== undefined) return cached;
    let weightedHeight = 0, totalWeight = 0;
    for (let dz = -20; dz <= 20; dz += 10) for (let dx = -20; dx <= 20; dx += 10) {
        const distance = Math.hypot(dx, dz);
        if (distance > 20) continue;
        const weight = 1 - distance / 28;
        weightedHeight += (height.sample(x + dx, z + dz)
            + sampleGrid(clearance, x + dx, z + dz, landmarks.clearanceResolution[0])) * weight;
        totalWeight += weight;
    }
    const result = weightedHeight / totalWeight;
    routingHeightCache.set(key, result);
    return result;
};
const routes: RoadRoute[] = [];
const routingMaximumGrades = new Map<string, number>();
for (const [from, to] of connections) {
    const a = byName.get(from), b = byName.get(to);
    if (!a || !b) throw new Error(`Missing road endpoint ${from} or ${to}.`);
    let routedPoints: ReturnType<typeof routeRoad> | null = null;
    let routingMaximumGrade = 0;
    for (const candidateGrade of [0.25, 0.35, 0.45, 0.55]) {
        try {
            routedPoints = routeRoad(
                { x: a.position[0], z: a.position[2] }, { x: b.position[0], z: b.position[2] },
                WORLD_CONFIG.origin, WORLD_CONFIG.width, WORLD_CONFIG.depth, routingSpacing,
                routingElevation,
                (x, z) => sampleGrid(water, x, z, hydrology.width) > 0,
                candidateGrade,
                networkTraversalCost,
                0.18,
            );
            routingMaximumGrade = candidateGrade;
            break;
        } catch (error) {
            if (!(error instanceof Error) || error.message !== 'No dry road route found.') throw error;
        }
    }
    if (!routedPoints) throw new Error(`No dry route found between ${from} and ${to}.`);
    routingMaximumGrades.set(`${from}:${to}`, routingMaximumGrade);
    for (const point of routedPoints) networkCells.add(cellKey(point.x, point.z));
    const simplifiedPoints = simplifyRoadPoints(routedPoints);
    routes.push({
        from, to,
        points: roundRoadCorners(
            simplifiedPoints,
            routingMaximumGrade <= 0.35 ? roadTurnRadius : trailTurnRadius,
            (x, z) => sampleGrid(water, x, z, hydrology.width) === 0,
        ),
    });
}
const resolution = WORLD_CONFIG.waterResolution;
const riverCarveBytes = await readFile(resolve(output, hydrology.riverCarve));
const riverCarve = new Float32Array(riverCarveBytes.buffer, riverCarveBytes.byteOffset, riverCarveBytes.byteLength / 4);
const roadHalfWidth = 4, shoulderWidth = 12, targetMaximumGrade = 0.12, maximumEarthwork = 4;
const grade = buildRoadGrade(
    routes, resolution, resolution, WORLD_CONFIG.origin, [WORLD_CONFIG.width, WORLD_CONFIG.depth],
    (x, z) => height.sample(x, z)
        + sampleGrid(clearance, x, z, landmarks.clearanceResolution[0])
        + sampleGrid(riverCarve, x, z, hydrology.width),
    roadHalfWidth, shoulderWidth, targetMaximumGrade, 2, maximumEarthwork,
);
const displacedHeight = (x: number, z: number): number => height.sample(x, z)
    + sampleGrid(clearance, x, z, landmarks.clearanceResolution[0])
    + sampleGrid(riverCarve, x, z, hydrology.width)
    + sampleGridBilinear(grade, x, z, resolution);
const measureGrades = (route: RoadRoute, sample: (x: number, z: number) => number): { maximum: number; p95: number } => {
    let maximum = 0;
    const grades: number[] = [];
    for (let segment = 1; segment < route.points.length; segment++) {
        const a = route.points[segment - 1], b = route.points[segment];
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        const steps = Math.max(1, Math.ceil(length / 2));
        let previousX = a.x, previousZ = a.z, previousHeight = sample(a.x, a.z);
        for (let step = 1; step <= steps; step++) {
            const t = step / steps;
            const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
            const currentHeight = sample(x, z);
            const grade = Math.abs(currentHeight - previousHeight) / Math.hypot(x - previousX, z - previousZ);
            maximum = Math.max(maximum, grade);
            grades.push(grade);
            previousX = x; previousZ = z; previousHeight = currentHeight;
        }
    }
    grades.sort((a, b) => a - b);
    return { maximum, p95: grades[Math.min(grades.length - 1, Math.floor(grades.length * 0.95))] ?? 0 };
};
const classifiedRoutes = routes.map((route) => ({
    route,
    grades: measureGrades(route, displacedHeight),
}));
const roadRoutes = classifiedRoutes.filter(({ grades }) => grades.p95 <= 0.22).map(({ route }) => route);
const trailRoutes = classifiedRoutes.filter(({ grades }) => grades.p95 > 0.22).map(({ route }) => route);
const mask = paintRoadMask(roadRoutes, resolution, WORLD_CONFIG.origin, [WORLD_CONFIG.width, WORLD_CONFIG.depth], 3);
const trailMask = paintRoadMask(trailRoutes, resolution, WORLD_CONFIG.origin, [WORLD_CONFIG.width, WORLD_CONFIG.depth], 1);
for (let cell = 0; cell < mask.length; cell++) {
    mask[cell] = Math.max(mask[cell], trailMask[cell]);
    if (water[cell]) mask[cell] = 0;
}
const metadata: RoadMetadata = {
    schema: 'exalted-roads', version: 1, mask: 'road-mask.u8', grade: 'road-grade.f32', resolution,
    roadHalfWidth, shoulderWidth, targetMaximumGrade, maximumEarthwork,
    roadTurnRadius, trailTurnRadius,
    routes: classifiedRoutes.map(({ route, grades }) => {
        let maximumGrade = 0;
        const length = route.points.slice(1).reduce((sum, point, index) => {
            const previous = route.points[index];
            const distance = Math.hypot(point.x - previous.x, point.z - previous.z);
            const rise = Math.abs(height.sample(point.x, point.z) - height.sample(previous.x, previous.z));
            maximumGrade = Math.max(maximumGrade, rise / distance);
            return sum + distance;
        }, 0);
        return {
            ...route, length, maximumGrade,
            routingMaximumGrade: routingMaximumGrades.get(`${route.from}:${route.to}`) ?? 0.55,
            gradedMaximumGrade: grades.maximum,
            gradedP95Grade: grades.p95,
            kind: grades.p95 <= 0.22 ? 'road' : 'trail',
        };
    }),
};
await Promise.all([
    writeFile(resolve(output, metadata.mask), mask),
    writeFile(resolve(output, metadata.grade), new Uint8Array(grade.buffer)),
    writeFile(resolve(output, 'roads.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8'),
]);
console.log(`[generator] wrote ${routes.length} dry road routes`);
for (const route of metadata.routes) console.log(`[generator] ${route.from} -> ${route.to}: ${route.length.toFixed(0)} m, ${route.kind}, raw ${(route.maximumGrade * 100).toFixed(1)}%, graded p95 ${(route.gradedP95Grade * 100).toFixed(1)}%, max ${(route.gradedMaximumGrade * 100).toFixed(1)}%`);
