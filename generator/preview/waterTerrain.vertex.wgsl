attribute position: vec3f;

uniform viewProjection: mat4x4f;
uniform worldOrigin: vec2f;
uniform worldExtent: vec2f;
uniform waterRes: f32;
uniform lodCenter: vec2f;
uniform baseSpacing: f32;
uniform gridHalfN: f32;
uniform useClipmap: f32;

var waterMask: texture_2d<f32>;
var waterMaskSampler: sampler;
var waterSurface: texture_2d<f32>;
var waterSurfaceSampler: sampler;

varying vWorld: vec3f;
varying vNormal: vec3f;
varying vWaterMask: f32;
varying vWaterUV: vec2f;

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

fn sampleSurface(worldXZ: vec2f) -> f32 {
    let uv = clamp((worldXZ - uniforms.worldOrigin) / uniforms.worldExtent, vec2f(0.0), vec2f(1.0));
    return textureSampleLevel(waterSurface, waterSurfaceSampler, uv, 0.0).r;
}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
    var worldXZ = vertexInputs.position.xz;
    if (uniforms.useClipmap > 0.5) {
        worldXZ = clipmapPosition(vertexInputs.position.xz, vertexInputs.position.y);
    }
    let uv = (worldXZ - uniforms.worldOrigin) / uniforms.worldExtent;
    let level = textureSampleLevel(waterMask, waterMaskSampler, clamp(uv, vec2f(0.0), vec2f(1.0)), 0.0).r;
    let step = uniforms.worldExtent.x / uniforms.waterRes;
    let west = sampleSurface(worldXZ - vec2f(step, 0.0));
    let east = sampleSurface(worldXZ + vec2f(step, 0.0));
    let south = sampleSurface(worldXZ - vec2f(0.0, step));
    let north = sampleSurface(worldXZ + vec2f(0.0, step));
    let world = vec3f(worldXZ.x, sampleSurface(worldXZ) + 0.08, worldXZ.y);
    vertexOutputs.vWorld = world;
    vertexOutputs.vNormal = normalize(vec3f(west - east, 2.0 * step, south - north));
    vertexOutputs.vWaterMask = select(0.0, level, all(uv >= vec2f(0.0)) && all(uv <= vec2f(1.0)));
    vertexOutputs.vWaterUV = uv;
    vertexOutputs.position = uniforms.viewProjection * vec4f(world, 1.0);
}
