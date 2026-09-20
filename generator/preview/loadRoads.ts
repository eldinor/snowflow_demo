import type { RoadMetadata } from '../package/roads.ts';

export async function loadGeneratedRoads(): Promise<{ metadata: RoadMetadata; mask: Uint8Array; grade: Float32Array } | null> {
    const response = await fetch('/generator/work/generated-world/roads.json');
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return null;
    const metadata = await response.json() as RoadMetadata;
    if (metadata.schema !== 'exalted-roads') throw new Error('Unsupported road schema.');
    const [maskResponse, gradeResponse] = await Promise.all([
        fetch(`/generator/work/generated-world/${metadata.mask}`),
        fetch(`/generator/work/generated-world/${metadata.grade}`),
    ]);
    if (!maskResponse.ok || !gradeResponse.ok) throw new Error('Road fields failed to load.');
    return {
        metadata,
        mask: new Uint8Array(await maskResponse.arrayBuffer()),
        grade: new Float32Array(await gradeResponse.arrayBuffer()),
    };
}
