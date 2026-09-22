import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TERRAIN_MATERIALS } from '../config/terrainMaterials.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'work/generated-world/terrain-materials.json');
await writeFile(output, `${JSON.stringify(TERRAIN_MATERIALS, null, 2)}\n`, 'utf8');
const assigned = TERRAIN_MATERIALS.layers.filter((layer) => layer.albedo && layer.normal && (layer.ormHeight || layer.arm)).length;
console.log(`[generator] terrain materials: ${assigned}/${TERRAIN_MATERIALS.layers.length} PBR layers assigned; procedural fallback remains active`);
