import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { AVATAR_BONE_NAMES, AVATAR_RIG_ID } from '../../src/character/avatarRig.ts';
import type {
    AvatarMeshReport, AvatarValidationIssue, AvatarValidationReport,
} from '../../src/character/avatarValidation.ts';

interface GlbChunk { type: number; data: Buffer }
interface GltfAccessor {
    bufferView?: number; byteOffset?: number; componentType: number; count: number;
    type: string; min?: number[]; max?: number[];
}
interface GltfBufferView { byteOffset?: number; byteLength: number; byteStride?: number }
interface GltfPrimitive { attributes?: Record<string, number>; indices?: number }
interface GltfMesh { primitives?: GltfPrimitive[] }
interface GltfNode {
    name?: string; mesh?: number; matrix?: number[]; scale?: number[];
    rotation?: number[]; translation?: number[];
}
interface GltfSkin { joints?: number[] }
interface GltfMaterial { name?: string }
interface GltfRoot {
    asset?: { generator?: string };
    accessors?: GltfAccessor[];
    bufferViews?: GltfBufferView[];
    nodes?: GltfNode[];
    meshes?: GltfMesh[];
    skins?: GltfSkin[];
    materials?: GltfMaterial[];
}

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

function parseGlb(bytes: Buffer): { json: GltfRoot; binary: Buffer } {
    if (bytes.length < 20 || bytes.readUInt32LE(0) !== GLB_MAGIC) throw new Error('Not a GLB file.');
    if (bytes.readUInt32LE(4) !== 2) throw new Error('Only glTF 2.0 GLB files are supported.');
    if (bytes.readUInt32LE(8) !== bytes.length) throw new Error('GLB header length does not match file length.');
    const chunks: GlbChunk[] = [];
    for (let offset = 12; offset < bytes.length;) {
        const length = bytes.readUInt32LE(offset);
        const type = bytes.readUInt32LE(offset + 4);
        const start = offset + 8;
        chunks.push({ type, data: bytes.subarray(start, start + length) });
        offset = start + length;
    }
    const jsonChunk = chunks.find(chunk => chunk.type === JSON_CHUNK);
    if (!jsonChunk) throw new Error('GLB has no JSON chunk.');
    return {
        json: JSON.parse(jsonChunk.data.toString('utf8').trim()) as GltfRoot,
        binary: chunks.find(chunk => chunk.type === BIN_CHUNK)?.data ?? Buffer.alloc(0),
    };
}

const components: Record<number, { bytes: number; read: (buffer: Buffer, offset: number) => number }> = {
    5120: { bytes: 1, read: (b, o) => b.readInt8(o) },
    5121: { bytes: 1, read: (b, o) => b.readUInt8(o) },
    5122: { bytes: 2, read: (b, o) => b.readInt16LE(o) },
    5123: { bytes: 2, read: (b, o) => b.readUInt16LE(o) },
    5125: { bytes: 4, read: (b, o) => b.readUInt32LE(o) },
    5126: { bytes: 4, read: (b, o) => b.readFloatLE(o) },
};
const widths: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function accessorValues(json: GltfRoot, binary: Buffer, accessorIndex: number): number[][] {
    const accessor = json.accessors?.[accessorIndex] as GltfAccessor | undefined;
    if (!accessor || accessor.bufferView === undefined) return [];
    const view = json.bufferViews?.[accessor.bufferView] as GltfBufferView | undefined;
    const component = components[accessor.componentType];
    const width = widths[accessor.type];
    if (!view || !component || !width) return [];
    const stride = view.byteStride ?? component.bytes * width;
    const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    return Array.from({ length: accessor.count }, (_, row) =>
        Array.from({ length: width }, (_, column) =>
            component.read(binary, start + row * stride + column * component.bytes),
        ),
    );
}

function inspect(json: GltfRoot, binary: Buffer, source: string, byteLength: number): AvatarValidationReport {
    const issues: AvatarValidationIssue[] = [];
    const error = (code: string, message: string): void => issues.push({ severity: 'error', code, message });
    const warning = (code: string, message: string): void => issues.push({ severity: 'warning', code, message });
    const nodes = json.nodes ?? [];
    const meshes = json.meshes ?? [];
    const skins = json.skins ?? [];
    const materials = json.materials ?? [];
    if (skins.length !== 1) error('skin.count', `Expected one skin, found ${skins.length}.`);
    const skin = skins[0];
    const jointNames: string[] = (skin?.joints ?? []).map((index: number) =>
        String(nodes[index]?.name ?? '').replace(/^joint:/, ''),
    );
    const missing = AVATAR_BONE_NAMES.filter(name => !jointNames.includes(name));
    const additional = jointNames.filter(name => !(AVATAR_BONE_NAMES as readonly string[]).includes(name));
    const duplicated = jointNames.filter((name, index) => jointNames.indexOf(name) !== index);
    if (missing.length) error('rig.missing', `Missing bones: ${missing.join(', ')}.`);
    if (additional.length) error('rig.additional', `Unknown bones: ${additional.join(', ')}.`);
    if (duplicated.length) error('rig.duplicate', `Duplicated bones: ${[...new Set(duplicated)].join(', ')}.`);
    if (jointNames.join('|') !== AVATAR_BONE_NAMES.join('|')) {
        error('rig.order', 'Joint order does not match the Exalted numeric bone map.');
    }

    const meshReports: AvatarMeshReport[] = [];
    let weightVertices = 0;
    let invalidWeightVertices = 0;
    let unknownJointVertices = 0;
    let maximumInfluences = 0;
    let bodyHeight: number | null = null;
    for (const node of nodes) {
        if (node.mesh === undefined) continue;
        if (
            node.matrix ||
            (node.scale && node.scale.some((value: number) => Math.abs(value - 1) > 1e-6)) ||
            (node.rotation && (Math.abs(node.rotation[0]) + Math.abs(node.rotation[1]) + Math.abs(node.rotation[2]) > 1e-6)) ||
            (node.translation && node.translation.some((value: number) => Math.abs(value) > 1e-6))
        ) {
            error('transform.unapplied', `${node.name ?? 'mesh node'} has an unapplied object transform.`);
        }
        const mesh = meshes[node.mesh];
        let vertices = 0;
        let triangles = 0;
        const attributes = new Set<string>();
        let bounds: AvatarMeshReport['bounds'];
        for (const primitive of mesh?.primitives ?? []) {
            Object.keys(primitive.attributes ?? {}).forEach(attribute => attributes.add(attribute));
            const position = json.accessors?.[primitive.attributes?.POSITION] as GltfAccessor | undefined;
            vertices += position?.count ?? 0;
            if (position?.min && position.max) bounds = { min: position.min, max: position.max };
            const indexAccessor = json.accessors?.[primitive.indices] as GltfAccessor | undefined;
            triangles += (indexAccessor?.count ?? 0) / 3;
            if (node.name === 'part:body') {
                for (const semantic of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']) {
                    if (primitive.attributes?.[semantic] === undefined) error('body.attribute', `Body is missing ${semantic}.`);
                }
                const weights = accessorValues(json, binary, primitive.attributes?.WEIGHTS_0);
                const joints = accessorValues(json, binary, primitive.attributes?.JOINTS_0);
                weightVertices += weights.length;
                for (let index = 0; index < weights.length; index++) {
                    const active = weights[index].filter(value => value > 1e-6).length;
                    maximumInfluences = Math.max(maximumInfluences, active);
                    const sum = weights[index].reduce((total, value) => total + value, 0);
                    if (!Number.isFinite(sum) || Math.abs(sum - 1) > 1e-4 || weights[index].some(value => value < 0)) {
                        invalidWeightVertices++;
                    }
                    if (joints[index]?.some((joint, slot) => weights[index][slot] > 1e-6 && joint >= AVATAR_BONE_NAMES.length)) {
                        unknownJointVertices++;
                    }
                }
                if (bounds) bodyHeight = bounds.max[1] - bounds.min[1];
            }
        }
        meshReports.push({ node: node.name ?? `mesh:${node.mesh}`, vertices, triangles, attributes: [...attributes].sort(), bounds });
    }
    if (!nodes.some(node => node.name === 'part:body')) error('part.body', 'Missing part:body node.');
    const materialNames = new Set(materials.map(material => material.name));
    for (const name of ['exalted_robe', 'exalted_cloth_reference', 'exalted_fur_reference']) {
        if (!materialNames.has(name)) warning('material.missing', `Missing preview material ${name}.`);
    }
    for (const name of ['reference:cloth', 'reference:fur']) {
        if (!nodes.some(node => node.name === name)) warning('reference.missing', `Missing optional ${name} node.`);
    }
    if (invalidWeightVertices) error('weights.invalid', `${invalidWeightVertices} body vertices have invalid normalized weights.`);
    if (unknownJointVertices) error('weights.joints', `${unknownJointVertices} body vertices reference unknown joints.`);
    if (maximumInfluences > 4) error('weights.influences', `Body uses up to ${maximumInfluences} influences per vertex.`);
    if (bodyHeight !== null && (bodyHeight < 1.5 || bodyHeight > 2.1)) warning('body.height', `Body height is ${bodyHeight.toFixed(3)} m.`);

    return {
        schema: 'exalted-avatar-validation', version: 1, source, byteLength,
        valid: !issues.some(issue => issue.severity === 'error'),
        generator: json.asset?.generator,
        scene: { nodes: nodes.length, meshes: meshes.length, materials: materials.length, skins: skins.length },
        rig: { expected: AVATAR_RIG_ID, joints: jointNames, missing, additional, duplicated: [...new Set(duplicated)] },
        body: { height: bodyHeight, weightVertices, invalidWeightVertices, maximumInfluences, unknownJointVertices },
        meshes: meshReports, issues,
    };
}

async function main(): Promise<void> {
    const source = resolve(process.argv[2] ?? 'avatar-export/exalted-avatar.glb');
    const reportPath = resolve(process.argv[3] ?? 'reports/avatar-validation.json');
    const bytes = await readFile(source);
    const { json, binary } = parseGlb(bytes);
    const report = inspect(json, binary, source, bytes.length);
    await mkdir(resolve(reportPath, '..'), { recursive: true });
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
    console.log(`${report.valid ? 'PASS' : 'FAIL'} ${basename(source)}: ${report.scene.meshes} meshes, ${report.rig.joints.length} joints, ${report.body.weightVertices} weighted vertices`);
    for (const issue of report.issues) console.log(`${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}`);
    console.log(`Report: ${reportPath}`);
    if (!report.valid) process.exitCode = 1;
}

await main();
