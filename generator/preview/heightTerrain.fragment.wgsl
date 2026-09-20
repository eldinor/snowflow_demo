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
var flowDirection: texture_2d<f32>;
var flowDirectionSampler: sampler;
var flowAccumulation: texture_2d<f32>;
var flowAccumulationSampler: sampler;
var lakeMask: texture_2d<f32>;
var lakeMaskSampler: sampler;
var lakeSurface: texture_2d<f32>;
var lakeSurfaceSampler: sampler;
var riverMask: texture_2d<f32>;
var riverMaskSampler: sampler;
var riverCarve: texture_2d<f32>;
var riverCarveSampler: sampler;
var waterfallMask: texture_2d<f32>;
var waterfallMaskSampler: sampler;
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

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
    let footprint = max(length(dpdx(input.vWorld.xz)), length(dpdy(input.vWorld.xz)));
    if (any(input.vBiomeUV < vec2f(0.0)) || any(input.vBiomeUV > vec2f(1.0))) { discard; }
    let normal = normalize(input.vNormal);
    let weights0 = textureSample(biomes0, biomes0Sampler, input.vBiomeUV);
    let weights1 = textureSample(biomes1, biomes1Sampler, input.vBiomeUV);
    let weights = array<f32, 8>(
        weights0.r, weights0.g, weights0.b, weights0.a,
        weights1.r, weights1.g, weights1.b, weights1.a
    );
    if (uniforms.hydrologyDebug > 6.5) {
        let road = textureSample(roadMask, roadMaskSampler, input.vBiomeUV).r;
        let terrain = vec3f(0.045, 0.052, 0.055);
        fragmentOutputs.color = vec4f(mix(terrain, vec3f(0.94, 0.62, 0.22), road), 1.0);
        return fragmentOutputs;
    }
    if (uniforms.hydrologyDebug > 5.5) {
        let shoreline = textureSample(shorelineMask, shorelineMaskSampler, input.vBiomeUV).r;
        let water = textureSample(lakeMask, lakeMaskSampler, input.vBiomeUV).r;
        let river = textureSample(riverMask, riverMaskSampler, input.vBiomeUV).r;
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
        let river = textureSample(riverMask, riverMaskSampler, input.vBiomeUV).r;
        let waterfall = textureSample(waterfallMask, waterfallMaskSampler, input.vBiomeUV).r;
        let dry = vec3f(0.045, 0.055, 0.06);
        let small = vec3f(0.10, 0.52, 0.72);
        let primary = vec3f(0.06, 0.72, 1.0);
        let water = mix(small, primary, smoothstep(0.72, 0.95, river));
        let riverColor = mix(dry, water, smoothstep(0.1, 0.55, river));
        fragmentOutputs.color = vec4f(mix(riverColor, vec3f(1.0, 0.72, 0.08), waterfall), 1.0);
        return fragmentOutputs;
    }
    if (uniforms.hydrologyDebug > 2.5) {
        let lake = textureSample(lakeMask, lakeMaskSampler, input.vBiomeUV).r;
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
        fragmentOutputs.color = vec4f(flowDirectionColor(textureSample(flowDirection, flowDirectionSampler, input.vBiomeUV).r), 1.0);
        return fragmentOutputs;
    }
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
    let shaded = baseColor * lighting + vec3f(specular);
    let distanceToCamera = distance(uniforms.cameraPosition, input.vWorld);
    let heightFog = exp(-max(input.vWorld.y, 0.0) * 0.0012);
    let fog = (1.0 - exp(-max(distanceToCamera - 480.0, 0.0) * 0.00072)) * heightFog;
    let fogColor = vec3f(0.22, 0.30, 0.33);
    fragmentOutputs.color = vec4f(mix(shaded, fogColor, clamp(fog, 0.0, 0.72)), 1.0);
}
