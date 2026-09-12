#include<snowNoise>
varying vWorld: vec3f;
varying vNormal: vec3f;
varying vUV: vec2f;
varying vViewZ: f32;
var baseTex: texture_2d<f32>;
var baseTexSampler: sampler;
uniform baseColor: vec4f;
uniform alphaCutoff: f32;
uniform gammaDecode: f32;
uniform cameraPos: vec3f;
uniform cullCenter: vec2f;
uniform cullDistance: f32;
#ifndef PROP_SHADOW
#ifndef PROP_PREPASS
#include<snowShading>
#include<snowAtmosphere>
#include<snowSpellLights>
var normalTex: texture_2d<f32>;
var normalTexSampler: sampler;
var roughTex: texture_2d<f32>;
var roughTexSampler: sampler;
var skyLUT: texture_2d<f32>;
var skyLUTSampler: sampler;
var cascade0: texture_2d<f32>;
var cascade0Sampler: sampler;
var cascade1: texture_2d<f32>;
var cascade1Sampler: sampler;
var cascade2: texture_2d<f32>;
var cascade2Sampler: sampler;
uniform sunDir: vec3f;
uniform sunRadiance: vec3f;
uniform shR: array<vec4f, 9>;
uniform cascadeMatrices: array<mat4x4f, 3>;
uniform cascadeSplits: vec4f;
uniform cascadeParams: array<vec4f, 3>;
uniform shadowTexel: f32;
uniform shadowSoftness: f32;
uniform shadowBias: f32;
uniform ambientIntensity: f32;
uniform fogDensity: f32;
uniform fogHeightFalloff: f32;
uniform fogStart: f32;
uniform aerialStrength: f32;
uniform roughness: f32;
uniform normalStrength: f32;
uniform spellLightPos: array<vec4f, 4>;
uniform spellLightCol: array<vec4f, 4>;
uniform spellLightCount: f32;
#include<snowShadowLookup>
#endif
#endif
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
    let du = dpdx(input.vUV); let dv = dpdy(input.vUV);
    let dx = dpdx(input.vWorld); let dy = dpdy(input.vWorld);
    let texel = textureSampleGrad(baseTex, baseTexSampler, input.vUV, du, dv);
    // Stable world-space stippling avoids sorted transparent instance batches.
    let noise = fract(sin(dot(floor(input.vWorld * 180.0), vec3f(12.9898,78.233,39.425))) * 43758.5453);
    let fade = 1.0 - smoothstep(uniforms.cullDistance * 0.8, uniforms.cullDistance, distance(input.vWorld.xz, uniforms.cullCenter));
    if (texel.a * uniforms.baseColor.a < uniforms.alphaCutoff || fade < noise) { discard; }
#ifdef PROP_SHADOW
    fragmentOutputs.color = vec4f(fragmentInputs.position.z, 0.0, 0.0, 1.0);
#else
#ifdef PROP_PREPASS
    fragmentOutputs.color = vec4f(input.vViewZ, 0.0, 0.0, 1.0);
#else
    let albedo = pow(max(texel.rgb, vec3f(0.0)), vec3f(mix(1.0, 2.2, uniforms.gammaDecode))) * uniforms.baseColor.rgb;
    let V = normalize(uniforms.cameraPos - input.vWorld);
    var N = normalize(input.vNormal);
    if (dot(N, V) < 0.0) { N = -N; }
    let geoN = N;
    let T = cross(dy, N) * du.x + cross(N, dx) * dv.x;
    let B = cross(dy, N) * du.y + cross(N, dx) * dv.y;
    let inv = inverseSqrt(max(max(dot(T,T), dot(B,B)), 1e-12));
    let bump = textureSampleGrad(normalTex, normalTexSampler, input.vUV, du, dv).xyz * 2.0 - 1.0;
    N = normalize(N * max(bump.z, 0.1) + (T * bump.x - B * bump.y) * inv * uniforms.normalStrength);
    let rough = clamp(textureSampleGrad(roughTex, roughTexSampler, input.vUV, du, dv).g * uniforms.roughness, 0.25, 1.0);
    let L = uniforms.sunDir; let H = normalize(L + V);
    let nl = max(dot(N,L), 0.0); let nv = max(dot(N,V), 0.001);
    let spec = distributionGGX(max(dot(N,H),0.0), rough) * visSmithGGXCorrelated(nv,nl,rough) * fresnelSchlick(max(dot(V,H),0.0), vec3f(0.04));
    let shadow = sunShadow(input.vWorld, geoN, distance(input.vWorld, uniforms.cameraPos), noise * 6.283185);
    var color = (albedo / PI * nl + spec * nl) * uniforms.sunRadiance * shadow;
    color += albedo / PI * shIrradiance(N, uniforms.shR) * uniforms.ambientIntensity;
    color += spellLightingSurface(input.vWorld, N, V, albedo, vec3f(0.04), rough, 0.0, uniforms.spellLightPos, uniforms.spellLightCol, uniforms.spellLightCount);
    color = applyAerial(color, uniforms.cameraPos, input.vWorld, -V, L, skyLUT, skyLUTSampler, uniforms.sunRadiance, uniforms.fogDensity, uniforms.fogHeightFalloff, uniforms.fogStart, uniforms.aerialStrength);
    fragmentOutputs.color = vec4f(color, 1.0);
#endif
#endif
}
