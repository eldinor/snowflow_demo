/**
 * Blue is a region mask, not an elevation. Clip before raising the lake.
 * @module world/waterGeometry
 */

export interface TerrainWaterSource {
    positions: ArrayLike<number>;
    colors: ArrayLike<number>;
    indices: ArrayLike<number>;
}

export interface WaterMeshData {
    positions: number[];
    normals: number[];
    colors: number[];
    indices: number[];
}

export interface WaterReference {
    lake: ReadonlyArray<readonly [number, number]>;
    river: ReadonlyArray<readonly [number, number]>;
}

export interface BuiltWaterGeometry {
    lake: WaterMeshData;
    river: WaterMeshData;
    level: number;
}

type WaterVertex = [number, number, number, number];
type Point2 = readonly [number, number];

/** Blue is a region mask, not an elevation. */
export function blueWater(r: number, g: number, b: number): 0 | 1 {
    return b > r + .12 && b > g + .1 && r < .3 ? 1 : 0;
}

function clip(poly: WaterVertex[], value: (vertex: WaterVertex) => number): WaterVertex[] {
    const out: WaterVertex[] = [];
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length], va = value(a), vb = value(b);
        if (va >= 0) out.push(a);
        if ((va >= 0) !== (vb >= 0)) {
            const t = va / (va - vb);
            out.push(a.map((x, k) => x + (b[k] - x) * t) as WaterVertex);
        }
    }
    return out;
}

function inside(x: number, z: number, poly: ReadonlyArray<Point2>): boolean {
    let yes = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j];
        if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes;
    }
    return yes;
}

function riverDistance(x: number, z: number, line: ReadonlyArray<Point2>): number {
    let nearest = Infinity;
    for (let i = 1; i < line.length; i++) {
        const a = line[i - 1], b = line[i], dx = b[0] - a[0], dz = b[1] - a[1];
        const lengthSquared = dx * dx + dz * dz;
        const t = lengthSquared > 0
            ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / lengthSquared))
            : 0;
        nearest = Math.min(nearest, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
    }
    return nearest;
}

/**
 * Clip the blue vertex mask to the lake level and authored river corridor.
 * Lake colour.r stores depth; river colour stores flow and slope metadata.
 */
export function buildWaterGeometry(
    data: TerrainWaterSource,
    reference: WaterReference,
    level = 0,
): BuiltWaterGeometry {
    const lake: WaterMeshData = { positions: [], normals: [], colors: [], indices: [] };
    const river: WaterMeshData = { positions: [], normals: [], colors: [], indices: [] };
    // Chart east/north -> the same Babylon frame used by spawn points.
    const polygon: Point2[] = reference.lake.map(([x, z]) => [-x, -z]);
    const line: Point2[] = reference.river.map(([x, z]) => [-x, -z]);
    const p = data.positions, c = data.colors, ix = data.indices;

    function append(target: WaterMeshData, poly: WaterVertex[], flow = false): void {
        if (poly.length < 3) return;
        const a = poly[0], b = poly[1], d = poly[2];
        let nx = (b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]);
        let ny = (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]);
        let nz = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
        const length = Math.hypot(nx, ny, nz);
        if (length < 1e-8) return;
        const sign = ny < 0 ? -1 : 1;
        nx *= sign / length; ny *= sign / length; nz *= sign / length;
        const slope = Math.hypot(nx, nz), fx = slope > .001 ? nx / slope : 0, fz = slope > .001 ? nz / slope : 1;
        const start = target.positions.length / 3;
        for (const v of poly) {
            target.positions.push(v[0] + (flow ? nx * .08 : 0), flow ? v[1] + ny * .08 : level + .025, v[2] + (flow ? nz * .08 : 0));
            target.normals.push(flow ? nx : 0, flow ? ny : 1, flow ? nz : 0);
            target.colors.push(flow ? .25 : Math.max(0, level - v[1]), flow ? fx : 0, flow ? fz : 0, flow ? slope : 0);
        }
        for (let i = 1; i < poly.length - 1; i++) target.indices.push(start, start + i, start + i + 1);
    }

    for (let i = 0; i < ix.length; i += 3) {
        const tri: WaterVertex[] = [Number(ix[i]), Number(ix[i + 1]), Number(ix[i + 2])].map(k => [
            p[k * 3], p[k * 3 + 1], p[k * 3 + 2], blueWater(c[k * 4], c[k * 4 + 1], c[k * 4 + 2]),
        ]);
        if (!tri.some(v => v[3])) continue;
        const wet = clip(tri, v => v[3] - .5);
        if (wet.length < 3) continue;
        const x = wet.reduce((sum, v) => sum + v[0], 0) / wet.length;
        const z = wet.reduce((sum, v) => sum + v[2], 0) / wet.length;
        if (inside(x, z, polygon)) append(lake, clip(wet, v => level - v[1]));
        // Permit the documented warp while excluding blue ocean/mountains
        // outside the authored river corridor. The blue mask supplies its edges.
        if (riverDistance(x, z, line) < 55) append(river, clip(wet, v => v[1] - level), true);
    }
    return { lake, river, level };
}
