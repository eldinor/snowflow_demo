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
uniform emissiveMatrix: mat4x4f;
varying vEmissiveUV: vec2f;
#ifdef PROP_WIND
uniform propWind: vec4f;
uniform windTime: f32;
uniform windBounds: vec2f;
uniform cullCenter: vec2f;
#endif
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
    var worldPos = model * vec4f(vertexInputs.position, 1.0);
    // Authored transforms have rotation and nonuniform scale, without shear.
    let basis = mat3x3f(model[0].xyz / dot(model[0].xyz, model[0].xyz), model[1].xyz / dot(model[1].xyz, model[1].xyz), model[2].xyz / dot(model[2].xyz, model[2].xyz));
    var worldNormal = normalize(basis * vertexInputs.normal);
#ifdef PROP_WIND
    // Shared by near/far meshes and every render pass. Local height keeps
    // roots fixed even when authored instances have rotation and scale.
    let h = clamp((vertexInputs.position.y - uniforms.windBounds.x) / uniforms.windBounds.y, 0.0, 1.0);
    let origin = model[3].xz;
    let fade = 1.0 - smoothstep(25.0, 55.0, distance(origin, uniforms.cullCenter));
    if (fade > 0.0 && uniforms.propWind.z > 0.0) {
        let phase = dot(origin, vec2f(0.73, 1.17));
        let t = uniforms.windTime;
        let gust = 0.55 + 0.25 * sin(t * 0.7 + dot(origin, vec2f(0.035, 0.021)));
        let sway = gust + 0.3 * sin(t * 1.8 + phase);
        let flutter = 0.12 * sin(t * 7.0 + phase + dot(vertexInputs.position.xz, vec2f(3.1, 4.7)));
        let direction = vec3f(uniforms.propWind.x, 0.0, uniforms.propWind.y);
        let sideways = vec3f(-direction.z, 0.0, direction.x);
        let height = uniforms.windBounds.y * length(model[1].xyz);
        let amplitude = min(height, 2.0) * 0.065 * uniforms.propWind.z * fade;
        worldPos = vec4f(worldPos.xyz + amplitude * (direction * sway * h * h + sideways * flutter * h * h * h), 1.0);
        // First-order bend normal: inverse-transpose of the height shear.
        let slope = amplitude * (direction * sway * 2.0 * h + sideways * flutter * 3.0 * h * h);
        let heightGradient = basis[1] / uniforms.windBounds.y;
        worldNormal = normalize(worldNormal - heightGradient * dot(slope, worldNormal));
    }
#endif
    vertexOutputs.vNormal = worldNormal;
    vertexOutputs.vWorld = worldPos.xyz;
    vertexOutputs.vUV = (uniforms.uvMatrix * vec4f(vertexInputs.uv, 1.0, 0.0)).xy;
    vertexOutputs.vEmissiveUV = (uniforms.emissiveMatrix * vec4f(vertexInputs.uv, 1.0, 0.0)).xy;
    let clip = uniforms.viewProjection * worldPos;
    vertexOutputs.vViewZ = clip.w;
#ifdef PROP_SHADOW
    vertexOutputs.position = uniforms.lightViewProjection * worldPos;
#else
    vertexOutputs.position = clip;
#endif
}
