varying vUV: vec2f;

uniform biomeMap: f32;

var biomes0: texture_2d<f32>;
var biomes0Sampler: sampler;
var biomes1: texture_2d<f32>;
var biomes1Sampler: sampler;

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
    if (uniforms.biomeMap < 0.5) {
        fragmentOutputs.color = textureSampleLevel(biomes0, biomes0Sampler, input.vUV, 0.0);
    } else {
        fragmentOutputs.color = textureSampleLevel(biomes1, biomes1Sampler, input.vUV, 0.0);
    }
}
