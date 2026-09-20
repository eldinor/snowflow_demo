attribute position: vec3f;
attribute color: vec4f;

uniform viewProjection: mat4x4f;
uniform normalSampleStep: f32;
uniform deformCenter: vec2f;
uniform deformSize: f32;
uniform deformRes: f32;
uniform deformEnabled: f32;
uniform deformMinimum: f32;
uniform deformRange: f32;
uniform useClipmap: f32;
uniform lodCenter: vec2f;
uniform baseSpacing: f32;
uniform gridHalfN: f32;

#include<generatedHeightSampling>

var deformTex: texture_2d<f32>;
var deformTexSampler: sampler;
var riverCarve: texture_2d<f32>;
var riverCarveSampler: sampler;
var landmarkClearance: texture_2d<f32>;
var landmarkClearanceSampler: sampler;
var roadGrade: texture_2d<f32>;
var roadGradeSampler: sampler;

varying vWorld: vec3f;
varying vNormal: vec3f;
varying vColor: vec3f;
varying vBiomeUV: vec2f;
varying vDeformation: f32;

fn deformationHeight(worldXZ: vec2f) -> f32 {
    if (uniforms.deformEnabled < 0.5) { return 0.0; }
    let uv = (worldXZ - (uniforms.deformCenter - vec2f(uniforms.deformSize * 0.5))) / uniforms.deformSize;
    if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { return 0.0; }
    let encoded = textureSampleLevel(deformTex, deformTexSampler, uv, 0.0).r;
    return encoded * uniforms.deformRange + uniforms.deformMinimum;
}

fn displacedHeight(worldXZ: vec2f) -> f32 {
    let uv = (worldXZ - uniforms.worldOrigin) / uniforms.worldExtent;
    let carve = textureSampleLevel(riverCarve, riverCarveSampler, clamp(uv, vec2f(0.0), vec2f(1.0)), 0.0).r;
    let clearance = textureSampleLevel(landmarkClearance, landmarkClearanceSampler, clamp(uv, vec2f(0.0), vec2f(1.0)), 0.0).r;
    let grading = textureSampleLevel(roadGrade, roadGradeSampler, clamp(uv, vec2f(0.0), vec2f(1.0)), 0.0).r;
    return worldHeight(worldXZ) + carve + clearance + grading + deformationHeight(worldXZ);
}

fn clipmapPosition(grid: vec2f, level: f32) -> vec2f {
    let spacing = uniforms.baseSpacing * exp2(level);
    let snap = spacing * 2.0;
    let origin = floor(uniforms.lodCenter / snap) * snap;
    var localPosition = grid * spacing;
    let extent = uniforms.gridHalfN * spacing;
    let edge = max(abs(localPosition.x), abs(localPosition.y)) / extent;
    let morph = clamp((edge - 0.70) / 0.16, 0.0, 1.0);
    let coarseGrid = floor(grid * 0.5) * 2.0;
    localPosition = mix(localPosition, coarseGrid * spacing, morph);
    return origin + localPosition;
}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
    var worldXZ = vertexInputs.position.xz;
    if (uniforms.useClipmap > 0.5) {
        worldXZ = clipmapPosition(vertexInputs.position.xz, vertexInputs.position.y);
    }
    let height = displacedHeight(worldXZ);
    let step = uniforms.normalSampleStep;
    let west = displacedHeight(worldXZ - vec2f(step, 0.0));
    let east = displacedHeight(worldXZ + vec2f(step, 0.0));
    let south = displacedHeight(worldXZ - vec2f(0.0, step));
    let north = displacedHeight(worldXZ + vec2f(0.0, step));
    let normal = normalize(vec3f(west - east, 2.0 * step, south - north));
    let world = vec3f(worldXZ.x, height, worldXZ.y);
    vertexOutputs.vWorld = world;
    vertexOutputs.vNormal = normal;
    vertexOutputs.vColor = vertexInputs.color.rgb;
    vertexOutputs.vBiomeUV = (worldXZ - uniforms.worldOrigin) / uniforms.worldExtent;
    vertexOutputs.vDeformation = deformationHeight(worldXZ);
    vertexOutputs.position = uniforms.viewProjection * vec4f(world, 1.0);
}
