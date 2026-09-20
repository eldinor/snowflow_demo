export interface HydrologyFields {
    readonly direction: Uint8Array;
    readonly accumulation: Float32Array;
    readonly sinks: number;
    readonly maximumAccumulation: number;
}

export interface DepressionFill {
    readonly elevation: Float32Array;
    readonly depth: Float32Array;
    readonly direction: Uint8Array;
}

export interface LakeClassification {
    readonly mask: Uint8Array;
    readonly surface: Float32Array;
    readonly count: number;
    readonly largestCellCount: number;
}

const NEIGHBOURS = [
    [-1, -1], [0, -1], [1, -1], [1, 0],
    [1, 1], [0, 1], [-1, 1], [-1, 0],
] as const;

/** Priority-floods closed depressions and records an acyclic route to an edge outlet. */
export function fillDepressions(source: Float32Array, width: number, height: number): DepressionFill {
    if (source.length !== width * height) throw new Error('Depression-fill dimensions do not match.');
    const elevation = new Float32Array(source);
    const depth = new Float32Array(source.length);
    const direction = new Uint8Array(source.length);
    const visited = new Uint8Array(source.length);
    const heapCells = new Int32Array(source.length);
    const heapHeights = new Float32Array(source.length);
    let heapSize = 0;
    const push = (cell: number, value: number): void => {
        let index = heapSize++;
        while (index > 0) {
            const parent = (index - 1) >> 1;
            if (heapHeights[parent] <= value) break;
            heapCells[index] = heapCells[parent];
            heapHeights[index] = heapHeights[parent];
            index = parent;
        }
        heapCells[index] = cell;
        heapHeights[index] = value;
    };
    const pop = (): number => {
        const result = heapCells[0];
        const lastCell = heapCells[--heapSize];
        const lastHeight = heapHeights[heapSize];
        let index = 0;
        while (true) {
            const left = index * 2 + 1;
            if (left >= heapSize) break;
            const right = left + 1;
            const child = right < heapSize && heapHeights[right] < heapHeights[left] ? right : left;
            if (heapHeights[child] >= lastHeight) break;
            heapCells[index] = heapCells[child];
            heapHeights[index] = heapHeights[child];
            index = child;
        }
        if (heapSize > 0) {
            heapCells[index] = lastCell;
            heapHeights[index] = lastHeight;
        }
        return result;
    };
    const seed = (cell: number): void => {
        if (visited[cell]) return;
        visited[cell] = 1;
        push(cell, elevation[cell]);
    };
    for (let x = 0; x < width; x++) {
        seed(x);
        seed((height - 1) * width + x);
    }
    for (let z = 1; z < height - 1; z++) {
        seed(z * width);
        seed(z * width + width - 1);
    }
    while (heapSize > 0) {
        const cell = pop();
        const x = cell % width;
        const z = Math.floor(cell / width);
        for (let index = 0; index < NEIGHBOURS.length; index++) {
            const [dx, dz] = NEIGHBOURS[index];
            const nx = x + dx;
            const nz = z + dz;
            if (nx < 0 || nx >= width || nz < 0 || nz >= height) continue;
            const neighbour = nz * width + nx;
            if (visited[neighbour]) continue;
            visited[neighbour] = 1;
            const original = source[neighbour];
            const filled = Math.max(original, elevation[cell]);
            elevation[neighbour] = filled;
            depth[neighbour] = filled - original;
            direction[neighbour] = ((index + 4) % 8) + 1;
            push(neighbour, filled);
        }
    }
    return { elevation, depth, direction };
}

/** Keeps the largest meaningful flooded basins; minor depressions remain terrain/wetland. */
export function classifyLakes(
    fill: DepressionFill,
    width: number,
    height: number,
    minimumDepth = 0.25,
    minimumCells = 8,
    maximumLakes = 6,
): LakeClassification {
    const mask = new Uint8Array(fill.depth.length);
    const surface = new Float32Array(fill.depth.length);
    const visited = new Uint8Array(fill.depth.length);
    const basin = new Int32Array(fill.depth.length).fill(-1);
    const queue = new Int32Array(fill.depth.length);
    const candidates: Array<{ id: number; cells: number }> = [];
    for (let start = 0; start < fill.depth.length; start++) {
        if (visited[start] || fill.depth[start] < minimumDepth) continue;
        let read = 0;
        let write = 0;
        visited[start] = 1;
        queue[write++] = start;
        while (read < write) {
            const cell = queue[read++];
            const x = cell % width;
            const z = Math.floor(cell / width);
            for (const [dx, dz] of NEIGHBOURS) {
                const nx = x + dx;
                const nz = z + dz;
                if (nx < 0 || nx >= width || nz < 0 || nz >= height) continue;
                const neighbour = nz * width + nx;
                if (visited[neighbour] || fill.depth[neighbour] < minimumDepth) continue;
                visited[neighbour] = 1;
                queue[write++] = neighbour;
            }
        }
        if (write < minimumCells) continue;
        const id = candidates.length;
        candidates.push({ id, cells: write });
        for (let index = 0; index < write; index++) basin[queue[index]] = id;
    }
    const retained = candidates
        .sort((a, b) => b.cells - a.cells || a.id - b.id)
        .slice(0, maximumLakes);
    const retainedIds = new Uint8Array(candidates.length);
    for (const candidate of retained) retainedIds[candidate.id] = 1;
    for (let cell = 0; cell < basin.length; cell++) {
        if (basin[cell] < 0 || !retainedIds[basin[cell]]) continue;
        mask[cell] = 255;
        surface[cell] = fill.elevation[cell];
    }
    return {
        mask,
        surface,
        count: retained.length,
        largestCellCount: retained[0]?.cells ?? 0,
    };
}

/** Builds deterministic D8 drainage and upstream cell counts from a height grid. */
export function buildHydrology(elevation: Float32Array, width: number, height: number): HydrologyFields {
    if (elevation.length !== width * height) throw new Error('Hydrology elevation dimensions do not match.');
    const direction = new Uint8Array(elevation.length);
    const downstream = new Int32Array(elevation.length);
    const incoming = new Uint8Array(elevation.length);
    const accumulation = new Float32Array(elevation.length).fill(1);
    direction.fill(0); // 0 is a sink; directions are stored as D8 index + 1.
    downstream.fill(-1);
    let sinks = 0;
    for (let z = 0; z < height; z++) {
        for (let x = 0; x < width; x++) {
            const cell = z * width + x;
            const sourceHeight = elevation[cell];
            let bestSlope = 0;
            let best = -1;
            let bestDirection = 0;
            for (let index = 0; index < NEIGHBOURS.length; index++) {
                const [dx, dz] = NEIGHBOURS[index];
                const nx = x + dx;
                const nz = z + dz;
                if (nx < 0 || nx >= width || nz < 0 || nz >= height) continue;
                const neighbour = nz * width + nx;
                const drop = sourceHeight - elevation[neighbour];
                const slope = drop / (dx !== 0 && dz !== 0 ? Math.SQRT2 : 1);
                if (slope > bestSlope) {
                    bestSlope = slope;
                    best = neighbour;
                    bestDirection = index + 1;
                }
            }
            if (best < 0) {
                sinks++;
            } else {
                direction[cell] = bestDirection;
                downstream[cell] = best;
                incoming[best]++;
            }
        }
    }
    const queue = new Int32Array(elevation.length);
    let read = 0;
    let write = 0;
    for (let cell = 0; cell < incoming.length; cell++) {
        if (incoming[cell] === 0) queue[write++] = cell;
    }
    let maximumAccumulation = 1;
    while (read < write) {
        const cell = queue[read++];
        const target = downstream[cell];
        if (target < 0) continue;
        accumulation[target] += accumulation[cell];
        maximumAccumulation = Math.max(maximumAccumulation, accumulation[target]);
        incoming[target]--;
        if (incoming[target] === 0) queue[write++] = target;
    }
    return { direction, accumulation, sinks, maximumAccumulation };
}

/** Accumulates contributing cells through an acyclic encoded D8 direction field. */
export function accumulateDirections(direction: Uint8Array, width: number, height: number): Float32Array {
    if (direction.length !== width * height) throw new Error('Flow-direction dimensions do not match.');
    const incoming = new Uint8Array(direction.length);
    const downstream = new Int32Array(direction.length).fill(-1);
    for (let cell = 0; cell < direction.length; cell++) {
        const code = direction[cell];
        if (code === 0) continue;
        const x = cell % width;
        const z = Math.floor(cell / width);
        const [dx, dz] = NEIGHBOURS[code - 1];
        const target = (z + dz) * width + x + dx;
        downstream[cell] = target;
        incoming[target]++;
    }
    const accumulation = new Float32Array(direction.length).fill(1);
    const queue = new Int32Array(direction.length);
    let read = 0;
    let write = 0;
    for (let cell = 0; cell < incoming.length; cell++) if (incoming[cell] === 0) queue[write++] = cell;
    while (read < write) {
        const cell = queue[read++];
        const target = downstream[cell];
        if (target < 0) continue;
        accumulation[target] += accumulation[cell];
        incoming[target]--;
        if (incoming[target] === 0) queue[write++] = target;
    }
    return accumulation;
}
