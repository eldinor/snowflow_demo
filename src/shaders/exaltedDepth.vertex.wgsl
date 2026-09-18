// Shadow placement uses the same imported/detail terrain reconstruction as the visible mesh; independent displacement would detach terrain shadows.

attribute position: vec3f;
uniform lightViewProjection: mat4x4f;
#include<exaltedSurface>

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
#ifdef LOCAL_DETAIL
    let source = resolveExalted(vertexInputs.position);
    let world = source.world + vec3f(0.0, exaltedOffset(source.world, source.color), 0.0);
#else
    let world = vertexInputs.position;
#endif
    vertexOutputs.position = uniforms.lightViewProjection * vec4f(world, 1.0);
}
