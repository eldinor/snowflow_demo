export interface RoadPoint { readonly x: number; readonly z: number }
export interface RoadRoute { readonly from: string; readonly to: string; readonly points: readonly RoadPoint[] }

class MinHeap {
    private readonly cells: number[] = [];
    private readonly scores: number[] = [];
    public get size(): number { return this.cells.length; }
    public push(cell: number, score: number): void {
        let index = this.cells.length;
        this.cells.push(cell); this.scores.push(score);
        while (index > 0) {
            const parent = (index - 1) >> 1;
            if (this.scores[parent] <= score) break;
            this.cells[index] = this.cells[parent]; this.scores[index] = this.scores[parent]; index = parent;
        }
        this.cells[index] = cell; this.scores[index] = score;
    }
    public pop(): number {
        const result = this.cells[0];
        const cell = this.cells.pop()!;
        const score = this.scores.pop()!;
        if (this.cells.length === 0) return result;
        let index = 0;
        while (true) {
            const left = index * 2 + 1;
            if (left >= this.cells.length) break;
            const right = left + 1;
            const child = right < this.cells.length && this.scores[right] < this.scores[left] ? right : left;
            if (this.scores[child] >= score) break;
            this.cells[index] = this.cells[child]; this.scores[index] = this.scores[child]; index = child;
        }
        this.cells[index] = cell; this.scores[index] = score;
        return result;
    }
}

const DIRECTIONS = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]] as const;

/** Routes one road on a regular world grid while forbidding water and extreme grades. */
export function routeRoad(
    start: RoadPoint,
    goal: RoadPoint,
    origin: readonly [number, number],
    width: number,
    height: number,
    spacing: number,
    elevation: (x: number, z: number) => number,
    blocked: (x: number, z: number) => boolean,
    maximumGrade = 0.55,
    traversalCost: (x: number, z: number) => number = () => 1,
    minimumTraversalCost = 1,
): RoadPoint[] {
    const columns = Math.floor(width / spacing) + 1;
    const rows = Math.floor(height / spacing) + 1;
    const toGrid = (point: RoadPoint): [number, number] => [
        Math.max(0, Math.min(columns - 1, Math.round((point.x - origin[0]) / spacing))),
        Math.max(0, Math.min(rows - 1, Math.round((point.z - origin[1]) / spacing))),
    ];
    const [sx, sz] = toGrid(start);
    const [gx, gz] = toGrid(goal);
    const startCell = sz * columns + sx;
    const goalCell = gz * columns + gx;
    const costs = new Float64Array(columns * rows).fill(Number.POSITIVE_INFINITY);
    const previous = new Int32Array(columns * rows).fill(-1);
    const closed = new Uint8Array(columns * rows);
    const heap = new MinHeap();
    costs[startCell] = 0;
    heap.push(startCell, 0);
    while (heap.size > 0) {
        const cell = heap.pop();
        if (closed[cell]) continue;
        closed[cell] = 1;
        if (cell === goalCell) break;
        const xIndex = cell % columns;
        const zIndex = Math.floor(cell / columns);
        const x = origin[0] + xIndex * spacing;
        const z = origin[1] + zIndex * spacing;
        const sourceHeight = elevation(x, z);
        for (const [dx, dz] of DIRECTIONS) {
            const nx = xIndex + dx;
            const nz = zIndex + dz;
            if (nx < 0 || nx >= columns || nz < 0 || nz >= rows) continue;
            const worldX = origin[0] + nx * spacing;
            const worldZ = origin[1] + nz * spacing;
            if (blocked(worldX, worldZ) && !(nx === gx && nz === gz)) continue;
            const distance = spacing * (dx !== 0 && dz !== 0 ? Math.SQRT2 : 1);
            let crossesBlockedTerrain = false;
            const edgeSamples = Math.max(2, Math.ceil(distance / Math.max(1, spacing * 0.25)));
            for (let sample = 1; sample < edgeSamples; sample++) {
                const amount = sample / edgeSamples;
                if (blocked(x + (worldX - x) * amount, z + (worldZ - z) * amount)) {
                    crossesBlockedTerrain = true;
                    break;
                }
            }
            if (crossesBlockedTerrain) continue;
            const grade = Math.abs(elevation(worldX, worldZ) - sourceHeight) / distance;
            if (grade > maximumGrade) continue;
            const next = nz * columns + nx;
            const terrainCost = Math.max(minimumTraversalCost, traversalCost(worldX, worldZ));
            const cost = costs[cell] + distance * (1 + grade * grade * 35) * terrainCost;
            if (cost >= costs[next]) continue;
            costs[next] = cost;
            previous[next] = cell;
            heap.push(next, cost + Math.hypot(gx - nx, gz - nz) * spacing * minimumTraversalCost);
        }
    }
    if (previous[goalCell] < 0 && goalCell !== startCell) throw new Error('No dry road route found.');
    const points: RoadPoint[] = [];
    for (let cell = goalCell; cell >= 0; cell = previous[cell]) {
        points.push({ x: origin[0] + (cell % columns) * spacing, z: origin[1] + Math.floor(cell / columns) * spacing });
        if (cell === startCell) break;
    }
    return points.reverse();
}

export function paintRoadMask(routes: readonly RoadRoute[], resolution: number, origin: readonly [number, number], extent: readonly [number, number], radiusCells = 3): Uint8Array {
    const mask = new Uint8Array(resolution * resolution);
    const paint = (cx: number, cz: number): void => {
        for (let dz = -radiusCells; dz <= radiusCells; dz++) for (let dx = -radiusCells; dx <= radiusCells; dx++) {
            if (dx * dx + dz * dz > radiusCells * radiusCells) continue;
            const x = cx + dx, z = cz + dz;
            if (x >= 0 && x < resolution && z >= 0 && z < resolution) mask[z * resolution + x] = 255;
        }
    };
    for (const route of routes) for (let index = 0; index < route.points.length; index++) {
        const point = route.points[index];
        const cx = (point.x - origin[0]) / extent[0] * resolution;
        const cz = (point.z - origin[1]) / extent[1] * resolution;
        if (index === 0) {
            paint(Math.round(cx), Math.round(cz));
            continue;
        }
        const previous = route.points[index - 1];
        const px = (previous.x - origin[0]) / extent[0] * resolution;
        const pz = (previous.z - origin[1]) / extent[1] * resolution;
        const steps = Math.max(1, Math.ceil(Math.hypot(cx - px, cz - pz)));
        for (let step = 1; step <= steps; step++) {
            const t = step / steps;
            paint(Math.round(px + (cx - px) * t), Math.round(pz + (cz - pz) * t));
        }
    }
    return mask;
}

/** Removes collinear A* nodes while keeping every direction change as a control point. */
export function simplifyRoadPoints(points: readonly RoadPoint[]): RoadPoint[] {
    if (points.length <= 2) return [...points];
    const result: RoadPoint[] = [points[0]];
    let previousDx = Math.sign(points[1].x - points[0].x);
    let previousDz = Math.sign(points[1].z - points[0].z);
    for (let index = 1; index < points.length - 1; index++) {
        const dx = Math.sign(points[index + 1].x - points[index].x);
        const dz = Math.sign(points[index + 1].z - points[index].z);
        if (dx !== previousDx || dz !== previousDz) result.push(points[index]);
        previousDx = dx;
        previousDz = dz;
    }
    result.push(points[points.length - 1]);
    return result;
}

function segmentAllowed(a: RoadPoint, b: RoadPoint, allowed: (x: number, z: number) => boolean, sampleStep: number): boolean {
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(length / sampleStep));
    for (let step = 0; step <= steps; step++) {
        const t = step / steps;
        if (!allowed(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
    }
    return true;
}

/** Rounds grid-path corners with quadratic curves, retaining a corner when its curve enters forbidden terrain. */
export function roundRoadCorners(
    points: readonly RoadPoint[],
    turnRadius: number,
    allowed: (x: number, z: number) => boolean,
    sampleStep = 4,
): RoadPoint[] {
    if (points.length <= 2) return [...points];
    const result: RoadPoint[] = [points[0]];
    for (let index = 1; index < points.length - 1; index++) {
        const previous = points[index - 1], corner = points[index], next = points[index + 1];
        const previousLength = Math.hypot(corner.x - previous.x, corner.z - previous.z);
        const nextLength = Math.hypot(next.x - corner.x, next.z - corner.z);
        const incomingX = (corner.x - previous.x) / previousLength;
        const incomingZ = (corner.z - previous.z) / previousLength;
        const outgoingX = (next.x - corner.x) / nextLength;
        const outgoingZ = (next.z - corner.z) / nextLength;
        const directionDot = incomingX * outgoingX + incomingZ * outgoingZ;
        if (directionDot > 0.999) continue;
        const cut = Math.min(turnRadius, previousLength * 0.35, nextLength * 0.35);
        const entry = { x: corner.x - incomingX * cut, z: corner.z - incomingZ * cut };
        const exit = { x: corner.x + outgoingX * cut, z: corner.z + outgoingZ * cut };
        const curveLength = Math.hypot(entry.x - corner.x, entry.z - corner.z)
            + Math.hypot(exit.x - corner.x, exit.z - corner.z);
        const steps = Math.max(2, Math.ceil(curveLength / sampleStep));
        const curve: RoadPoint[] = [];
        for (let step = 0; step <= steps; step++) {
            const t = step / steps, inverse = 1 - t;
            curve.push({
                x: inverse * inverse * entry.x + 2 * inverse * t * corner.x + t * t * exit.x,
                z: inverse * inverse * entry.z + 2 * inverse * t * corner.z + t * t * exit.z,
            });
        }
        const candidate = [result[result.length - 1], ...curve];
        const valid = candidate.slice(1).every((point, candidateIndex) => segmentAllowed(
            candidate[candidateIndex], point, allowed, Math.min(sampleStep, 2),
        ));
        if (valid) result.push(...curve);
        else result.push(corner);
    }
    const last = points[points.length - 1];
    if (segmentAllowed(result[result.length - 1], last, allowed, Math.min(sampleStep, 2))) result.push(last);
    else result.push(points[points.length - 2], last);
    return result;
}
