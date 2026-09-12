attribute position: vec3f;
attribute normal: vec3f;
attribute uv: vec2f;
#ifdef INSTANCES
attribute world0: vec4f;
attribute world1: vec4f;
attribute world2: vec4f;
attribute world3: vec4f;
#endif
uniform world: mat4x4f;
uniform viewProjection: mat4x4f;
uniform lightViewProjection: mat4x4f;
uniform uvMatrix: mat4x4f;
varying vWorld: vec3f;
varying vNormal: vec3f;
varying vUV: vec2f;
varying vViewZ: f32;
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
#ifdef INSTANCES
    let model = uniforms.world * mat4x4f(vertexInputs.world0, vertexInputs.world1, vertexInputs.world2, vertexInputs.world3);
#else
    let model = uniforms.world;
#endif
    let worldPos = model * vec4f(vertexInputs.position, 1.0);
    // Authored transforms have rotation and nonuniform scale, without shear.
    let basis = mat3x3f(model[0].xyz / dot(model[0].xyz, model[0].xyz), model[1].xyz / dot(model[1].xyz, model[1].xyz), model[2].xyz / dot(model[2].xyz, model[2].xyz));
    vertexOutputs.vNormal = normalize(basis * vertexInputs.normal);
    vertexOutputs.vWorld = worldPos.xyz;
    vertexOutputs.vUV = (uniforms.uvMatrix * vec4f(vertexInputs.uv, 1.0, 0.0)).xy;
    let clip = uniforms.viewProjection * worldPos;
    vertexOutputs.vViewZ = clip.w;
#ifdef PROP_SHADOW
    vertexOutputs.position = uniforms.lightViewProjection * worldPos;
#else
    vertexOutputs.position = clip;
#endif
}
