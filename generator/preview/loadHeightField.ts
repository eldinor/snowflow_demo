import { HeightField, type HeightFieldMetadata } from '../package/heightField.ts';

/** Loads the offline bake in development; absence is an expected analytic fallback. */
export async function loadBakedHeightField(): Promise<HeightField | null> {
    const metadataResponse = await fetch('/generator/work/generated-world/height.json');
    if (!metadataResponse.ok) return null;
    if (!metadataResponse.headers.get('content-type')?.includes('application/json')) return null;
    const metadata = await metadataResponse.json() as HeightFieldMetadata;
    if (metadata.schema !== 'exalted-height-field' || metadata.format !== 'float32-le') {
        throw new Error('Generated height metadata has an unsupported schema or format.');
    }
    const dataResponse = await fetch('/generator/work/generated-world/height.f32');
    if (!dataResponse.ok) throw new Error(`Height data request failed with ${dataResponse.status}.`);
    const buffer = await dataResponse.arrayBuffer();
    return new HeightField(metadata, new Float32Array(buffer));
}
