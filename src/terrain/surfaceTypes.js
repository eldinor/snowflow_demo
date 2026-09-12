// Measured COLOR_0 values in alpha-map.glb at the Rev B region centres.
export const SAND_COLORS = [[0.822782, 0.679545, 0.417884], [0.760525, 0.630762, 0.401984]];
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function surfaceWeights(color, out) {
    out[0] = smooth(0.75, 0.87, Math.min(color[0], color[1], color[2]));
    const a = SAND_COLORS[0], b = SAND_COLORS[1];
    const distance = Math.min(Math.hypot(color[0] - a[0], color[1] - a[1], color[2] - a[2]), Math.hypot(color[0] - b[0], color[1] - b[1], color[2] - b[2]));
    out[1] = 1 - smooth(0.025, 0.09, distance);
    return out;
}
// The same palette and thresholds are compiled into all GPU consumers.
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
