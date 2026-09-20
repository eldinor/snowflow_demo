import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { Skeleton } from '@babylonjs/core/Bones/skeleton';
import { Bone } from '@babylonjs/core/Bones/bone';
import { Matrix, Color3, Quaternion } from '@babylonjs/core/Maths/math';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { GLTF2Export } from '@babylonjs/serializers/glTF/2.0/glTFSerializer';
import { buildBody, buildFur } from '../../src/character/build.ts';
import { makePanels } from '../../src/character/cloth.ts';
import {
    AVATAR_BIND_FRAMES, AVATAR_BONE_NAMES, AVATAR_BONE_PARENTS,
    AVATAR_RIG_ID, BONE_COUNT,
} from '../../src/character/avatarRig.ts';
import { DEFAULT_AVATAR_MANIFEST } from '../../src/character/avatarExchange.ts';
import { setFrameFromDir } from '../../src/core/mat4.ts';

const outputDirectory = resolve(process.argv[2] ?? 'avatar-export');
const fileBase = 'exalted-avatar';

function bindWorldMatrices(): Matrix[] {
    const packed = new Float32Array(BONE_COUNT * 16);
    return AVATAR_BONE_NAMES.map((_name, index) => {
        const source = index * 9;
        setFrameFromDir(
            packed, index * 16,
            AVATAR_BIND_FRAMES[source], AVATAR_BIND_FRAMES[source + 1], AVATAR_BIND_FRAMES[source + 2],
            AVATAR_BIND_FRAMES[source + 3], AVATAR_BIND_FRAMES[source + 4], AVATAR_BIND_FRAMES[source + 5],
            AVATAR_BIND_FRAMES[source + 6], AVATAR_BIND_FRAMES[source + 7], AVATAR_BIND_FRAMES[source + 8],
        );
        return Matrix.FromArray(packed, index * 16);
    });
}

function createSkeleton(scene: Scene): Skeleton {
    const skeleton = new Skeleton('Exalted humanoid', AVATAR_RIG_ID, scene);
    skeleton.useTextureToStoreBoneMatrices = true;
    const world = bindWorldMatrices();
    const bones: Bone[] = [];
    const nodes: TransformNode[] = [];
    for (let index = 0; index < BONE_COUNT; index++) {
        const parentIndex = AVATAR_BONE_PARENTS[index];
        const parent = parentIndex < 0 ? null : bones[parentIndex];
        const local = parent
            ? world[index].multiply(Matrix.Invert(world[parentIndex]))
            : world[index];
        const bone = new Bone(AVATAR_BONE_NAMES[index], skeleton, parent, local, local, local, index);
        const node = new TransformNode(`joint:${AVATAR_BONE_NAMES[index]}`, scene);
        node.parent = parentIndex < 0 ? null : nodes[parentIndex];
        node.rotationQuaternion = Quaternion.Identity();
        local.decompose(node.scaling, node.rotationQuaternion, node.position);
        node.metadata = { avatarBone: AVATAR_BONE_NAMES[index], boneIndex: index };
        bone.linkTransformNode(node);
        bones.push(bone);
        nodes.push(node);
    }
    return skeleton;
}

function applyStandardSkin(mesh: Mesh, skeleton: Skeleton): void {
    const indices = mesh.getVerticesData('boneIdx');
    const weights = mesh.getVerticesData('boneWt');
    if (!indices || !weights) throw new Error(`${mesh.name} is missing skin buffers.`);
    mesh.skeleton = skeleton;
    mesh.setVerticesData(VertexBuffer.MatricesIndicesKind, Uint8Array.from(indices), false, 4);
    mesh.setVerticesData(VertexBuffer.MatricesWeightsKind, weights, false, 4);
}

function buildClothReference(scene: Scene): Mesh {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (const panel of makePanels()) {
        const base = positions.length / 3;
        positions.push(...panel.bindPos);
        for (let row = 0; row < panel.rows; row++) {
            for (let column = 0; column < panel.cols; column++) {
                uvs.push(column / panel.cols, row / Math.max(1, panel.rows - 1));
            }
        }
        for (let row = 0; row < panel.rows - 1; row++) {
            for (let column = 0; column < panel.cols; column++) {
                const next = (column + 1) % panel.cols;
                const a = base + row * panel.cols + column;
                const b = base + row * panel.cols + next;
                const c = base + (row + 1) * panel.cols + next;
                const d = base + (row + 1) * panel.cols + column;
                indices.push(a, b, c, a, c, d);
            }
        }
    }
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    const mesh = new Mesh('reference:cloth', scene);
    const data = new VertexData();
    data.positions = positions;
    data.normals = normals;
    data.uvs = uvs;
    data.indices = indices;
    data.applyToMesh(mesh);
    mesh.metadata = { avatarPart: 'cloth', referenceOnly: true, topology: 'exalted-cloth-v1' };
    return mesh;
}

async function writeGlb(scene: Scene): Promise<string> {
    const data = await GLTF2Export.GLBAsync(scene, fileBase, {
        shouldExportNode: node =>
            node.name === 'part:body' ||
            node.name === 'reference:cloth' ||
            node.name === 'reference:fur' ||
            node.name.startsWith('joint:'),
        exportUnusedUVs: true,
    });
    const entry = Object.entries(data.files).find(([name]) => name.endsWith('.glb'));
    if (!entry) throw new Error('Babylon serializer did not produce a GLB file.');
    const [name, contents] = entry;
    if (!(contents instanceof Blob)) throw new Error('Expected binary GLB output.');
    const target = resolve(outputDirectory, name);
    await writeFile(target, new Uint8Array(await contents.arrayBuffer()));
    return target;
}

async function main(): Promise<void> {
    await mkdir(outputDirectory, { recursive: true });
    const engine = new NullEngine({ renderWidth: 1, renderHeight: 1 });
    // This scene only serializes data, but Babylon still prepares the preview
    // material. Advertise the bone-texture path so the headless engine does not
    // issue a misleading vertex-uniform warning for a mesh it never renders.
    const exportCaps = engine.getCaps();
    exportCaps.textureFloat = true;
    exportCaps.maxVertexTextureImageUnits = Math.max(exportCaps.maxVertexTextureImageUnits, 1);
    const scene = new Scene(engine);
    try {
        const body = buildBody(scene);
        body.name = 'part:body';
        body.id = 'part:body';
        const skeleton = createSkeleton(scene);
        applyStandardSkin(body, skeleton);

        const material = new StandardMaterial('exalted_robe', scene);
        material.diffuseColor = new Color3(0.075, 0.105, 0.185);
        material.roughness = 0.78;
        material.specularColor = new Color3(0.04, 0.04, 0.04);
        body.material = material;
        body.metadata = { ...body.metadata, avatarPart: 'body', rig: AVATAR_RIG_ID };

        const cloth = buildClothReference(scene);
        const clothMaterial = new StandardMaterial('exalted_cloth_reference', scene);
        clothMaterial.diffuseColor = new Color3(0.12, 0.19, 0.31);
        clothMaterial.backFaceCulling = false;
        clothMaterial.twoSidedLighting = true;
        cloth.material = clothMaterial;

        const fur = buildFur(scene);
        fur.name = 'reference:fur';
        fur.id = 'reference:fur';
        applyStandardSkin(fur, skeleton);
        const furMaterial = new StandardMaterial('exalted_fur_reference', scene);
        furMaterial.diffuseColor = new Color3(0.7, 0.72, 0.76);
        fur.material = furMaterial;
        fur.metadata = { ...fur.metadata, avatarPart: 'fur', referenceOnly: true };

        const glbPath = await writeGlb(scene);
        await writeFile(
            resolve(outputDirectory, 'avatar-manifest.json'),
            JSON.stringify(DEFAULT_AVATAR_MANIFEST, null, 2) + '\n',
            'utf8',
        );
        await writeFile(resolve(outputDirectory, 'README.md'), `# Exalted avatar authoring package

Import **${fileBase}.glb** into Blender using metre units.

- Keep the armature and required bone names unchanged.
- Keep object and armature scale at 1,1,1 and apply editing transforms.
- Keep Y up and the avatar facing +Z.
- Limit skinning to four normalized influences per vertex.
- Export normals, UVs and skin weights.
- The single preview material approximates the runtime palette; Exalted restores its custom WGSL material after preparation.
- Cloth and fur objects are bind-pose fitting references. Do not return them as ordinary runtime meshes.

The body currently includes the generated head geometry. Editing that region is supported as an authoring reference; isolated head import begins in Stage 4.
`, 'utf8');

        const bytes = await readFile(glbPath);
        if (bytes.length < 20 || bytes.subarray(0, 4).toString('ascii') !== 'glTF') {
            throw new Error('Written avatar file is not a valid GLB container.');
        }
        const jsonLength = bytes.readUInt32LE(12);
        const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').trim());
        if (json.skins?.length !== 1 || json.skins[0].joints?.length !== BONE_COUNT) {
            throw new Error(`Exported GLB must contain one ${BONE_COUNT}-joint skin.`);
        }
        const attributes = json.meshes?.[0]?.primitives?.[0]?.attributes;
        for (const semantic of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']) {
            if (attributes?.[semantic] === undefined) {
                throw new Error(`Exported GLB is missing required ${semantic} data.`);
            }
        }
        const nodeNames = new Set(json.nodes?.map((node: { name?: string }) => node.name));
        for (const name of ['part:body', 'reference:cloth', 'reference:fur']) {
            if (!nodeNames.has(name)) throw new Error(`Exported GLB is missing ${name}.`);
        }
        console.log(
            `Exported ${glbPath} (${bytes.length} bytes; body ${body.getTotalVertices()}, ` +
            `cloth ${cloth.getTotalVertices()}, fur ${fur.getTotalVertices()} vertices)`,
        );
    } finally {
        scene.dispose();
        engine.dispose();
    }
}

await main();
