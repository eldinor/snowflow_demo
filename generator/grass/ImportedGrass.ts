import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders/glTF';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';

export interface ImportedGrassPrototype {
    name: string;
    geometry: VertexData;
    triangles: number;
    authoredHeight: number;
}

const VARIANTS = [
    'grass_medium_01_tall_a_LOD2',
    'grass_medium_01_tiny_a_LOD2',
    'grass_medium_01_tiny_c_LOD2',
    'grass_medium_01_tiny_f_LOD2',
] as const;

function owningNodeName(mesh: AbstractMesh): string {
    let node: AbstractMesh['parent'] | AbstractMesh = mesh;
    while (node) {
        if (VARIANTS.includes(node.name as typeof VARIANTS[number])) return node.name;
        node = node.parent;
    }
    return '';
}

/** Extracts only selected regular LOD2 meshes and normalizes each root to a unit-height prototype. */
export async function loadImportedGrass(scene: Scene): Promise<Map<string, ImportedGrassPrototype>> {
    const container = await LoadAssetContainerAsync('/terrain/grassland/grass_medium_01_1k.glb', scene);
    const result = new Map<string, ImportedGrassPrototype>();
    for (const mesh of container.meshes) {
        if (!(mesh instanceof Mesh) || !mesh.getTotalVertices()) continue;
        const name = owningNodeName(mesh);
        if (!name || result.has(name)) continue;
        const geometry = VertexData.ExtractFromMesh(mesh, true, true);
        const positions = geometry.positions;
        if (!positions?.length || !geometry.indices?.length) continue;
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (let index = 0; index < positions.length; index += 3) {
            minX = Math.min(minX, positions[index]); maxX = Math.max(maxX, positions[index]);
            minY = Math.min(minY, positions[index + 1]); maxY = Math.max(maxY, positions[index + 1]);
            minZ = Math.min(minZ, positions[index + 2]); maxZ = Math.max(maxZ, positions[index + 2]);
        }
        const authoredHeight = Math.max(0.001, maxY - minY);
        const centreX = (minX + maxX) * 0.5;
        const centreZ = (minZ + maxZ) * 0.5;
        for (let index = 0; index < positions.length; index += 3) {
            positions[index] = (positions[index] - centreX) / authoredHeight;
            positions[index + 1] = (positions[index + 1] - minY) / authoredHeight;
            positions[index + 2] = (positions[index + 2] - centreZ) / authoredHeight;
        }
        result.set(name, { name, geometry, triangles: geometry.indices.length / 3, authoredHeight });
    }
    container.dispose();
    if (!result.size) throw new Error('No selected LOD2 grass prototypes were found in grass_medium_01_1k.glb.');
    return result;
}
