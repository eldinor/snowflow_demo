import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';

/** Builds a normalized, tapered blade whose matrix controls final width and height. */
export function createGrassBlade(name: string, scene: Scene, sections: number): Mesh {
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    for (let row = 0; row <= sections; row++) {
        const y = row / sections;
        const halfWidth = (1 - y) * 0.5;
        const lean = y * y * 0.18;
        positions.push(-halfWidth, y, lean, halfWidth, y, lean);
        normals.push(0, 0, -1, 0, 0, -1);
        if (row < sections) {
            const base = row * 2;
            indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
        }
    }
    const mesh = new Mesh(name, scene);
    const data = new VertexData();
    data.positions = positions;
    data.normals = normals;
    data.indices = indices;
    data.applyToMesh(mesh);
    mesh.isPickable = false;
    return mesh;
}
