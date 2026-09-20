import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORLD_CONFIG } from '../config/world.ts';
import { sampleElevation } from '../fields/elevation.ts';
import { HeightField, type HeightFieldMetadata } from '../package/heightField.ts';

const generatorRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDirectory = resolve(generatorRoot, 'work/generated-world');
const [metadataText, bytes] = await Promise.all([
    readFile(resolve(dataDirectory, 'height.json'), 'utf8'),
    readFile(resolve(dataDirectory, 'height.f32')),
]);
const metadata = JSON.parse(metadataText) as HeightFieldMetadata;
const actualHash = createHash('sha256').update(bytes).digest('hex');
if (actualHash !== metadata.sha256) throw new Error(`Height checksum mismatch: ${actualHash}`);
if (bytes.byteLength !== metadata.width * metadata.height * 4) {
    throw new Error(`Height byte length mismatch: ${bytes.byteLength}`);
}
const values = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
const field = new HeightField(metadata, values);
const stride = Math.max(1, Math.floor(metadata.width / 256));
let samples = 0;
let slopeSum = 0;
let slopeMaximum = 0;
let curvatureAbsoluteSum = 0;
let exposureSum = 0;
let analyticErrorSum = 0;
let analyticErrorMaximum = 0;
for (let zIndex = 0; zIndex < metadata.height; zIndex += stride) {
    const z = metadata.origin[1] + (zIndex + 0.5) * metadata.sampleSpacing[1];
    for (let xIndex = 0; xIndex < metadata.width; xIndex += stride) {
        const x = metadata.origin[0] + (xIndex + 0.5) * metadata.sampleSpacing[0];
        const derivatives = field.sampleDerivatives(x, z);
        const analyticError = Math.abs(field.sample(x, z) - sampleElevation(WORLD_CONFIG, x, z));
        slopeSum += derivatives.slope;
        slopeMaximum = Math.max(slopeMaximum, derivatives.slope);
        curvatureAbsoluteSum += Math.abs(derivatives.curvature);
        exposureSum += derivatives.exposure;
        analyticErrorSum += analyticError;
        analyticErrorMaximum = Math.max(analyticErrorMaximum, analyticError);
        samples++;
    }
}

const report = `# Generated height-field inspection

Date: 2026-09-20

- Resolution: ${metadata.width} × ${metadata.height}
- Extent: ${metadata.extent[0]} × ${metadata.extent[1]} m
- Sample spacing: ${metadata.sampleSpacing[0]} × ${metadata.sampleSpacing[1]} m
- Storage: ${(bytes.byteLength / 1_048_576).toFixed(1)} MiB Float32 little-endian
- Elevation range: ${metadata.minimum.toFixed(3)}..${metadata.maximum.toFixed(3)} m
- Mean elevation: ${metadata.mean.toFixed(3)} m
- SHA-256: \`${metadata.sha256}\`
- Inspection samples: ${samples}
- Mean normalized slope: ${(slopeSum / samples).toFixed(4)}
- Maximum normalized slope: ${slopeMaximum.toFixed(4)}
- Mean absolute curvature: ${(curvatureAbsoluteSum / samples).toFixed(4)}
- Mean west-wind exposure: ${(exposureSum / samples).toFixed(4)}
- Mean thermal-erosion displacement: ${(analyticErrorSum / samples).toFixed(4)} m
- Maximum sampled thermal-erosion displacement: ${analyticErrorMaximum.toFixed(4)} m

The checksum and byte length passed. The preview and CPU grounding sampler use
the same texel-centred bilinear sampling convention.
`;
const reportDirectory = resolve(generatorRoot, 'reports/generated');
await mkdir(reportDirectory, { recursive: true });
await writeFile(resolve(reportDirectory, 'height-field.md'), report, 'utf8');
console.log(report);
