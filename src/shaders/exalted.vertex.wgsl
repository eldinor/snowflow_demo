attribute position: vec3f;
#ifndef LOCAL_DETAIL
attribute normal: vec3f;
attribute color: vec4f;
#endif
#include<exaltedSurface>

uniform viewProjection: mat4x4f;
uniform cameraPos: vec3f;

varying vWorld: vec3f;
varying vHeightUV: vec2f;
varying vViewDist: f32;
varying vSpacing: f32;
varying vTerrainNormal: vec3f;
varying vBiomeColor: vec3f;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
    // Geometry already carries the GLB loader's full world transform.
#ifdef LOCAL_DETAIL
    let source = resolveExalted(vertexInputs.position);
    let world = source.world + vec3f(0.0, exaltedOffset(source.world, source.color), 0.0);
#else
    let source = ExaltedPoint(vertexInputs.position, vertexInputs.normal, vertexInputs.color.rgb);
    let world = source.world;
#endif
    vertexOutputs.vWorld = world;
    vertexOutputs.vHeightUV = vec2f(0.0);
    vertexOutputs.vViewDist = distance(world, uniforms.cameraPos);
    vertexOutputs.vSpacing = 0.125;
    vertexOutputs.vTerrainNormal = source.normal;
    vertexOutputs.vBiomeColor = source.color;
    vertexOutputs.position = uniforms.viewProjection * vec4f(world, 1.0);
}
