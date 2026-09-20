@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
    fragmentOutputs.color = vec4f(input.position.z, 0.0, 0.0, 1.0);
}
