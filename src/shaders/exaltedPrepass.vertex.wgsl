// Depth-prepass placement mirrors visible imported terrain displacement so screen-space effects see the same surface.

attribute position: vec3f;
uniform viewProjection: mat4x4f;
varying vViewZ: f32;
varying vMask: f32;
#include<exaltedSurface>

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
#ifdef LOCAL_DETAIL
    let source = resolveExalted(vertexInputs.position);
    let world = source.world + vec3f(0.0, exaltedOffset(source.world, source.color), 0.0);
#else
    let world = vertexInputs.position;
#endif
    let clip = uniforms.viewProjection * vec4f(world, 1.0);
    vertexOutputs.vViewZ = clip.w;
    vertexOutputs.vMask = 0.0;
    vertexOutputs.position = clip;
}
