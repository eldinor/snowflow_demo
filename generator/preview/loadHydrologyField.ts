import { HydrologyField, type HydrologyFieldMetadata } from '../package/hydrologyField.ts';

export async function loadBakedHydrologyField(): Promise<HydrologyField | null> {
    const response = await fetch('/generator/work/generated-world/hydrology.json');
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return null;
    const metadata = await response.json() as HydrologyFieldMetadata;
    if (metadata.schema !== 'exalted-hydrology-field') throw new Error('Unsupported hydrology field schema.');
    const [directionResponse, accumulationResponse, lakeMaskResponse, lakeSurfaceResponse, riverMaskResponse, riverCarveResponse, waterfallMaskResponse, waterMaskResponse, waterSurfaceResponse, waterDepthResponse, shorelineResponse, swimmableResponse] = await Promise.all([
        fetch(`/generator/work/generated-world/${metadata.direction}`),
        fetch(`/generator/work/generated-world/${metadata.accumulation}`),
        fetch(`/generator/work/generated-world/${metadata.lakeMask}`),
        fetch(`/generator/work/generated-world/${metadata.lakeSurface}`),
        fetch(`/generator/work/generated-world/${metadata.riverMask}`),
        fetch(`/generator/work/generated-world/${metadata.riverCarve}`),
        fetch(`/generator/work/generated-world/${metadata.waterfallMask}`),
        fetch(`/generator/work/generated-world/${metadata.waterMask}`),
        fetch(`/generator/work/generated-world/${metadata.waterSurface}`),
        fetch(`/generator/work/generated-world/${metadata.waterDepth}`),
        fetch(`/generator/work/generated-world/${metadata.shorelineMask}`),
        fetch(`/generator/work/generated-world/${metadata.swimmableMask}`),
    ]);
    if (!directionResponse.ok || !accumulationResponse.ok || !lakeMaskResponse.ok || !lakeSurfaceResponse.ok || !riverMaskResponse.ok || !riverCarveResponse.ok || !waterfallMaskResponse.ok || !waterMaskResponse.ok || !waterSurfaceResponse.ok || !waterDepthResponse.ok || !shorelineResponse.ok || !swimmableResponse.ok) throw new Error('Hydrology field data failed to load.');
    return new HydrologyField(
        metadata,
        new Uint8Array(await directionResponse.arrayBuffer()),
        new Float32Array(await accumulationResponse.arrayBuffer()),
        new Uint8Array(await lakeMaskResponse.arrayBuffer()),
        new Float32Array(await lakeSurfaceResponse.arrayBuffer()),
        new Uint8Array(await riverMaskResponse.arrayBuffer()),
        new Float32Array(await riverCarveResponse.arrayBuffer()),
        new Uint8Array(await waterfallMaskResponse.arrayBuffer()),
        new Uint8Array(await waterMaskResponse.arrayBuffer()),
        new Float32Array(await waterSurfaceResponse.arrayBuffer()),
        new Float32Array(await waterDepthResponse.arrayBuffer()),
        new Uint8Array(await shorelineResponse.arrayBuffer()),
        new Uint8Array(await swimmableResponse.arrayBuffer()),
    );
}
