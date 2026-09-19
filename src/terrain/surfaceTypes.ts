/** Matching CPU and WGSL biome thresholds restrict deformation to authored snow and sand. */

/** Measured COLOR_0 values in alpha-map.glb at the Rev B region centres. */
export const SAND_COLORS = [
    [0.822782, 0.679545, 0.417884],
    [0.760525, 0.630762, 0.401984],
] as const;

type NumericInput = ArrayLike<number>;
type NumericOutput = { [index: number]: number };

function smooth(a: number, b: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
}

/** Write [snow, sand] softness from authored RGB; roads, grass and rock remain firm. */
export function surfaceWeights<T extends NumericOutput>(color: NumericInput, out: T): T {
    out[0] = smooth(0.75, 0.87, Math.min(color[0], color[1], color[2]));
    const first = SAND_COLORS[0], second = SAND_COLORS[1];
    const distance = Math.min(
        Math.hypot(color[0] - first[0], color[1] - first[1], color[2] - first[2]),
        Math.hypot(color[0] - second[0], color[1] - second[1], color[2] - second[2]),
    );
    out[1] = 1 - smooth(0.025, 0.09, distance);
    return out;
}

/** The same palette and thresholds compiled into every GPU consumer. */
export const surfaceWGSL = `
fn surfaceWeights(color: vec3f) -> vec2f {
    let snow = smoothstep(0.75, 0.87, min(color.r, min(color.g, color.b)));
    let d = min(distance(color, vec3f(${SAND_COLORS[0].join(',')})), distance(color, vec3f(${SAND_COLORS[1].join(',')})));
    return vec2f(snow, 1.0 - smoothstep(0.025, 0.09, d));
}
fn localFade(world: vec2f, center: vec2f) -> f32 {
    let d = abs(world - center);
    return 1.0 - smoothstep(12.0, 16.0, max(d.x, d.y));
}
`;
