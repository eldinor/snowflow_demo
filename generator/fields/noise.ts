const UINT_RANGE = 4_294_967_296;

function mix32(value: number): number {
    let result = value >>> 0;
    result = Math.imul(result ^ (result >>> 16), 0x21f0aaad);
    result = Math.imul(result ^ (result >>> 15), 0x735a2d97);
    return (result ^ (result >>> 15)) >>> 0;
}

/** Deterministic integer-grid hash in the half-open range [0, 1). */
export function hash2D(seed: number, x: number, z: number): number {
    const xi = Math.trunc(x);
    const zi = Math.trunc(z);
    const mixed = mix32(seed ^ Math.imul(xi, 0x1f123bb5) ^ Math.imul(zi, 0x5f356495));
    return mixed / UINT_RANGE;
}

function smooth(value: number): number {
    return value * value * (3 - 2 * value);
}

function lerp(a: number, b: number, amount: number): number {
    return a + (b - a) * amount;
}

/** Continuous deterministic value noise used for broad field variation. */
export function valueNoise2D(seed: number, x: number, z: number): number {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const tx = smooth(x - x0);
    const tz = smooth(z - z0);
    const bottom = lerp(hash2D(seed, x0, z0), hash2D(seed, x0 + 1, z0), tx);
    const top = lerp(hash2D(seed, x0, z0 + 1), hash2D(seed, x0 + 1, z0 + 1), tx);
    return lerp(bottom, top, tz);
}

/** Normalized multi-octave noise for regional variation without external state. */
export function fractalNoise2D(
    seed: number,
    x: number,
    z: number,
    octaves = 4,
): number {
    let amplitude = 1;
    let frequency = 1;
    let total = 0;
    let amplitudeTotal = 0;
    for (let octave = 0; octave < octaves; octave++) {
        total += valueNoise2D(seed + octave * 1_013, x * frequency, z * frequency) * amplitude;
        amplitudeTotal += amplitude;
        amplitude *= 0.5;
        frequency *= 2;
    }
    return total / amplitudeTotal;
}
