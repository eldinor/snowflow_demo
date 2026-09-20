import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORLD_CONFIG } from '../config/world.ts';
import { HYDROLOGY_CONFIG } from '../config/hydrology.ts';
import { accumulateDirections, buildHydrology, classifyLakes, fillDepressions } from '../fields/hydrology.ts';
import { selectRiverNetwork } from '../fields/rivers.ts';
import { buildWaterRuntimeFields, buildWaterSurface, carveRiverBeds, detectWaterfalls, paintWaterfallMask } from '../fields/riverCarving.ts';
import type { HeightFieldMetadata } from '../package/heightField.ts';
import { HeightField } from '../package/heightField.ts';
import type { HydrologyFieldMetadata } from '../package/hydrologyField.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'work/generated-world');
const [metadataText, heightBytes] = await Promise.all([
    readFile(resolve(output, 'height.json'), 'utf8'),
    readFile(resolve(output, 'height.f32')),
]);
const heightMetadata = JSON.parse(metadataText) as HeightFieldMetadata;
const heightField = new HeightField(heightMetadata, new Float32Array(
    heightBytes.buffer, heightBytes.byteOffset, heightBytes.byteLength / 4,
));
const resolution = WORLD_CONFIG.waterResolution;
const spacing = WORLD_CONFIG.width / resolution;
const elevation = new Float32Array(resolution * resolution);
console.log(`[generator] sampling ${resolution} x ${resolution} hydrology grid`);
const started = performance.now();
for (let z = 0; z < resolution; z++) {
    for (let x = 0; x < resolution; x++) {
        elevation[z * resolution + x] = heightField.sample(
            WORLD_CONFIG.origin[0] + (x + 0.5) * spacing,
            WORLD_CONFIG.origin[1] + (z + 0.5) * spacing,
        );
    }
}
const rawDrainage = buildHydrology(elevation, resolution, resolution);
const fill = fillDepressions(elevation, resolution, resolution);
const lakes = classifyLakes(
    fill,
    resolution,
    resolution,
    HYDROLOGY_CONFIG.minimumLakeDepth,
    HYDROLOGY_CONFIG.minimumLakeCells,
    HYDROLOGY_CONFIG.maximumLakes,
);
const accumulation = accumulateDirections(fill.direction, resolution, resolution);
let maximumAccumulation = 1;
for (const value of accumulation) maximumAccumulation = Math.max(maximumAccumulation, value);
const rivers = selectRiverNetwork(fill.direction, accumulation, lakes.mask, resolution, resolution, {
    primaryCount: HYDROLOGY_CONFIG.primaryRivers,
    smallCount: HYDROLOGY_CONFIG.smallRivers,
    minimumCells: HYDROLOGY_CONFIG.minimumRiverCells,
    maximumSmallCells: HYDROLOGY_CONFIG.maximumSmallRiverCells,
    minimumSourceSeparation: HYDROLOGY_CONFIG.minimumRiverSourceSeparationCells,
    primaryWidth: HYDROLOGY_CONFIG.primaryRiverWidthCells,
    smallWidth: HYDROLOGY_CONFIG.smallRiverWidthCells,
});
const riverCarve = carveRiverBeds(
    rivers.routes, resolution, resolution,
    HYDROLOGY_CONFIG.primaryCarveRadiusCells, HYDROLOGY_CONFIG.smallCarveRadiusCells,
    HYDROLOGY_CONFIG.primaryCarveDepth, HYDROLOGY_CONFIG.smallCarveDepth,
);
const waterfalls = detectWaterfalls(
    rivers.routes, elevation,
    HYDROLOGY_CONFIG.waterfallWindowCells, HYDROLOGY_CONFIG.waterfallMinimumDrop,
    HYDROLOGY_CONFIG.waterfallSeparationCells, HYDROLOGY_CONFIG.maximumWaterfalls,
);
const waterfallMask = paintWaterfallMask(waterfalls, rivers.routes, resolution, resolution);
const water = buildWaterSurface(
    elevation, lakes.mask, lakes.surface, rivers.mask, riverCarve,
    resolution, resolution, rivers.routes,
);
const runtimeWater = buildWaterRuntimeFields(
    water.mask, water.surface, elevation, riverCarve, lakes.mask, rivers.routes, resolution, resolution,
);
const directionHash = createHash('sha256').update(fill.direction).digest('hex');
const accumulationBytes = new Uint8Array(accumulation.buffer);
const accumulationHash = createHash('sha256').update(accumulationBytes).digest('hex');
const lakeMaskHash = createHash('sha256').update(lakes.mask).digest('hex');
const lakeSurfaceBytes = new Uint8Array(lakes.surface.buffer);
const lakeSurfaceHash = createHash('sha256').update(lakeSurfaceBytes).digest('hex');
const riverMaskHash = createHash('sha256').update(rivers.mask).digest('hex');
const riverCarveBytes = new Uint8Array(riverCarve.buffer);
const riverCarveHash = createHash('sha256').update(riverCarveBytes).digest('hex');
const waterfallMaskHash = createHash('sha256').update(waterfallMask).digest('hex');
const waterMaskHash = createHash('sha256').update(water.mask).digest('hex');
const waterSurfaceBytes = new Uint8Array(water.surface.buffer);
const waterSurfaceHash = createHash('sha256').update(waterSurfaceBytes).digest('hex');
const waterDepthBytes = new Uint8Array(runtimeWater.depth.buffer);
const waterDepthHash = createHash('sha256').update(waterDepthBytes).digest('hex');
const shorelineHash = createHash('sha256').update(runtimeWater.shoreline).digest('hex');
const swimmableHash = createHash('sha256').update(runtimeWater.swimmable).digest('hex');
const toWorld = (cell: number): readonly [number, number] => [
    WORLD_CONFIG.origin[0] + (cell % resolution + 0.5) * spacing,
    WORLD_CONFIG.origin[1] + (Math.floor(cell / resolution) + 0.5) * spacing,
];
const metadata: HydrologyFieldMetadata = {
    schema: 'exalted-hydrology-field', version: 1,
    width: resolution, height: resolution,
    origin: WORLD_CONFIG.origin, extent: [WORLD_CONFIG.width, WORLD_CONFIG.depth],
    sampleSpacing: [spacing, spacing],
    direction: 'flow-direction.u8', accumulation: 'flow-accumulation.f32',
    lakeMask: 'lake-mask.u8', lakeSurface: 'lake-surface.f32',
    riverMask: 'river-mask.u8',
    riverCarve: 'river-carve.f32', waterfallMask: 'waterfall-mask.u8',
    waterMask: 'water-mask.u8', waterSurface: 'water-surface.f32',
    waterDepth: 'water-depth.f32', shorelineMask: 'shoreline-mask.u8', swimmableMask: 'swimmable-mask.u8',
    sinks: rawDrainage.sinks, lakes: lakes.count, largestLakeCells: lakes.largestCellCount,
    maximumAccumulation,
    rivers: rivers.routes.map((route) => ({
        kind: route.kind,
        cells: route.cells.length,
        source: toWorld(route.cells[0]),
        mouth: toWorld(route.cells[route.cells.length - 1]),
    })),
    waterfalls: waterfalls.map((site) => {
        const cell = rivers.routes[site.route].cells[site.cell];
        const [x, z] = toWorld(cell);
        return { river: site.route, position: [x, elevation[cell], z] as const, drop: site.drop };
    }),
    validation: {
        uphillRiverSegments: runtimeWater.uphillRiverSegments,
        maximumUphillRise: runtimeWater.maximumUphillRise,
        maximumLakeNeighbourDelta: runtimeWater.maximumLakeNeighbourDelta,
        shorelineCells: runtimeWater.shoreline.reduce((sum, value) => sum + (value ? 1 : 0), 0),
        swimmableCells: runtimeWater.swimmable.reduce((sum, value) => sum + (value ? 1 : 0), 0),
    },
    sha256: [directionHash, accumulationHash, lakeMaskHash, lakeSurfaceHash, riverMaskHash, riverCarveHash, waterfallMaskHash, waterMaskHash, waterSurfaceHash, waterDepthHash, shorelineHash, swimmableHash],
};
await Promise.all([
    writeFile(resolve(output, metadata.direction), fill.direction),
    writeFile(resolve(output, metadata.accumulation), accumulationBytes),
    writeFile(resolve(output, metadata.lakeMask), lakes.mask),
    writeFile(resolve(output, metadata.lakeSurface), lakeSurfaceBytes),
    writeFile(resolve(output, metadata.riverMask), rivers.mask),
    writeFile(resolve(output, metadata.riverCarve), riverCarveBytes),
    writeFile(resolve(output, metadata.waterfallMask), waterfallMask),
    writeFile(resolve(output, metadata.waterMask), water.mask),
    writeFile(resolve(output, metadata.waterSurface), waterSurfaceBytes),
    writeFile(resolve(output, metadata.waterDepth), waterDepthBytes),
    writeFile(resolve(output, metadata.shorelineMask), runtimeWater.shoreline),
    writeFile(resolve(output, metadata.swimmableMask), runtimeWater.swimmable),
    writeFile(resolve(output, 'hydrology.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8'),
]);
console.log(`[generator] wrote hydrology in ${((performance.now() - started) / 1000).toFixed(2)} s`);
console.log(`[generator] ${rawDrainage.sinks} raw sinks; ${lakes.count} lakes; largest ${lakes.largestCellCount} cells`);
console.log(`[generator] maximum accumulation ${maximumAccumulation}`);
console.log(`[generator] selected ${rivers.routes.map((route) => `${route.kind}:${route.cells.length}`).join(', ')}`);
console.log(`[generator] detected ${waterfalls.length} waterfalls: ${waterfalls.map((site) => site.drop.toFixed(1)).join(', ')} m drops`);
console.log(`[generator] validation: ${runtimeWater.uphillRiverSegments} uphill segments; maximum rise ${runtimeWater.maximumUphillRise.toFixed(3)} m`);
console.log(`[generator] maximum neighbouring lake-level delta ${runtimeWater.maximumLakeNeighbourDelta.toFixed(3)} m`);
