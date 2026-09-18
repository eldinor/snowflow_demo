// Pass persistent water geometry and packed depth/flow metadata to the lake/river shader; prepass and visible geometry share placement.

attribute position: vec3f;
attribute normal: vec3f;
attribute color: vec4f;
uniform viewProjection: mat4x4f;
varying vWorld: vec3f;
varying vNormal: vec3f;
varying vData: vec4f;
varying vViewZ: f32;
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
    vertexOutputs.vWorld = vertexInputs.position;
    vertexOutputs.vNormal = vertexInputs.normal;
    vertexOutputs.vData = vertexInputs.color;
    let clip = uniforms.viewProjection * vec4f(vertexInputs.position,1.0);
    vertexOutputs.vViewZ = clip.w;
    vertexOutputs.position = clip;
}
