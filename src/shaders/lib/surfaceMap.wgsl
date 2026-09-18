// Sample the world-aligned soft-surface mask shared by GPU deformation consumers; CPU thresholds are generated alongside the shader source.

var surfaceMap: texture_2d<f32>;
var surfaceMapSampler: sampler;
uniform surfaceOrigin: vec2f;
uniform surfaceExtent: vec2f;
fn mappedSurface(world: vec2f) -> vec2f {
    let dims = vec2f(textureDimensions(surfaceMap));
    let uv = ((world - uniforms.surfaceOrigin) / uniforms.surfaceExtent * (dims - 1.0) + 0.5) / dims;
    return textureSampleLevel(surfaceMap, surfaceMapSampler, uv, 0.0).rg;
}
