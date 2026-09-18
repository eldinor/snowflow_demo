varying vWorld: vec3f;
varying vNormal: vec3f;
varying vData: vec4f;
varying vViewZ: f32;
#ifndef WATER_PREPASS
#include<snowNoise>
#include<snowAtmosphere>
uniform cameraPos: vec3f;
uniform sunDir: vec3f;
uniform sunRadiance: vec3f;
uniform waterTime: f32;
uniform flowMode: f32;
uniform wind: vec2f;
uniform waterRipples: array<vec4f,4>;
uniform fogDensity: f32;
uniform fogHeightFalloff: f32;
uniform fogStart: f32;
uniform aerialStrength: f32;
var skyLUT: texture_2d<f32>;
var skyLUTSampler: sampler;
#endif
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
#ifdef WATER_PREPASS
    fragmentOutputs.color = vec4f(input.vViewZ,0.0,0.0,1.0);
#else
    let p=input.vWorld;
    let slope=input.vData.w;
    let direction=mix(uniforms.wind,input.vData.yz,uniforms.flowMode);
    let speed=mix(0.7,1.8+slope*5.0,uniforms.flowMode);
    let along=dot(p.xz,direction)-uniforms.waterTime*speed;
    let across=dot(p.xz,vec2f(-direction.y,direction.x));
    let wave=sin(along*2.4+sin(across*.8))*.07+sin(along*5.3-across*3.1)*.035;
    let V=normalize(uniforms.cameraPos-p);
    var N=normalize(input.vNormal+vec3f(wave,0.0,cos(along*3.2+across*2.1)*.055));
    if(dot(N,V)<0.0){N=-N;}
    let fresnel=.025+.975*pow(1.0-max(dot(N,V),0.0),5.0);
    let reflection=textureSampleLevel(skyLUT,skyLUTSampler,dirToLatLong(reflect(-V,N)),1.0).rgb;
    let depth=input.vData.x;
    let tint=mix(vec3f(.065,.24,.23),vec3f(.012,.065,.105),1.0-exp(-depth*.45));
    let H=normalize(V+uniforms.sunDir);
    let sparkle=pow(max(dot(N,H),0.0),180.0)*max(dot(N,uniforms.sunDir),0.0)*2.0;
    let streak=pow(.5+.5*sin(across*4.0+sin(along*1.4)),5.0);
    let shore=(1.0-smoothstep(.02,.65,depth))*(.5+.5*sin(along*3.0+across));
    var rings=0.0;
    for(var i=0;i<4;i++) {
        let ripple=uniforms.waterRipples[i];
        let age=uniforms.waterTime-ripple.z;
        let radius=distance(p.xz,ripple.xy);
        let ring=exp(-pow((radius-age*1.7)*5.0,2.0));
        rings+=ring*ripple.w*max(0.0,1.0-age/2.5)*step(0.0,age);
    }
    let foam=clamp(mix(shore*.4+rings*.5,streak*(.12+slope*.85),uniforms.flowMode),0.0,.9);
    var result=mix(tint,reflection,fresnel*.85)+uniforms.sunRadiance*sparkle*.12;
    result=mix(result,vec3f(.7,.84,.86),foam);
    result=applyAerial(result,uniforms.cameraPos,p,-V,uniforms.sunDir,skyLUT,skyLUTSampler,uniforms.sunRadiance,uniforms.fogDensity,uniforms.fogHeightFalloff,uniforms.fogStart,uniforms.aerialStrength);
    fragmentOutputs.color=vec4f(result,1.0);
#endif
}
