varying vWorld: vec3f;
varying vNormal: vec3f;
varying vUV: vec2f;
varying vTint: vec3f;
varying vShadow: vec4f;
var baseTex: texture_2d<f32>;
var baseTexSampler: sampler;
uniform baseColor: vec4f;
uniform cutoff: f32;
uniform gammaDecode: f32;
#ifndef SHADOW_PASS
var shadowTex: texture_2d<f32>;
var shadowTexSampler: sampler;
uniform shadowEnabled: f32;
uniform shadowTexel: f32;
uniform cameraPos: vec3f;
uniform fogDensity: f32;
#endif
@fragment
fn main(input: FragmentInputs)->FragmentOutputs {
    let tex=textureSample(baseTex,baseTexSampler,input.vUV);
    if(tex.a*uniforms.baseColor.a<uniforms.cutoff){discard;}
#ifdef SHADOW_PASS
    fragmentOutputs.color=vec4f(input.position.z,0.0,0.0,1.0);
#else
    let albedo=pow(max(tex.rgb,vec3f(0.0)),vec3f(mix(1.0,2.2,uniforms.gammaDecode)))*uniforms.baseColor.rgb*input.vTint;
    let N=normalize(input.vNormal);
    let sun=normalize(vec3f(-.5,1.0,-.35));
    var shade=1.0;
    let q=input.vShadow.xyz/input.vShadow.w;
    // Babylon flips render-target clip Y itself. Match that orientation here.
    let uv=q.xy*.5+vec2f(.5);
    if(uniforms.shadowEnabled>.5&&all(uv>vec2f(.001))&&all(uv<vec2f(.999))&&q.z>0.0&&q.z<1.0) {
        var total=0.0;
        let pixel=uv/uniforms.shadowTexel-vec2f(.5);
        let corner=floor(pixel);
        let blend=fract(pixel);
        for(var x=0;x<2;x++){for(var y=0;y<2;y++){
            let sampleUV=(corner+vec2f(f32(x),f32(y))+vec2f(.5))*uniforms.shadowTexel;
            let sampleDepth=textureSampleLevel(shadowTex,shadowTexSampler,sampleUV,0.0).r;
            let weight=select(1.0-blend.x,blend.x,x==1)*select(1.0-blend.y,blend.y,y==1);
            total+=select(.32,1.0,q.z-.0015<=sampleDepth)*weight;
        }}
        let edge=min(min(uv.x,1.0-uv.x),min(uv.y,1.0-uv.y));
        shade=mix(1.0,total,smoothstep(.001,.03,edge));
    }
    let diffuse=.28+.9*abs(dot(N,sun))*shade;
#ifdef IMPOSTOR
    let lit=albedo;
#else
    let lit=albedo*vec3f(1.04,1.02,.94)*diffuse;
#endif
    let fog=1.0-exp(-distance(input.vWorld,uniforms.cameraPos)*uniforms.fogDensity);
    // This isolated benchmark has no HDR post chain: output display-encoded colour.
    fragmentOutputs.color=vec4f(pow(max(mix(lit,vec3f(.38,.49,.56),fog),vec3f(0.0)),vec3f(1.0/2.2)),1.0);
#endif
}
