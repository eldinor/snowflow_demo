// Bake local displacement for asynchronous CPU grounding. This returns an offset, not the authored absolute terrain elevation.

#include<exaltedSurface>
#include<surfaceMap>
varying vUV: vec2f;
uniform probeOrigin: vec2f;
uniform probeSize: f32;
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
    let world = uniforms.probeOrigin + input.vUV * uniforms.probeSize;
    let height = deformHeight(deformTex, deformTexSampler, world, uniforms.deformCenter, uniforms.deformSize, uniforms.deformDepthScale, 0.125)
        * localFade(world, uniforms.patchCenter);
    fragmentOutputs.color = vec4f(height, 0.0, 0.0, 1.0);
}
