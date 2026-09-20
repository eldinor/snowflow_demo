varying vUV: vec2f;

#include<generatedHeightSampling>

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
    let worldXZ = uniforms.worldOrigin + input.vUV * uniforms.worldExtent;
    let height = worldHeight(worldXZ);
    fragmentOutputs.color = vec4f(height, 0.0, 0.0, 1.0);
}
