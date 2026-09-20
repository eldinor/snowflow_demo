import { BiomeField, type BiomeFieldMetadata } from '../package/biomeField.ts';

export async function loadBakedBiomeField(): Promise<BiomeField | null> {
    const response = await fetch('/generator/work/generated-world/biomes.json');
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return null;
    const metadata = await response.json() as BiomeFieldMetadata;
    if (metadata.schema !== 'exalted-biome-field') throw new Error('Unsupported biome field schema.');
    const [map0, map1] = await Promise.all(metadata.maps.map(async (name) => {
        const mapResponse = await fetch(`/generator/work/generated-world/${name}`);
        if (!mapResponse.ok) throw new Error(`Biome map ${name} failed with ${mapResponse.status}.`);
        return new Uint8Array(await mapResponse.arrayBuffer());
    }));
    return new BiomeField(metadata, map0, map1);
}
