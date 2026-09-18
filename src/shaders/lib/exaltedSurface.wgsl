// Reconstruct imported/detail ground and mask deformation with matching biome weights; preserve source triangle planes and patch boundaries.

#include<snowDeform>
#include<surfaceTypes>

uniform patchCenter: vec2f;
uniform deformCenter: vec2f;
uniform deformSize: f32;
uniform deformDepthScale: f32;
var deformTex: texture_2d<f32>;
var deformTexSampler: sampler;

struct ExaltedPoint { world: vec3f, normal: vec3f, color: vec3f };
#ifdef LOCAL_DETAIL
var patchTex: texture_2d<f32>;
var patchTexSampler: sampler;
fn resolveExalted(address: vec3f) -> ExaltedPoint {
    let t = i32(address.z);
    let w = vec3f(1.0 - address.x - address.y, address.x, address.y);
    var result: ExaltedPoint;
    result.world = textureLoad(patchTex, vec2i(t, 0), 0).xyz * w.x + textureLoad(patchTex, vec2i(t, 1), 0).xyz * w.y + textureLoad(patchTex, vec2i(t, 2), 0).xyz * w.z;
    result.normal = normalize(textureLoad(patchTex, vec2i(t, 3), 0).xyz * w.x + textureLoad(patchTex, vec2i(t, 4), 0).xyz * w.y + textureLoad(patchTex, vec2i(t, 5), 0).xyz * w.z);
    result.color = textureLoad(patchTex, vec2i(t, 6), 0).xyz * w.x + textureLoad(patchTex, vec2i(t, 7), 0).xyz * w.y + textureLoad(patchTex, vec2i(t, 8), 0).xyz * w.z;
    return result;
}
#endif
fn exaltedOffset(world: vec3f, color: vec3f) -> f32 {
    let weights = surfaceWeights(color);
    return deformHeight(deformTex, deformTexSampler, world.xz, uniforms.deformCenter, uniforms.deformSize, uniforms.deformDepthScale, 0.125)
        * (weights.x + weights.y) * localFade(world.xz, uniforms.patchCenter);
}
