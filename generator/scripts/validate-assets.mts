import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSET_CATALOG } from '../config/assets.ts';
import { inspectGlb } from '../fields/assetValidation.ts';
import type { AssetValidationEntry, AssetValidationReport } from '../package/assetCatalog.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'work/generated-world');
const entries: AssetValidationEntry[] = [];
for (const asset of ASSET_CATALOG.entries) {
    if (!asset.source) {
        entries.push({ prototypeId: asset.prototypeId, status: 'unassigned', source: null, errors: [], warnings: ['No source GLB assigned yet.'] });
        continue;
    }
    try {
        const bytes = await readFile(resolve(root, asset.source));
        const inspection = inspectGlb(bytes);
        entries.push({
            prototypeId: asset.prototypeId, status: inspection.valid ? 'valid' : 'invalid', source: asset.source,
            byteLength: bytes.byteLength, meshes: inspection.meshes, nodes: inspection.nodes, materials: inspection.materials,
            errors: inspection.errors, warnings: inspection.warnings,
        });
    } catch (error) {
        entries.push({ prototypeId: asset.prototypeId, status: 'invalid', source: asset.source, errors: [error instanceof Error ? error.message : String(error)], warnings: [] });
    }
}
const report: AssetValidationReport = {
    schema: 'exalted-asset-validation', version: 1,
    valid: entries.filter((entry) => entry.status === 'valid').length,
    invalid: entries.filter((entry) => entry.status === 'invalid').length,
    unassigned: entries.filter((entry) => entry.status === 'unassigned').length,
    entries,
};
await Promise.all([
    writeFile(resolve(output, 'asset-catalog.json'), `${JSON.stringify(ASSET_CATALOG, null, 2)}\n`, 'utf8'),
    writeFile(resolve(output, 'asset-validation.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
]);
console.log(`[generator] asset catalog: ${report.valid} valid, ${report.invalid} invalid, ${report.unassigned} unassigned`);
