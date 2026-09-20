export interface RiverRoute {
    readonly kind: 'primary' | 'small';
    readonly cells: readonly number[];
}

export interface RiverNetwork {
    readonly routes: readonly RiverRoute[];
    readonly mask: Uint8Array;
}

const OFFSETS = [
    [-1, -1], [0, -1], [1, -1], [1, 0],
    [1, 1], [0, 1], [-1, 1], [-1, 0],
] as const;

function traceRoute(start: number, direction: Uint8Array, lakeMask: Uint8Array, width: number, height: number): number[] {
    const route: number[] = [];
    let cell = start;
    for (let step = 0; step < width + height; step++) {
        route.push(cell);
        const code = direction[cell];
        if (code === 0) break;
        const x = cell % width;
        const z = Math.floor(cell / width);
        const [dx, dz] = OFFSETS[code - 1];
        const nextX = x + dx;
        const nextZ = z + dz;
        if (nextX < 0 || nextX >= width || nextZ < 0 || nextZ >= height) break;
        const next = nextZ * width + nextX;
        route.push(next);
        if (lakeMask[next]) break;
        cell = next;
    }
    return route;
}

function paintRoute(mask: Uint8Array, route: readonly number[], width: number, height: number, radius: number, value: number): void {
    for (const cell of route) {
        const cx = cell % width;
        const cz = Math.floor(cell / width);
        for (let dz = -radius; dz <= radius; dz++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (dx * dx + dz * dz > radius * radius) continue;
                const x = cx + dx;
                const z = cz + dz;
                if (x < 0 || x >= width || z < 0 || z >= height) continue;
                mask[z * width + x] = Math.max(mask[z * width + x], value);
            }
        }
    }
}

/** Selects a deliberately sparse visible river network from the full drainage graph. */
export function selectRiverNetwork(
    direction: Uint8Array,
    accumulation: Float32Array,
    lakeMask: Uint8Array,
    width: number,
    height: number,
    options: {
        primaryCount: number;
        smallCount: number;
        minimumCells: number;
        maximumSmallCells: number;
        minimumSourceSeparation: number;
        primaryWidth: number;
        smallWidth: number;
    },
): RiverNetwork {
    const candidates: Array<{ source: number; route: number[]; score: number }> = [];
    for (let z = 2; z < height - 2; z += 4) {
        for (let x = 2; x < width - 2; x += 4) {
            const source = z * width + x;
            if (lakeMask[source] || accumulation[source] < 250) continue;
            const route = traceRoute(source, direction, lakeMask, width, height);
            if (route.length < options.minimumCells) continue;
            const score = route.length * Math.log2(accumulation[source] + 1);
            candidates.push({ source, route, score });
        }
    }
    candidates.sort((a, b) => b.score - a.score || a.source - b.source);
    const routes: RiverRoute[] = [];
    const occupied = new Uint8Array(direction.length);
    const accept = (candidate: { source: number; route: number[] }, kind: RiverRoute['kind']): boolean => {
        const sx = candidate.source % width;
        const sz = Math.floor(candidate.source / width);
        for (const selected of routes) {
            const other = selected.cells[0];
            const ox = other % width;
            const oz = Math.floor(other / width);
            if (Math.hypot(sx - ox, sz - oz) < options.minimumSourceSeparation) return false;
        }
        let unique = 0;
        for (const cell of candidate.route) if (!occupied[cell]) unique++;
        if (unique < options.minimumCells || unique / candidate.route.length < 0.45) return false;
        routes.push({ kind, cells: candidate.route });
        for (const cell of candidate.route) occupied[cell] = 1;
        return true;
    };
    for (const candidate of candidates) {
        if (routes.filter((route) => route.kind === 'primary').length >= options.primaryCount) break;
        accept(candidate, 'primary');
    }
    for (const candidate of candidates) {
        if (routes.filter((route) => route.kind === 'small').length >= options.smallCount) break;
        if (candidate.route.length > options.maximumSmallCells) continue;
        if (routes.some((route) => route.cells[0] === candidate.source)) continue;
        accept(candidate, 'small');
    }
    const mask = new Uint8Array(direction.length);
    for (const route of routes) paintRoute(
        mask, route.cells, width, height,
        route.kind === 'primary' ? options.primaryWidth : options.smallWidth,
        route.kind === 'primary' ? 255 : 150,
    );
    return { routes, mask };
}
