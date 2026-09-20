import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BIOME_NAMES } from '../config/biomes.ts';
import type { BiomeFieldMetadata } from '../package/biomeField.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'work/generated-world');
const metadata = JSON.parse(await readFile(resolve(output, 'biomes.json'), 'utf8')) as BiomeFieldMetadata;
const [map0, map1] = await Promise.all(metadata.maps.map((name) => readFile(resolve(output, name))));
const actualHashes = [map0, map1].map((map) => createHash('sha256').update(map).digest('hex'));
if (actualHashes.some((hash, index) => hash !== metadata.sha256[index])) {
    throw new Error('Biome texture checksum mismatch.');
}
const weightSums = new Float64Array(8);
const dominant = new Uint32Array(8);
let invalidTotals = 0;
const pixels = metadata.width * metadata.height;
for (let pixel = 0; pixel < pixels; pixel++) {
    const offset = pixel * 4;
    const channels = [map0[offset], map0[offset + 1], map0[offset + 2], map0[offset + 3], map1[offset], map1[offset + 1], map1[offset + 2], map1[offset + 3]];
    if (channels.reduce((sum, value) => sum + value, 0) !== 255) invalidTotals++;
    let dominantIndex = 0;
    for (let channel = 0; channel < 8; channel++) {
        weightSums[channel] += channels[channel] / 255;
        if (channels[channel] > channels[dominantIndex]) dominantIndex = channel;
    }
    dominant[dominantIndex]++;
}
const rows = BIOME_NAMES.map((name, index) =>
    `| ${name} | ${(weightSums[index] / pixels * 100).toFixed(2)}% | ${(dominant[index] / pixels * 100).toFixed(2)}% |`,
).join('\n');
const report = `# Generated biome-field inspection

Date: 2026-09-20

- Resolution: ${metadata.width} × ${metadata.height}
- Sample spacing: ${metadata.sampleSpacing[0]} m
- Stored data: ${((map0.byteLength + map1.byteLength) / 1_000_000).toFixed(1)} MB
- Invalid per-pixel channel totals: ${invalidTotals}
- Map 0 SHA-256: \`${actualHashes[0]}\`
- Map 1 SHA-256: \`${actualHashes[1]}\`

| Biome | Mean weight | Dominant area |
| --- | ---: | ---: |
${rows}
`;
await writeFile(resolve(root, 'reports/generated/biome-field.md'), report, 'utf8');
console.log(report);
