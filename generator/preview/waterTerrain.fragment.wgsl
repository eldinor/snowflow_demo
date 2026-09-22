varying vWorld: vec3f;
varying vNormal: vec3f;
varying vWaterMask: f32;
varying vWaterUV: vec2f;

uniform cameraPosition: vec3f;
uniform time: f32;
uniform waterOpacity: f32;
uniform lightDirection: vec3f;

var waterMask: texture_2d<f32>;
var waterMaskSampler: sampler;
var waterDepth: texture_2d<f32>;
var waterDepthSampler: sampler;

fn rippleSlope(worldXZ: vec2f, depth: f32) -> vec2f {
    let wind = normalize(vec2f(0.91, 0.41));
    let crossWind = vec2f(-wind.y, wind.x);
    let beachDamping = smoothstep(0.08, 1.8, depth);
    var slope = vec2f(0.0);
    let phase0 = dot(worldXZ, wind) * 1.72 + uniforms.time * 0.86;
    let phase1 = dot(worldXZ, normalize(wind + crossWind * 0.42)) * 3.41 + uniforms.time * 1.23 + 1.7;
    let phase2 = dot(worldXZ, normalize(wind - crossWind * 0.67)) * 6.83 + uniforms.time * 1.71 + 4.1;
    let phase3 = dot(worldXZ, normalize(wind + crossWind * 1.16)) * 12.7 + uniforms.time * 2.24 + 2.4;
    let footprint0 = max(abs(dpdx(phase0)), abs(dpdy(phase0)));
    let footprint1 = max(abs(dpdx(phase1)), abs(dpdy(phase1)));
    let footprint2 = max(abs(dpdx(phase2)), abs(dpdy(phase2)));
    let footprint3 = max(abs(dpdx(phase3)), abs(dpdy(phase3)));
    let fade0 = 1.0 - smoothstep(0.42, 1.05, footprint0);
    let fade1 = 1.0 - smoothstep(0.34, 0.92, footprint1);
    let fade2 = 1.0 - smoothstep(0.26, 0.76, footprint2);
    let fade3 = 1.0 - smoothstep(0.20, 0.62, footprint3);
    slope += wind * cos(phase0) * 0.070 * fade0;
    slope += normalize(wind + crossWind * 0.42) * cos(phase1) * 0.036 * fade1;
    slope += normalize(wind - crossWind * 0.67) * cos(phase2) * 0.016 * fade2;
    slope += normalize(wind + crossWind * 1.16) * cos(phase3) * 0.007 * fade3;
    return slope * beachDamping;
}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
    let water = textureSample(waterMask, waterMaskSampler, input.vWaterUV).r;
    if (water < 0.08) { discard; }
    let depth = max(textureSample(waterDepth, waterDepthSampler, input.vWaterUV).r, 0.0);
    let view = normalize(uniforms.cameraPosition - input.vWorld);
    let slopes = rippleSlope(input.vWorld.xz, depth);
    let normal = normalize(input.vNormal + vec3f(-slopes.x, 0.0, -slopes.y));
    let nDotV = clamp(dot(normal, view), 0.0, 1.0);
    let fresnel = 0.02 + 0.98 * pow(1.0 - nDotV, 5.0);
    let absorption = vec3f(0.23, 0.085, 0.045);
    let transmittance = exp(-absorption * depth);
    let shallow = vec3f(0.12, 0.43, 0.44);
    let deep = vec3f(0.012, 0.075, 0.12);
    let bodyColor = mix(deep, shallow, transmittance);
    let reflected = reflect(-view, normal);
    let horizon = pow(1.0 - abs(reflected.y), 1.35);
    let skyReflection = mix(vec3f(0.20, 0.38, 0.48), vec3f(0.54, 0.66, 0.70), clamp(reflected.y * 0.5 + 0.5, 0.0, 1.0));
    let reflection = mix(skyReflection, vec3f(0.38, 0.47, 0.50), horizon * 0.32);
    let halfVector = normalize(view + normalize(uniforms.lightDirection));
    let sunGlint = pow(max(dot(normal, halfVector), 0.0), 220.0) * 1.35;
    let lapPhase = input.vWorld.x * 0.52 + input.vWorld.z * 0.37 - uniforms.time * 0.9;
    let shoreBand = exp(-depth * 3.4) * smoothstep(0.12, 0.72, water);
    let foam = shoreBand * smoothstep(0.42, 0.78, sin(lapPhase) * 0.5 + 0.5);
    var color = mix(bodyColor, reflection, clamp(0.12 + fresnel * 0.82, 0.0, 0.94));
    color += vec3f(1.0, 0.88, 0.66) * sunGlint;
    color = mix(color, vec3f(0.72, 0.84, 0.82), foam * 0.72);
    let shoreAlpha = smoothstep(0.015, 0.48, depth);
    fragmentOutputs.color = vec4f(color, uniforms.waterOpacity * shoreAlpha * smoothstep(0.04, 0.22, water));
}
