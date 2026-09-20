varying vWorld: vec3f;
varying vNormal: vec3f;
varying vWaterMask: f32;
varying vWaterUV: vec2f;

uniform cameraPosition: vec3f;
uniform time: f32;
uniform waterOpacity: f32;

var waterMask: texture_2d<f32>;
var waterMaskSampler: sampler;

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
    let water = textureSample(waterMask, waterMaskSampler, input.vWaterUV).r;
    if (water < 0.08) { discard; }
    let view = normalize(uniforms.cameraPosition - input.vWorld);
    let normal = normalize(input.vNormal + vec3f(
        sin(input.vWorld.z * 0.09 + uniforms.time * 0.8) * 0.035,
        0.0,
        cos(input.vWorld.x * 0.075 + uniforms.time * 0.65) * 0.035
    ));
    let fresnel = pow(1.0 - clamp(dot(normal, view), 0.0, 1.0), 3.0);
    let deep = vec3f(0.018, 0.16, 0.22);
    let sky = vec3f(0.34, 0.52, 0.58);
    let color = mix(deep, sky, 0.2 + fresnel * 0.72);
    fragmentOutputs.color = vec4f(color, uniforms.waterOpacity);
}
