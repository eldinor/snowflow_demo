uniform useDesertTextures: f32;
uniform desertU: vec3f;
uniform desertV: vec3f;
uniform desertBaseMatrix: mat4x4f;
uniform desertColor: vec3f;
uniform desertGamma: f32;
var desertBaseTex: texture_2d<f32>;
var desertBaseTexSampler: sampler;

fn desertSoilColor(world: vec2f, mip: f32) -> vec3f {
    let uv=vec2f(dot(vec3f(world,1.0),uniforms.desertU),dot(vec3f(world,1.0),uniforms.desertV));
    let mapped=(uniforms.desertBaseMatrix*vec4f(uv,1.0,0.0)).xy;
    let base=textureSampleLevel(desertBaseTex,desertBaseTexSampler,mapped,mip).rgb;
    let linear=select(base/12.92,pow((base+vec3f(0.055))/1.055,vec3f(2.4)),base>vec3f(0.04045));
    return mix(base,linear,uniforms.desertGamma)*uniforms.desertColor;
}
