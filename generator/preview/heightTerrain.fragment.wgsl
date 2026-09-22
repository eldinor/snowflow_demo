varying vWorld: vec3f;
varying vNormal: vec3f;
varying vColor: vec3f;
varying vBiomeUV: vec2f;
varying vDeformation: f32;

uniform lightDirection: vec3f;
uniform biomeDebug: f32;
uniform cameraPosition: vec3f;
uniform shadowEnabled: f32;
uniform shadowDebug: f32;
uniform hydrologyDebug: f32;
uniform maximumAccumulation: f32;
uniform deformCenter: vec2f;
uniform deformSize: f32;
uniform deformEnabled: f32;
uniform deformMinimum: f32;
uniform deformRange: f32;

#include<generatedHeightSampling>

var deformTex: texture_2d<f32>;
var deformTexSampler: sampler;

var biomes0: texture_2d<f32>;
var biomes0Sampler: sampler;
var biomes1: texture_2d<f32>;
var biomes1Sampler: sampler;
var flowAccumulation: texture_2d<f32>;
var flowAccumulationSampler: sampler;
var hydrologyMasks: texture_2d<f32>;
var hydrologyMasksSampler: sampler;
var lakeSurface: texture_2d<f32>;
var lakeSurfaceSampler: sampler;
var riverCarve: texture_2d<f32>;
var riverCarveSampler: sampler;
var waterDepth: texture_2d<f32>;
var waterDepthSampler: sampler;
var shorelineMask: texture_2d<f32>;
var shorelineMaskSampler: sampler;
var swimmableMask: texture_2d<f32>;
var swimmableMaskSampler: sampler;
var landmarkClearance: texture_2d<f32>;
var landmarkClearanceSampler: sampler;
var roadMask: texture_2d<f32>;
var roadMaskSampler: sampler;
var desertAlbedo: texture_2d<f32>;
var desertAlbedoSampler: sampler;
var desertNormal: texture_2d<f32>;
var desertNormalSampler: sampler;
var desertArm: texture_2d<f32>;
var desertArmSampler: sampler;

fn shadowDeformationHeight(worldXZ: vec2f) -> f32 {
    if (uniforms.deformEnabled < 0.5) { return 0.0; }
    let uv = (worldXZ - (uniforms.deformCenter - vec2f(uniforms.deformSize * 0.5))) / uniforms.deformSize;
    if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { return 0.0; }
    return textureSampleLevel(deformTex, deformTexSampler, uv, 0.0).r * uniforms.deformRange + uniforms.deformMinimum;
}
fn terrainShadowFactor(world: vec3f, normal: vec3f) -> f32 {
    if (uniforms.shadowEnabled < 0.5) { return 1.0; }
    let lightDirection = normalize(uniforms.lightDirection);
    let horizontalLength = max(length(lightDirection.xz), 0.001);
    let horizontalDirection = lightDirection.xz / horizontalLength;
    let risePerMetre = lightDirection.y / horizontalLength;
    let origin = world + normal * 0.9;
    var visibility = 1.0;
    var distanceToSample = 4.0;
    for (var index = 0; index < 20; index++) {
        let sampleXZ = origin.xz + horizontalDirection * distanceToSample;
        let sampleUV = (sampleXZ - uniforms.worldOrigin) / uniforms.worldExtent;
        if (all(sampleUV >= vec2f(0.0)) && all(sampleUV <= vec2f(1.0))) {
            let rayHeight = origin.y + risePerMetre * distanceToSample;
            let carveUV = (sampleXZ - uniforms.worldOrigin) / uniforms.worldExtent;
            let carve = textureSampleLevel(riverCarve, riverCarveSampler, carveUV, 0.0).r;
            let clearance = textureSampleLevel(landmarkClearance, landmarkClearanceSampler, carveUV, 0.0).r;
            let blocker = worldHeight(sampleXZ) + carve + clearance + shadowDeformationHeight(sampleXZ) - rayHeight;
            visibility = min(visibility, 1.0 - smoothstep(-1.5, 2.0, blocker));
        }
        distanceToSample *= 1.28;
    }
    return visibility;
}

fn biomeTint(index: i32) -> vec3f {
    switch index {
        case 0: { return vec3f(0.72, 0.50, 0.25); }
        case 1: { return vec3f(0.28, 0.48, 0.20); }
        case 2: { return vec3f(0.08, 0.24, 0.14); }
        case 3: { return vec3f(0.88, 0.94, 0.96); }
        case 4: { return vec3f(0.28, 0.29, 0.28); }
        case 5: { return vec3f(0.12, 0.31, 0.27); }
        case 6: { return vec3f(0.68, 0.62, 0.42); }
        default: { return vec3f(0.62, 0.30, 0.18); }
    }
}

fn flowDirectionColor(encoded: f32) -> vec3f {
    let code = i32(round(encoded * 255.0)) - 1;
    if (code < 0) { return vec3f(0.95, 0.18, 0.30); }
    let angle = f32(code) * 0.785398163;
    return vec3f(0.5 + 0.5 * cos(angle), 0.5 + 0.5 * cos(angle - 2.094), 0.5 + 0.5 * cos(angle + 2.094));
}

fn hash21(p: vec2f) -> f32 {
    let q = fract(p * vec2f(123.34, 345.45));
    return fract(q.x * q.y * (q.x + q.y + 34.345));
}

fn valueNoise(p: vec2f) -> f32 {
    let cell = floor(p);
    let local = fract(p);
    let blend = local * local * (3.0 - 2.0 * local);
    return mix(
        mix(hash21(cell), hash21(cell + vec2f(1.0, 0.0)), blend.x),
        mix(hash21(cell + vec2f(0.0, 1.0)), hash21(cell + vec2f(1.0, 1.0)), blend.x),
        blend.y
    );
}

fn materialColor(index: i32, world: vec3f, normal: vec3f, footprint: f32) -> vec3f {
    let worldXZ = world.xz;
    let macroVariation = valueNoise(worldXZ / 92.0) - 0.5;
    let localFade = 1.0 - smoothstep(2.0, 12.0, footprint);
    let microFade = 1.0 - smoothstep(0.45, 3.5, footprint);
    let local = (valueNoise(worldXZ / 11.0) - 0.5) * localFade;
    let micro = (valueNoise(worldXZ / 2.7) - 0.5) * microFade;
    let slope = 1.0 - max(normal.y, 0.0);
    switch index {
        case 0: {
            let distortion = valueNoise(worldXZ / 37.0) * 5.5 + sin(worldXZ.y * 0.027) * 1.4;
            let rippleSignal = sin(dot(worldXZ, normalize(vec2f(0.92, 0.38))) * 0.46 + distortion);
            let rippleFade = (1.0 - smoothstep(0.35, 2.2, footprint)) * 0.035;
            return mix(vec3f(0.34, 0.205, 0.105), vec3f(0.67, 0.455, 0.235), 0.61 + macroVariation * 0.22 + rippleSignal * rippleFade + micro * 0.035);
        }
        case 1: {
            return mix(vec3f(0.075, 0.17, 0.065), vec3f(0.245, 0.40, 0.145), 0.57 + macroVariation * 0.27 + local * 0.12);
        }
        case 2: {
            let litter = smoothstep(0.42, 0.72, local + micro * 0.25 + 0.5);
            return mix(vec3f(0.045, 0.085, 0.045), vec3f(0.155, 0.215, 0.095), litter) * (0.96 + macroVariation * 0.14);
        }
        case 3: {
            let windLines = sin(worldXZ.x * 0.16 + sin(worldXZ.y * 0.055) * 2.0) * microFade;
            return mix(vec3f(0.61, 0.69, 0.73), vec3f(0.90, 0.935, 0.94), 0.68 + macroVariation * 0.15 + windLines * 0.025 - slope * 0.18);
        }
        case 4: {
            let strata = sin(world.y * 0.105 + local * 3.0) * 0.5 + 0.5;
            return mix(vec3f(0.20, 0.205, 0.195), vec3f(0.42, 0.40, 0.36), 0.50 + strata * 0.15 * localFade + macroVariation * 0.13);
        }
        case 5: {
            return mix(vec3f(0.035, 0.095, 0.075), vec3f(0.13, 0.24, 0.14), 0.48 + local * 0.25);
        }
        case 6: {
            return mix(vec3f(0.26, 0.215, 0.125), vec3f(0.56, 0.49, 0.29), 0.55 + macroVariation * 0.22 + micro * 0.08);
        }
        default: {
            return mix(vec3f(0.19, 0.16, 0.13), vec3f(0.39, 0.31, 0.23), 0.5 + macroVariation * 0.2);
        }
    }
}

fn materialRoughness(index: i32) -> f32 {
    switch index {
        case 3: { return 0.72; }
        case 4: { return 0.82; }
        case 5: { return 0.48; }
        case 6: { return 0.56; }
        default: { return 0.88; }
    }
}

fn materialDetailHeight(index: i32, worldXZ: vec2f) -> f32 {
    switch index {
        case 0: { return valueNoise(worldXZ / 1.35) * 0.45 + sin(dot(worldXZ, vec2f(0.92, 0.38)) * 3.2) * 0.08; }
        case 1: { return valueNoise(worldXZ / 0.92) * 0.34 + valueNoise(worldXZ / 3.8) * 0.18; }
        case 2: { return valueNoise(worldXZ / 0.68) * 0.42 + valueNoise(worldXZ / 2.7) * 0.24; }
        case 3: { return valueNoise(worldXZ / 1.8) * 0.22 + sin(worldXZ.x * 1.4 + sin(worldXZ.y * 0.4)) * 0.06; }
        case 4: { return valueNoise(worldXZ / 1.25) * 0.62 + valueNoise(worldXZ / 4.5) * 0.28; }
        case 5: { return valueNoise(worldXZ / 0.75) * 0.2; }
        case 6: { return valueNoise(worldXZ / 0.52) * 0.5 + valueNoise(worldXZ / 2.2) * 0.16; }
        default: { return valueNoise(worldXZ / 1.1) * 0.25; }
    }
}

fn materialNormalStrength(index: i32) -> f32 {
    switch index {
        case 0: { return 0.72; } case 1: { return 0.82; } case 2: { return 0.9; }
        case 3: { return 0.54; } case 4: { return 1.15; } case 5: { return 0.65; }
        case 6: { return 0.88; } default: { return 0.62; }
    }
}

fn proceduralDetailNormal(index: i32, worldXZ: vec2f, geometricNormal: vec3f, footprint: f32) -> vec3f {
    let step = 0.18;
    let west = materialDetailHeight(index, worldXZ - vec2f(step, 0.0));
    let east = materialDetailHeight(index, worldXZ + vec2f(step, 0.0));
    let south = materialDetailHeight(index, worldXZ - vec2f(0.0, step));
    let north = materialDetailHeight(index, worldXZ + vec2f(0.0, step));
    let perturbation = vec3f(west - east, 0.0, south - north) * materialNormalStrength(index);
    let detailFade = (1.0 - smoothstep(0.45, 4.5, footprint)) * smoothstep(0.06, 0.35, geometricNormal.y);
    return normalize(geometricNormal + perturbation * detailFade);
}

fn rotate2(value: vec2f, angle: f32) -> vec2f {
    let cosine = cos(angle);
    let sine = sin(angle);
    return vec2f(cosine * value.x - sine * value.y, sine * value.x + cosine * value.y);
}

fn terrainAtlasUV(value: vec2f, layer: f32) -> vec2f {
    // Half-pixel insets keep bilinear filtering inside each repeating atlas tile.
    return vec2f(layer * 0.5 + 0.00025 + fract(value.x) * 0.4995, 0.0005 + fract(value.y) * 0.999);
}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
    let footprint = max(length(dpdx(input.vWorld.xz)), length(dpdy(input.vWorld.xz)));
    if (any(input.vBiomeUV < vec2f(0.0)) || any(input.vBiomeUV > vec2f(1.0))) { discard; }
    var normal = normalize(input.vNormal);
    let weights0 = textureSample(biomes0, biomes0Sampler, input.vBiomeUV);
    let weights1 = textureSample(biomes1, biomes1Sampler, input.vBiomeUV);
    let weights = array<f32, 8>(
        weights0.r, weights0.g, weights0.b, weights0.a,
        weights1.r, weights1.g, weights1.b, weights1.a
    );
    var dominantLayer = 0;
    var dominantWeight = weights[0];
    for (var layer = 1; layer < 8; layer++) {
        if (weights[layer] > dominantWeight) { dominantLayer = layer; dominantWeight = weights[layer]; }
    }
    normal = proceduralDetailNormal(dominantLayer, input.vWorld.xz, normal, footprint);
    if (uniforms.hydrologyDebug > 6.5) {
        let road = textureSample(roadMask, roadMaskSampler, input.vBiomeUV).r;
        let terrain = vec3f(0.045, 0.052, 0.055);
        fragmentOutputs.color = vec4f(mix(terrain, vec3f(0.94, 0.62, 0.22), road), 1.0);
        return fragmentOutputs;
    }
    if (uniforms.hydrologyDebug > 5.5) {
        let shoreline = textureSample(shorelineMask, shorelineMaskSampler, input.vBiomeUV).r;
        let masks = textureSample(hydrologyMasks, hydrologyMasksSampler, input.vBiomeUV);
        let water = masks.g;
        let river = masks.b;
        let wet = max(water, river);
        let base = mix(vec3f(0.045, 0.052, 0.055), vec3f(0.03, 0.18, 0.27), wet);
        fragmentOutputs.color = vec4f(mix(base, vec3f(1.0, 0.62, 0.08), shoreline), 1.0);
        return fragmentOutputs;
    }
    if (uniforms.hydrologyDebug > 4.5) {
        let depth = textureSample(waterDepth, waterDepthSampler, input.vBiomeUV).r;
        let swimmable = textureSample(swimmableMask, swimmableMaskSampler, input.vBiomeUV).r;
        let shallow = vec3f(0.10, 0.55, 0.64);
        let deep = vec3f(0.025, 0.12, 0.48);
        var color = mix(shallow, deep, clamp(depth / 12.0, 0.0, 1.0));
        color = mix(color, vec3f(0.10, 0.92, 0.72), swimmable * 0.35);
        if (depth <= 0.0) { color = vec3f(0.045, 0.052, 0.055); }
        fragmentOutputs.color = vec4f(color, 1.0);
        return fragmentOutputs;
    }
    if (uniforms.hydrologyDebug > 3.5) {
        let masks = textureSample(hydrologyMasks, hydrologyMasksSampler, input.vBiomeUV);
        let river = masks.b;
        let waterfall = masks.a;
        let dry = vec3f(0.045, 0.055, 0.06);
        let small = vec3f(0.10, 0.52, 0.72);
        let primary = vec3f(0.06, 0.72, 1.0);
        let water = mix(small, primary, smoothstep(0.72, 0.95, river));
        let riverColor = mix(dry, water, smoothstep(0.1, 0.55, river));
        fragmentOutputs.color = vec4f(mix(riverColor, vec3f(1.0, 0.72, 0.08), waterfall), 1.0);
        return fragmentOutputs;
    }
    if (uniforms.hydrologyDebug > 2.5) {
        let lake = textureSample(hydrologyMasks, hydrologyMasksSampler, input.vBiomeUV).g;
        let level = textureSample(lakeSurface, lakeSurfaceSampler, input.vBiomeUV).r;
        let elevationTint = clamp((level + 20.0) / 540.0, 0.0, 1.0);
        let dry = vec3f(0.055, 0.065, 0.07);
        let water = mix(vec3f(0.02, 0.25, 0.42), vec3f(0.12, 0.72, 0.92), elevationTint);
        fragmentOutputs.color = vec4f(mix(dry, water, lake), 1.0);
        return fragmentOutputs;
    }
    if (uniforms.hydrologyDebug > 1.5) {
        let accumulated = textureSample(flowAccumulation, flowAccumulationSampler, input.vBiomeUV).r;
        let normalized = clamp(log2(max(accumulated, 1.0)) / log2(max(uniforms.maximumAccumulation, 2.0)), 0.0, 1.0);
        let water = smoothstep(0.18, 0.92, normalized);
        fragmentOutputs.color = vec4f(mix(vec3f(0.025, 0.035, 0.04), vec3f(0.08, 0.68, 1.0), water), 1.0);
        return fragmentOutputs;
    }
    if (uniforms.hydrologyDebug > 0.5) {
        fragmentOutputs.color = vec4f(flowDirectionColor(textureSample(hydrologyMasks, hydrologyMasksSampler, input.vBiomeUV).r), 1.0);
        return fragmentOutputs;
    }
    let desertUV = input.vWorld.xz / 2.5;
    let desertUV0 = desertUV;
    let desertUV1 = rotate2(desertUV * 0.93, 0.83) + vec2f(17.31, 9.17);
    let desertUV2 = rotate2(desertUV * 1.07, -1.19) + vec2f(-8.43, 21.73);
    let desertNoise0 = valueNoise(input.vWorld.xz / 11.0);
    let desertNoise1 = valueNoise((input.vWorld.xz + vec2f(37.0, -19.0)) / 17.0);
    let desertBaseWeights = vec3f(0.72 + desertNoise0 * 0.36, 0.72 + desertNoise1 * 0.36, 0.96 - (desertNoise0 + desertNoise1) * 0.18);
    let desertAtlasUV0 = terrainAtlasUV(desertUV0, 0.0);
    let desertAtlasUV1 = terrainAtlasUV(desertUV1, 0.0);
    let desertAtlasUV2 = terrainAtlasUV(desertUV2, 0.0);
    let desertArm0 = textureSample(desertArm, desertArmSampler, desertAtlasUV0).rgb;
    let desertArm1 = textureSample(desertArm, desertArmSampler, desertAtlasUV1).rgb;
    let desertArm2 = textureSample(desertArm, desertArmSampler, desertAtlasUV2).rgb;
    // The AO channel tracks the larger grain and hollow structure closely enough
    // to guide stochastic selection without spending another texture binding.
    let desertHeights = vec3f(desertArm0.r, desertArm1.r, desertArm2.r);
    // Keep transitions broad and soft. Hard height-selected weights produce visible
    // square islands when the terrain is viewed from above.
    let desertWeightedHeights = desertBaseWeights * (vec3f(0.88) + desertHeights * 0.20);
    let desertWeights = desertWeightedHeights * desertWeightedHeights + vec3f(0.01);
    let desertWeightSum = desertWeights.x + desertWeights.y + desertWeights.z;
    let desertHeightValue = dot(desertHeights, desertWeights) / desertWeightSum;
    let desertColor = (
        textureSample(desertAlbedo, desertAlbedoSampler, desertAtlasUV0).rgb * desertWeights.x
        + textureSample(desertAlbedo, desertAlbedoSampler, desertAtlasUV1).rgb * desertWeights.y
        + textureSample(desertAlbedo, desertAlbedoSampler, desertAtlasUV2).rgb * desertWeights.z
    ) / desertWeightSum * (0.94 + desertHeightValue * 0.10);
    let normal0 = textureSample(desertNormal, desertNormalSampler, desertAtlasUV0).xyz * 2.0 - 1.0;
    let normal1Raw = textureSample(desertNormal, desertNormalSampler, desertAtlasUV1).xyz * 2.0 - 1.0;
    let normal2Raw = textureSample(desertNormal, desertNormalSampler, desertAtlasUV2).xyz * 2.0 - 1.0;
    let normal1XY = rotate2(normal1Raw.xy, -0.83);
    let normal2XY = rotate2(normal2Raw.xy, 1.19);
    let desertNormalSample = normalize((
        normal0 * desertWeights.x
        + vec3f(normal1XY, normal1Raw.z) * desertWeights.y
        + vec3f(normal2XY, normal2Raw.z) * desertWeights.z
    ) / desertWeightSum);
    let desertArmSample = (
        desertArm0 * desertWeights.x
        + desertArm1 * desertWeights.y
        + desertArm2 * desertWeights.z
    ) / desertWeightSum;
    let desertBlend = smoothstep(0.12, 0.62, weights[0]);
    let desertWorldNormal = normalize(vec3f(desertNormalSample.x, max(desertNormalSample.z, 0.08), desertNormalSample.y));
    normal = normalize(mix(normal, desertWorldNormal, desertBlend * smoothstep(0.35, 0.8, normal.y) * 0.72));
    let grassUV = input.vWorld.xz / 2.0;
    let grassAtlasUV0 = terrainAtlasUV(grassUV, 1.0);
    let grassAtlasUV1 = terrainAtlasUV(rotate2(grassUV * 0.94, 0.71) + vec2f(12.7, -8.2), 1.0);
    let grassAtlasUV2 = terrainAtlasUV(rotate2(grassUV * 1.06, -1.07) + vec2f(-6.4, 18.9), 1.0);
    let grassNoise0 = valueNoise((input.vWorld.xz + vec2f(11.0, 29.0)) / 13.0);
    let grassNoise1 = valueNoise((input.vWorld.xz + vec2f(-31.0, 7.0)) / 19.0);
    let grassWeights = vec3f(0.8 + grassNoise0 * 0.28, 0.8 + grassNoise1 * 0.28, 1.08 - (grassNoise0 + grassNoise1) * 0.2);
    let grassWeightSum = grassWeights.x + grassWeights.y + grassWeights.z;
    let grassColorRaw = (
        textureSample(desertAlbedo, desertAlbedoSampler, grassAtlasUV0).rgb * grassWeights.x
        + textureSample(desertAlbedo, desertAlbedoSampler, grassAtlasUV1).rgb * grassWeights.y
        + textureSample(desertAlbedo, desertAlbedoSampler, grassAtlasUV2).rgb * grassWeights.z
    ) / grassWeightSum;
    // Preserve the scan's soil and leaf variation while restoring the green
    // response that is otherwise lost under the world lighting and distance fog.
    let grassColor = grassColorRaw * vec3f(0.76, 1.14, 0.72);
    let grassNormal0 = textureSample(desertNormal, desertNormalSampler, grassAtlasUV0).xyz * 2.0 - 1.0;
    let grassNormal1Raw = textureSample(desertNormal, desertNormalSampler, grassAtlasUV1).xyz * 2.0 - 1.0;
    let grassNormal2Raw = textureSample(desertNormal, desertNormalSampler, grassAtlasUV2).xyz * 2.0 - 1.0;
    let grassNormal1XY = rotate2(grassNormal1Raw.xy, -0.71);
    let grassNormal2XY = rotate2(grassNormal2Raw.xy, 1.07);
    let grassNormalSample = normalize((grassNormal0 * grassWeights.x + vec3f(grassNormal1XY, grassNormal1Raw.z) * grassWeights.y + vec3f(grassNormal2XY, grassNormal2Raw.z) * grassWeights.z) / grassWeightSum);
    let grassArmSample = (
        textureSample(desertArm, desertArmSampler, grassAtlasUV0).rgb * grassWeights.x
        + textureSample(desertArm, desertArmSampler, grassAtlasUV1).rgb * grassWeights.y
        + textureSample(desertArm, desertArmSampler, grassAtlasUV2).rgb * grassWeights.z
    ) / grassWeightSum;
    let grassBlend = smoothstep(0.12, 0.62, weights[1]);
    let grassWorldNormal = normalize(vec3f(grassNormalSample.x, max(grassNormalSample.z, 0.08), grassNormalSample.y));
    normal = normalize(mix(normal, grassWorldNormal, grassBlend * smoothstep(0.32, 0.78, normal.y) * 0.78));
    var baseColor = input.vColor;
    let roadCoverage = smoothstep(0.04, 0.82, textureSample(roadMask, roadMaskSampler, input.vBiomeUV).r);
    if (uniforms.biomeDebug < -3.5) {
        let moisture = clamp(weights[2] + weights[5] + weights[6] * 0.6, 0.0, 1.0);
        baseColor = vec3f(0.10, moisture * 0.62, moisture);
    } else if (uniforms.biomeDebug < -2.5) {
        let temperature = clamp(0.86 - input.vBiomeUV.y * 0.52 - max(input.vWorld.y, 0.0) * 0.00125, 0.0, 1.0);
        baseColor = vec3f(temperature, 0.18, 1.0 - temperature);
    } else if (uniforms.biomeDebug < -1.5) {
        let elevation = clamp((input.vWorld.y + 18.0) / 538.0, 0.0, 1.0);
        baseColor = vec3f(elevation * 0.85, elevation * 0.9, elevation);
    } else if (uniforms.biomeDebug >= -0.5) {
        if (uniforms.biomeDebug < 0.5) {
            baseColor = vec3f(0.0);
            for (var index = 0; index < 8; index++) {
                baseColor += materialColor(index, input.vWorld, normal, footprint) * weights[index];
            }
            baseColor = mix(baseColor, desertColor, desertBlend * 0.9);
            baseColor = mix(baseColor, grassColor, grassBlend * 0.92);
            let roadMacro = valueNoise(input.vWorld.xz / 24.0) - 0.5;
            let roadLocal = (valueNoise(input.vWorld.xz / 3.8) - 0.5) * (1.0 - smoothstep(0.8, 5.0, footprint));
            let roadColor = mix(vec3f(0.16, 0.125, 0.09), vec3f(0.34, 0.275, 0.19), 0.55 + roadMacro * 0.24 + roadLocal * 0.12);
            baseColor = mix(baseColor, roadColor, roadCoverage * 0.94);
        } else {
            let index = clamp(i32(uniforms.biomeDebug) - 1, 0, 7);
            baseColor = biomeTint(index) * weights[index];
        }
    }
    let lightDirection = normalize(uniforms.lightDirection);
    let diffuse = max(dot(normal, lightDirection), 0.0);
    let skyFill = 0.46 + 0.24 * max(normal.y, 0.0);
    let shadow = terrainShadowFactor(input.vWorld, normal);
    if (uniforms.shadowDebug > 0.5) {
        fragmentOutputs.color = vec4f(vec3f(shadow), 1.0);
        return fragmentOutputs;
    }
    let shadowedSky = skyFill * mix(0.68, 1.0, shadow);
    let lighting = shadowedSky + diffuse * 0.68 * mix(0.12, 1.0, shadow);
    var roughness = 0.0;
    for (var index = 0; index < 8; index++) {
        roughness += materialRoughness(index) * weights[index];
    }
    roughness = mix(roughness, desertArmSample.g, desertBlend);
    roughness = mix(roughness, grassArmSample.g, grassBlend);
    if (uniforms.biomeDebug >= -0.5 && uniforms.biomeDebug < 0.5) {
        roughness = mix(roughness, 0.94, roadCoverage);
    }
    let viewDirection = normalize(uniforms.cameraPosition - input.vWorld);
    let halfVector = normalize(lightDirection + viewDirection);
    let specular = pow(max(dot(normal, halfVector), 0.0), mix(48.0, 8.0, roughness)) * (1.0 - roughness) * 0.28;
    let compression = smoothstep(0.01, 0.22, -input.vDeformation);
    let berm = smoothstep(0.008, 0.09, input.vDeformation);
    baseColor = mix(baseColor, baseColor * vec3f(0.63, 0.68, 0.72), compression * 0.72);
    baseColor = mix(baseColor, baseColor * 1.16, berm * 0.55);
    let terrainAO = mix(mix(1.0, desertArmSample.r, desertBlend * 0.7), grassArmSample.r, grassBlend * 0.7);
    let shaded = baseColor * lighting * terrainAO + vec3f(specular);
    let distanceToCamera = distance(uniforms.cameraPosition, input.vWorld);
    let heightFog = exp(-max(input.vWorld.y, 0.0) * 0.0012);
    let fog = (1.0 - exp(-max(distanceToCamera - 480.0, 0.0) * 0.00072)) * heightFog;
    let fogColor = vec3f(0.22, 0.30, 0.33);
    fragmentOutputs.color = vec4f(mix(shaded, fogColor, clamp(fog, 0.0, 0.72)), 1.0);
}
