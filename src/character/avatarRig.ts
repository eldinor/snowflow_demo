/** Stable authoring and runtime contract for Exalted's procedural humanoid rig. */

export const AVATAR_RIG_ID = 'exalted-humanoid-v1' as const;
export const AVATAR_EXCHANGE_VERSION = 1 as const;

export const B_ROOT = 0;
export const B_SPINE = 1;
export const B_CHEST = 2;
export const B_NECK = 3;
export const B_HEAD = 4;
export const B_HOOD = 5;
export const B_UPPER_L = 6;
export const B_FORE_L = 7;
export const B_HAND_L = 8;
export const B_UPPER_R = 9;
export const B_FORE_R = 10;
export const B_HAND_R = 11;
export const B_THIGH_L = 12;
export const B_SHIN_L = 13;
export const B_FOOT_L = 14;
export const B_THIGH_R = 15;
export const B_SHIN_R = 16;
export const B_FOOT_R = 17;
export const BONE_COUNT = 18;

export const AVATAR_BONE_NAMES = [
    'root', 'spine', 'chest', 'neck', 'head', 'hood',
    'upper_arm.L', 'forearm.L', 'hand.L',
    'upper_arm.R', 'forearm.R', 'hand.R',
    'thigh.L', 'shin.L', 'foot.L',
    'thigh.R', 'shin.R', 'foot.R',
] as const;

export type AvatarBoneName = typeof AVATAR_BONE_NAMES[number];

/** Parent indices used by standard authoring skeletons; runtime matrices remain world-space. */
export const AVATAR_BONE_PARENTS = [
    -1, B_ROOT, B_SPINE, B_CHEST, B_NECK, B_HEAD,
    B_CHEST, B_UPPER_L, B_FORE_L,
    B_CHEST, B_UPPER_R, B_FORE_R,
    B_ROOT, B_THIGH_L, B_SHIN_L,
    B_ROOT, B_THIGH_R, B_SHIN_R,
] as const;

/**
 * World-space bind frames, nine floats per bone:
 * joint position, local +Y direction, and local +Z reference.
 */
export const AVATAR_BIND_FRAMES = new Float32Array([
    0, 0.95, 0, 0, 1, 0, 0, 0, 1,
    0, 1.06, 0, 0, 1, 0, 0, 0, 1,
    0, 1.26, 0, 0, 1, 0, 0, 0, 1,
    0, 1.46, 0, 0, 1, 0, 0, 0, 1,
    0, 1.55, 0, 0, 1, 0, 0, 0, 1,
    0, 1.55, 0, 0, 1, 0, 0, 0, 1,
    -0.185, 1.400, 0.000, -0.16, -0.987, 0, 0, 0, 1,
    -0.230, 1.123, 0.000, -0.05, -0.997, 0.06, 0, 0, 1,
    -0.243, 0.866, 0.016, -0.02, -0.992, 0.12, 0, 0, 1,
    0.185, 1.400, 0.000, 0.16, -0.987, 0, 0, 0, 1,
    0.230, 1.123, 0.000, 0.05, -0.997, 0.06, 0, 0, 1,
    0.243, 0.866, 0.016, 0.02, -0.992, 0.12, 0, 0, 1,
    -0.100, 0.900, 0, 0, -1, 0, 0, 0, 1,
    -0.100, 0.460, 0, 0, -1, 0, 0, 0, 1,
    -0.100, 0.090, 0, 0, 0, 1, 0, 1, 0,
    0.100, 0.900, 0, 0, -1, 0, 0, 0, 1,
    0.100, 0.460, 0, 0, -1, 0, 0, 0, 1,
    0.100, 0.090, 0, 0, 0, 1, 0, 1, 0,
]);

export interface AvatarBoneDefinition {
    readonly index: number;
    readonly name: AvatarBoneName;
    readonly parent: number;
    readonly joint: readonly [number, number, number];
    readonly direction: readonly [number, number, number];
    readonly forward: readonly [number, number, number];
}

/** Immutable descriptive rig used by validation and offline exchange tools. */
export const AVATAR_RIG: readonly AvatarBoneDefinition[] = AVATAR_BONE_NAMES.map((name, index) => {
    const offset = index * 9;
    return Object.freeze({
        index,
        name,
        parent: AVATAR_BONE_PARENTS[index],
        joint: [AVATAR_BIND_FRAMES[offset], AVATAR_BIND_FRAMES[offset + 1], AVATAR_BIND_FRAMES[offset + 2]] as const,
        direction: [AVATAR_BIND_FRAMES[offset + 3], AVATAR_BIND_FRAMES[offset + 4], AVATAR_BIND_FRAMES[offset + 5]] as const,
        forward: [AVATAR_BIND_FRAMES[offset + 6], AVATAR_BIND_FRAMES[offset + 7], AVATAR_BIND_FRAMES[offset + 8]] as const,
    });
});
