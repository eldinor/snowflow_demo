/** Load the road scene at its authored scale, retaining GPU instances and textures. */
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { MeshoptCompression } from '@babylonjs/core/Meshes/Compression/meshoptCompression';
import { Vector2, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Ray } from '@babylonjs/core/Culling/ray';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import decoderUrl from '../../node_modules/meshoptimizer/meshopt_decoder.cjs?url';

/** Register the imported meshes with the shared lighting, shadow and depth passes. */
export async function loadForestRoad(scene, materials, shadows, depth) {
    // Serve the installed decoder through Vite instead of relying on a public CDN.
    MeshoptCompression.Configuration = { decoder: { url: decoderUrl } };
    const container = await LoadAssetContainerAsync(`${import.meta.env.BASE_URL}assets/exalted/forest-opt.glb`, scene);
    container.addAllToScene();
    const meshes = container.meshes.filter(mesh => mesh.getTotalVertices() > 0);
    if (!meshes.length) throw new Error('Forest GLB contains no renderable meshes.');
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);
    let triangles = 0;
    for (const mesh of meshes) {
        mesh.computeWorldMatrix(true);
        if (mesh.hasThinInstances) mesh.thinInstanceRefreshBoundingInfo(true);
        const bounds = mesh.getBoundingInfo().boundingBox;
        min.minimizeInPlace(bounds.minimumWorld);
        max.maximizeInPlace(bounds.maximumWorld);
        const batch = { mesh, sourceMaterial: mesh.material, distance: 1000000,
            windEnabled: false, windBounds: new Vector2(0, 1), instanced: mesh.hasThinInstances };
        mesh.material = materials.makeMaterial(batch);
        mesh.renderingGroupId = 1;
        mesh.isPickable = false;
        const shadowMaterials = Array.from({ length: 3 }, () => materials.makeMaterial(batch, 'PROP_SHADOW'));
        shadows.registerCaster(mesh, index => shadowMaterials[index]);
        depth.registerCaster(mesh, materials.makeMaterial(batch, 'PROP_PREPASS'));
        triangles += mesh.getTotalIndices() / 3 * (mesh.hasThinInstances ? mesh.thinInstanceCount : 1);
    }
    // Start at eye level over the authored ground plane, not the tree canopy.
    // A downward pick accounts for the ground's transform and local relief.
    const center = min.add(max).scale(.5);
    const span = Math.max(max.x - min.x, max.z - min.z, 1);
    const groundHit = scene.pickWithRay(
        new Ray(new Vector3(center.x, max.y + 1, center.z), new Vector3(0, -1, 0), max.y - min.y + 2),
        mesh => meshes.includes(mesh) && mesh.name.startsWith('Plane.002')
    );
    const eyeY = (groundHit?.pickedPoint?.y ?? min.y) + 1.7;
    return { meshes, container, triangles, minHeight: min.y, height: max.y,
        cameraPosition: new Vector3(center.x, eyeY, center.z),
        cameraTarget: new Vector3(center.x, eyeY, center.z + 1),
        speed: Math.max(1, span * .15), far: Math.max(4000, span * 8) };
}
