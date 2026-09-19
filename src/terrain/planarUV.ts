/** Recover an authored planar UV projection without guessing scale or handedness. */

type NumericArray = ArrayLike<number>;
export type PlanarAxis = [x: number, z: number, offset: number];
export interface PlanarUVFit { u: PlanarAxis; v: PlanarAxis; maxError: number }

/** Solve U/V as affine functions of world X/Z and reject non-planar mappings. */
export function fitPlanarUV(positions: NumericArray, uvs: NumericArray): PlanarUVFit {
    const x0 = positions[0], z0 = positions[2];
    let b = -1, c = -1, span = 0;
    for (let i = 3; i < positions.length; i += 3) {
        const distance = Math.hypot(positions[i] - x0, positions[i + 2] - z0);
        if (distance > span) { b = i; span = distance; }
    }
    if (b < 0) throw new Error('Ground UV projection has no distinct positions');
    const bx = positions[b] - x0, bz = positions[b + 2] - z0;
    let determinant = 0;
    for (let i = 3; i < positions.length; i += 3) {
        const candidate = bx * (positions[i + 2] - z0) - bz * (positions[i] - x0);
        if (Math.abs(candidate) > Math.abs(determinant)) { c = i; determinant = candidate; }
    }
    if (c < 0) throw new Error('Ground UV projection has no noncollinear positions');
    const cx = positions[c] - x0, cz = positions[c + 2] - z0;
    const axes = ([0, 1] as const).map((component): PlanarAxis => {
        const bu = uvs[b / 3 * 2 + component] - uvs[component];
        const cu = uvs[c / 3 * 2 + component] - uvs[component];
        const x = (bu * cz - cu * bz) / determinant;
        const z = (bx * cu - cx * bu) / determinant;
        return [x, z, uvs[component] - x * x0 - z * z0];
    });
    let maxError = 0;
    for (let i = 0; i < positions.length; i += 3) for (let component = 0; component < 2; component++) {
        const axis = axes[component];
        maxError = Math.max(maxError, Math.abs(
            axis[0] * positions[i] + axis[1] * positions[i + 2] + axis[2] - uvs[i / 3 * 2 + component],
        ));
    }
    if (maxError > .01) throw new Error(`Ground UVs are not planar (error ${maxError})`);
    return { u: axes[0], v: axes[1], maxError };
}
