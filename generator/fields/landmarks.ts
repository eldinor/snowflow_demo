import type { BiomeName } from '../config/biomes.ts';

export interface LandmarkCandidate {
    readonly x: number;
    readonly z: number;
    readonly elevation: number;
    readonly slope: number;
    readonly water: boolean;
    readonly weights: Readonly<Record<BiomeName, number>>;
}

export interface GeneratedLandmark extends LandmarkCandidate {
    readonly name: string;
    readonly biome: BiomeName | 'lakeside';
}

export interface LandmarkRequest {
    readonly name: string;
    readonly biome: BiomeName | 'lakeside';
    readonly maximumSlope?: number;
}

/** Selects stable, separated spawn candidates using only generated world data. */
export function selectLandmarks(
    candidates: readonly LandmarkCandidate[],
    requests: readonly LandmarkRequest[],
    minimumSeparation: number,
): GeneratedLandmark[] {
    const selected: GeneratedLandmark[] = [];
    for (const request of requests) {
        const ranked = candidates
            .filter((candidate) => !candidate.water && candidate.slope <= (request.maximumSlope ?? 0.22))
            .map((candidate) => {
                const biomeWeight = request.biome === 'lakeside'
                    ? candidate.weights.shore + candidate.weights.wetland * 0.45
                    : candidate.weights[request.biome];
                const flatness = 1 - Math.min(candidate.slope / 0.45, 1);
                return { candidate, score: biomeWeight * 0.82 + flatness * 0.18 };
            })
            .sort((a, b) => b.score - a.score || a.candidate.z - b.candidate.z || a.candidate.x - b.candidate.x);
        const choice = ranked.find(({ candidate }) => selected.every((landmark) =>
            Math.hypot(candidate.x - landmark.x, candidate.z - landmark.z) >= minimumSeparation,
        ));
        if (!choice) throw new Error(`No valid separated candidate for ${request.name}.`);
        selected.push({ ...choice.candidate, name: request.name, biome: request.biome });
    }
    return selected;
}

/** Builds smooth spawn-pad displacement while preserving the base height bake. */
export function buildLandmarkClearance(
    width: number,
    height: number,
    origin: readonly [number, number],
    extent: readonly [number, number],
    landmarks: readonly { x: number; z: number; elevation: number }[],
    sampleHeight: (x: number, z: number) => number,
    innerRadius: number,
    outerRadius: number,
    maximumAdjustment = 4,
): Float32Array {
    const result = new Float32Array(width * height);
    const spacingX = extent[0] / width;
    const spacingZ = extent[1] / height;
    for (const landmark of landmarks) {
        const minX = Math.max(0, Math.floor((landmark.x - outerRadius - origin[0]) / spacingX));
        const maxX = Math.min(width - 1, Math.ceil((landmark.x + outerRadius - origin[0]) / spacingX));
        const minZ = Math.max(0, Math.floor((landmark.z - outerRadius - origin[1]) / spacingZ));
        const maxZ = Math.min(height - 1, Math.ceil((landmark.z + outerRadius - origin[1]) / spacingZ));
        for (let zIndex = minZ; zIndex <= maxZ; zIndex++) for (let xIndex = minX; xIndex <= maxX; xIndex++) {
            const x = origin[0] + (xIndex + 0.5) * spacingX;
            const z = origin[1] + (zIndex + 0.5) * spacingZ;
            const distance = Math.hypot(x - landmark.x, z - landmark.z);
            if (distance >= outerRadius) continue;
            const t = Math.max(0, Math.min(1, (distance - innerRadius) / (outerRadius - innerRadius)));
            const weight = 1 - t * t * (3 - 2 * t);
            const adjustment = Math.max(-maximumAdjustment, Math.min(maximumAdjustment, landmark.elevation - sampleHeight(x, z)));
            result[zIndex * width + xIndex] += adjustment * weight;
        }
    }
    return result;
}
