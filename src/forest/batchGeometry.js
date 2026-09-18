/**
 * Each thin-instance batch needs its own attribute bindings, not shared Geometry.
 * @module forest/batchGeometry
 */

import { Geometry } from '@babylonjs/core/Meshes/geometry.js';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';

/** Each thin-instance batch needs its own attribute bindings, not shared Geometry. */
export function attachBatchGeometry(template,mesh){
    const source=template.geometry;
    const geometry=new Geometry(`${mesh.name}:geometry`,mesh.getScene());
    for(const kind of source.getVerticesDataKinds()){
        const vertex=source.getVertexBuffer(kind);
        if(vertex.getIsInstanced())continue;
        const buffer=vertex.getWrapperBuffer();
        // Babylon can upload a prototype lazily, after setVerticesBuffer, leaving
        // its first ownership reference unmarked. Claim that existing reference
        // before Geometry.setVerticesBuffer adds the new batch's reference.
        if(!buffer._isAlreadyOwned)buffer._increaseReferences();
        // Own a reference to the existing GPU allocation, with an independent
        // attribute wrapper. Disposing one chunk must not release other chunks.
        const view=new VertexBuffer(mesh.getEngine(),buffer,kind,{
            useBytes:true,stride:vertex.byteStride,offset:vertex.byteOffset,
            size:vertex.getSize(),type:vertex.type,normalized:vertex.normalized,
            takeBufferOwnership:true,
        });
        geometry.setVerticesBuffer(view,source.getTotalVertices());
    }
    geometry.setIndices(source.getIndices(),source.getTotalVertices());
    geometry.applyToMesh(mesh);
    return geometry;
}
