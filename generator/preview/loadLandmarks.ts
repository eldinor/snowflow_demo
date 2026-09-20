import type { LandmarkMetadata } from '../package/landmarks.ts';

export interface LoadedLandmarks {
    readonly metadata: LandmarkMetadata;
    readonly clearance: Float32Array;
}

export async function loadGeneratedLandmarks(): Promise<LoadedLandmarks | null> {
    const response = await fetch('/generator/work/generated-world/landmarks.json');
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return null;
    const metadata = await response.json() as LandmarkMetadata;
    if (metadata.schema !== 'exalted-landmarks') throw new Error('Unsupported landmark schema.');
    const clearanceResponse = await fetch(`/generator/work/generated-world/${metadata.clearance}`);
    if (!clearanceResponse.ok) throw new Error('Landmark clearance failed to load.');
    return { metadata, clearance: new Float32Array(await clearanceResponse.arrayBuffer()) };
}
