/** Stable identity and sampling contract for a generated Exalted world. */
export interface WorldManifest {
    readonly generator: 'exalted-world';
    readonly generatorVersion: number;
    readonly packageVersion: number;
    readonly seed: number;
    readonly width: number;
    readonly depth: number;
    readonly origin: readonly [number, number];
    readonly heightResolution: number;
    readonly biomeResolution: number;
    readonly waterResolution: number;
    readonly chunkSize: number;
}

/** Inclusive X/Z bounds derived from the manifest's origin and size. */
export interface WorldBounds {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
}

/** Returns world bounds without duplicating derived values in package data. */
export function getWorldBounds(world: WorldManifest): WorldBounds {
    return {
        minX: world.origin[0],
        maxX: world.origin[0] + world.width,
        minZ: world.origin[1],
        maxZ: world.origin[1] + world.depth,
    };
}

/** Number of chunks required per axis, including a clipped chunk at the far edge. */
export function getWorldChunkCounts(world: WorldManifest): readonly [number, number] {
    return [
        Math.ceil(world.width / world.chunkSize),
        Math.ceil(world.depth / world.chunkSize),
    ];
}

/** Fails early when generator configuration would create an ambiguous package. */
export function assertValidWorldManifest(world: WorldManifest): void {
    const positiveIntegers: ReadonlyArray<readonly [string, number]> = [
        ['generatorVersion', world.generatorVersion],
        ['packageVersion', world.packageVersion],
        ['heightResolution', world.heightResolution],
        ['biomeResolution', world.biomeResolution],
        ['waterResolution', world.waterResolution],
        ['chunkSize', world.chunkSize],
    ];
    for (const [name, value] of positiveIntegers) {
        if (!Number.isInteger(value) || value <= 0) {
            throw new Error(`${name} must be a positive integer; received ${value}`);
        }
    }
    for (const [name, value] of [
        ['width', world.width],
        ['depth', world.depth],
        ['originX', world.origin[0]],
        ['originZ', world.origin[1]],
    ] as const) {
        if (!Number.isFinite(value) || ((name === 'width' || name === 'depth') && value <= 0)) {
            throw new Error(`${name} is invalid; received ${value}`);
        }
    }
    if (!Number.isSafeInteger(world.seed)) {
        throw new Error(`seed must be a safe integer; received ${world.seed}`);
    }
}
