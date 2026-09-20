import type { RiverRoute } from './rivers.ts';

export interface WaterfallSite {
    readonly route: number;
    readonly cell: number;
    readonly drop: number;
}

export interface WaterRuntimeFields {
    readonly depth: Float32Array;
    readonly shoreline: Uint8Array;
    readonly swimmable: Uint8Array;
    readonly uphillRiverSegments: number;
    readonly maximumUphillRise: number;
    readonly maximumLakeNeighbourDelta: number;
}

/** Builds runtime water-contact fields and validates retained river surfaces. */
export function buildWaterRuntimeFields(
    waterMask: Uint8Array,
    waterSurface: Float32Array,
    terrainElevation: Float32Array,
    riverCarve: Float32Array,
    lakeMask: Uint8Array,
    routes: readonly RiverRoute[],
    width: number,
    height: number,
    swimmingDepth = 1.2,
): WaterRuntimeFields {
    const depth = new Float32Array(waterMask.length);
    const shoreline = new Uint8Array(waterMask.length);
    const swimmable = new Uint8Array(waterMask.length);
    for (let z = 0; z < height; z++) for (let x = 0; x < width; x++) {
        const cell = z * width + x;
        if (!waterMask[cell]) continue;
        depth[cell] = Math.max(0, waterSurface[cell] - (terrainElevation[cell] + riverCarve[cell]));
        if (depth[cell] >= swimmingDepth) swimmable[cell] = 255;
        for (let dz = -1; dz <= 1 && !shoreline[cell]; dz++) for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const nz = z + dz;
            if (nx < 0 || nx >= width || nz < 0 || nz >= height || !waterMask[nz * width + nx]) {
                shoreline[cell] = 255;
                break;
            }
        }
    }
    let uphillRiverSegments = 0;
    let maximumUphillRise = 0;
    let maximumLakeNeighbourDelta = 0;
    for (let z = 0; z < height; z++) for (let x = 0; x < width; x++) {
        const cell = z * width + x;
        if (!lakeMask[cell]) continue;
        if (x + 1 < width && lakeMask[cell + 1]) maximumLakeNeighbourDelta = Math.max(maximumLakeNeighbourDelta, Math.abs(waterSurface[cell] - waterSurface[cell + 1]));
        if (z + 1 < height && lakeMask[cell + width]) maximumLakeNeighbourDelta = Math.max(maximumLakeNeighbourDelta, Math.abs(waterSurface[cell] - waterSurface[cell + width]));
    }
    for (const route of routes) for (let index = 0; index + 1 < route.cells.length; index++) {
        const rise = waterSurface[route.cells[index + 1]] - waterSurface[route.cells[index]];
        if (rise > 0.05) {
            uphillRiverSegments++;
            maximumUphillRise = Math.max(maximumUphillRise, rise);
        }
    }
    return { depth, shoreline, swimmable, uphillRiverSegments, maximumUphillRise, maximumLakeNeighbourDelta };
}

export function buildWaterSurface(
    elevation: Float32Array,
    lakeMask: Uint8Array,
    lakeSurface: Float32Array,
    riverMask: Uint8Array,
    riverCarve: Float32Array,
    width: number,
    height: number,
    routes: readonly RiverRoute[] = [],
    paddingCells = 3,
): { mask: Uint8Array; surface: Float32Array } {
    const mask = new Uint8Array(elevation.length);
    const surface = new Float32Array(elevation.length);
    for (let cell = 0; cell < elevation.length; cell++) {
        // Dry vertices retain terrain height so shoreline triangles never
        // interpolate toward zero elevation before the fragment mask clips them.
        surface[cell] = elevation[cell] + riverCarve[cell];
        if (lakeMask[cell]) {
            mask[cell] = 255;
            surface[cell] = lakeSurface[cell];
        } else if (riverMask[cell]) {
            mask[cell] = riverMask[cell];
            surface[cell] = elevation[cell] + riverCarve[cell] * 0.25;
        }
    }
    // Priority-flood routing can cross small rises in the unmodified terrain.
    // Lower only the derived channel and water layers to guarantee downstream
    // continuity without changing the authoritative base height field.
    for (const route of routes) {
        let previous = Number.POSITIVE_INFINITY;
        const minimumDepth = route.kind === 'primary' ? 1.2 : 0.45;
        const processed: number[] = [];
        let receivingLakeLevel: number | null = null;
        for (const cell of route.cells) {
            if (lakeMask[cell]) {
                receivingLakeLevel = surface[cell];
                break;
            }
            const corrected = Math.min(surface[cell], previous - 0.002);
            surface[cell] = corrected;
            riverCarve[cell] = Math.min(riverCarve[cell], corrected - elevation[cell] - minimumDepth);
            previous = corrected;
            processed.push(cell);
        }
        if (receivingLakeLevel !== null) {
            let required = receivingLakeLevel + 0.002;
            for (let index = processed.length - 1; index >= 0; index--) {
                const cell = processed[index];
                surface[cell] = Math.max(surface[cell], required);
                riverCarve[cell] = Math.min(riverCarve[cell], surface[cell] - elevation[cell] - minimumDepth);
                required = surface[cell] + 0.002;
            }
        }
    }
    // Extend surface elevation invisibly beyond the visible mask. The water
    // shader still clips to `mask`, but boundary triangles interpolate between
    // compatible heights instead of stretching from water level to dry ground.
    if (width * height !== elevation.length) throw new Error('Water-surface dimensions do not match.');
    {
        let support = new Uint8Array(mask);
        for (let iteration = 0; iteration < paddingCells; iteration++) {
            const nextSupport = new Uint8Array(support);
            const nextSurface = new Float32Array(surface);
            for (let z = 0; z < height; z++) for (let x = 0; x < width; x++) {
                const cell = z * width + x;
                if (support[cell]) continue;
                let total = 0;
                let samples = 0;
                for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx;
                    const nz = z + dz;
                    if (nx < 0 || nx >= width || nz < 0 || nz >= height) continue;
                    const neighbour = nz * width + nx;
                    if (!support[neighbour]) continue;
                    total += surface[neighbour];
                    samples++;
                }
                if (samples > 0) {
                    nextSupport[cell] = 1;
                    nextSurface[cell] = total / samples;
                }
            }
            support = nextSupport;
            surface.set(nextSurface);
        }
    }
    return { mask, surface };
}

/** Produces a smooth negative displacement layer without mutating base terrain. */
export function carveRiverBeds(
    routes: readonly RiverRoute[], width: number, height: number,
    primaryRadius: number, smallRadius: number,
    primaryDepth: number, smallDepth: number,
): Float32Array {
    const carve = new Float32Array(width * height);
    for (const route of routes) {
        const radius = route.kind === 'primary' ? primaryRadius : smallRadius;
        const depth = route.kind === 'primary' ? primaryDepth : smallDepth;
        for (const cell of route.cells) {
            const cx = cell % width;
            const cz = Math.floor(cell / width);
            for (let dz = -radius; dz <= radius; dz++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    const distance = Math.hypot(dx, dz);
                    if (distance > radius) continue;
                    const x = cx + dx;
                    const z = cz + dz;
                    if (x < 0 || x >= width || z < 0 || z >= height) continue;
                    const profile = Math.cos(distance / radius * Math.PI * 0.5) ** 2;
                    const offset = -depth * profile;
                    const target = z * width + x;
                    carve[target] = Math.min(carve[target], offset);
                }
            }
        }
    }
    return carve;
}

/** Finds a small number of separated steep drops along retained river routes. */
export function detectWaterfalls(
    routes: readonly RiverRoute[], elevation: Float32Array,
    windowCells: number, minimumDrop: number, separationCells: number, maximumSites: number,
): WaterfallSite[] {
    const candidates: WaterfallSite[] = [];
    for (let routeIndex = 0; routeIndex < routes.length; routeIndex++) {
        const cells = routes[routeIndex].cells;
        for (let index = 0; index + windowCells < cells.length; index++) {
            const drop = elevation[cells[index]] - elevation[cells[index + windowCells]];
            if (drop >= minimumDrop) candidates.push({ route: routeIndex, cell: index, drop });
        }
    }
    candidates.sort((a, b) => b.drop - a.drop || a.route - b.route || a.cell - b.cell);
    const selected: WaterfallSite[] = [];
    for (const candidate of candidates) {
        if (selected.some((site) => site.route === candidate.route && Math.abs(site.cell - candidate.cell) < separationCells)) continue;
        selected.push(candidate);
        if (selected.length >= maximumSites) break;
    }
    return selected.sort((a, b) => a.route - b.route || a.cell - b.cell);
}

export function paintWaterfallMask(
    sites: readonly WaterfallSite[], routes: readonly RiverRoute[], width: number, height: number,
): Uint8Array {
    const mask = new Uint8Array(width * height);
    for (const site of sites) {
        const cell = routes[site.route].cells[site.cell];
        const cx = cell % width;
        const cz = Math.floor(cell / width);
        for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
            if (dx * dx + dz * dz > 16) continue;
            const x = cx + dx;
            const z = cz + dz;
            if (x >= 0 && x < width && z >= 0 && z < height) mask[z * width + x] = 255;
        }
    }
    return mask;
}
