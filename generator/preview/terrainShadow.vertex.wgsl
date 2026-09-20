attribute position: vec3f;

uniform lightViewProjection: mat4x4f;
uniform lodCenter: vec2f;
uniform baseSpacing: f32;
uniform gridHalfN: f32;
uniform deformCenter: vec2f;
uniform deformSize: f32;
uniform deformEnabled: f32;
uniform deformMinimum: f32;
uniform deformRange: f32;

#include<generatedHeightSampling>

var deformTex: texture_2d<f32>;
var deformTexSampler: sampler;

fn deformationHeight(worldXZ: vec2f) -> f32 {
    if (uniforms.deformEnabled < 0.5) { return 0.0; }
    let uv = (worldXZ - (uniforms.deformCenter - vec2f(uniforms.deformSize * 0.5))) / uniforms.deformSize;
    if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { return 0.0; }
    return textureSampleLevel(deformTex, deformTexSampler, uv, 0.0).r * uniforms.deformRange + uniforms.deformMinimum;
}

fn clipmapPosition(grid: vec2f, level: f32) -> vec2f {
    let spacing = uniforms.baseSpacing * exp2(level);
    let snap = spacing * 2.0;
    let origin = floor(uniforms.lodCenter / snap) * snap;
    var localPosition = grid * spacing;
    let extent = uniforms.gridHalfN * spacing;
    let edge = max(abs(localPosition.x), abs(localPosition.y)) / extent;
    let morph = clamp((edge - 0.70) / 0.16, 0.0, 1.0);
    localPosition = mix(localPosition, floor(grid * 0.5) * 2.0 * spacing, morph);
    return origin + localPosition;
}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
    let worldXZ = clipmapPosition(vertexInputs.position.xz, vertexInputs.position.y);
    let world = vec3f(worldXZ.x, worldHeight(worldXZ) + deformationHeight(worldXZ), worldXZ.y);
    vertexOutputs.position = uniforms.lightViewProjection * vec4f(world, 1.0);
}
