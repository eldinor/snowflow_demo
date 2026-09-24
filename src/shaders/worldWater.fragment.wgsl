// Shade persistent lake and river surfaces using flow, ripples, sky and atmosphere; the depth variant supplies matching world depth.

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
    let direction=normalize(mix(uniforms.wind,input.vData.yz,uniforms.flowMode)+vec2f(1e-5,0.0));
    let side=vec2f(-direction.y,direction.x);
    let speed=mix(0.7,1.8+slope*5.0,uniforms.flowMode);
    let along=dot(p.xz,direction)-uniforms.waterTime*speed;
    let across=dot(p.xz,side);
    let wave=sin(along*2.4+sin(across*.8))*.07+sin(along*5.3-across*3.1)*.035;
    let V=normalize(uniforms.cameraPos-p);
    // Babylon WaterMaterial's strongest feature is its pair of independently
    // scrolling bump layers. Use derivative noise here instead of a tiled bump
    // texture: it gives the lake the same broken-up reflection without adding a
    // sampler or introducing a visible repeat across the large surface.
    let lakeFade=1.0-uniforms.flowMode;
    let lakeUV=vec2f(dot(p.xz,direction),dot(p.xz,side));
    let bumpA=noised(lakeUV*.18+vec2f(uniforms.waterTime*.055,-uniforms.waterTime*.027));
    let bumpB=noised(vec2f(lakeUV.y,-lakeUV.x)*.43+vec2f(-uniforms.waterTime*.083,uniforms.waterTime*.061));
    var lakeSlope=(direction*bumpA.y+side*bumpA.z)*(.18*.14)
        +(side*bumpB.y-direction*bumpB.z)*(.43*.045);

    // Interactive swimming rings are real normal waves rather than bright
    // circles painted over the lake. The Gaussian packet expands, fades and
    // supplies an analytic radial slope that bends sky reflection and glints.
    var rings=0.0;
    var rippleSlope=vec2f(0.0);
    for(var i=0;i<4;i++) {
        let ripple=uniforms.waterRipples[i];
        let age=uniforms.waterTime-ripple.z;
        let deltaVec=p.xz-ripple.xy;
        let radius=max(length(deltaVec),1e-4);
        let delta=radius-age*1.7;
        let alive=max(0.0,1.0-age/2.8)*step(0.0,age);
        let envelope=exp(-delta*delta*3.2);
        let phase=delta*9.0;
        let ring=envelope*(.5+.5*cos(phase))*ripple.w*alive;
        let heightSlope=envelope*(-6.4*delta*sin(phase)+9.0*cos(phase))*.026*ripple.w*alive;
        rippleSlope+=deltaVec/radius*heightSlope;
        rings+=ring;
    }
    lakeSlope+=rippleSlope;

    let riverSlope=vec2f(wave,cos(along*3.2+across*2.1)*.055);
    let surfaceSlope=mix(lakeSlope,riverSlope,uniforms.flowMode);
    var N=normalize(input.vNormal+vec3f(-surfaceSlope.x,0.0,-surfaceSlope.y));
    if(dot(N,V)<0.0){N=-N;}
    let NdotV=max(dot(N,V),0.0);
    let fresnel=.02+.98*pow(1.0-NdotV,5.0);
    // Calm lake reflections retain more detail; faster river water is rougher.
    let reflectionMip=mix(.35,1.15,uniforms.flowMode);
    let reflection=textureSampleLevel(skyLUT,skyLUTSampler,dirToLatLong(reflect(-V,N)),reflectionMip).rgb;
    let depth=input.vData.x;
    let tint=mix(vec3f(.065,.24,.23),vec3f(.012,.065,.105),1.0-exp(-depth*.45));
    let H=normalize(V+uniforms.sunDir);
    let sparkle=pow(max(dot(N,H),0.0),180.0)*max(dot(N,uniforms.sunDir),0.0)*2.0;
    let streak=pow(.5+.5*sin(across*4.0+sin(along*1.4)),5.0);
    let shore=(1.0-smoothstep(.02,.65,depth))*(.5+.5*sin(along*3.0+across));
    let foam=clamp(mix(shore*.32+rings*.12,streak*(.12+slope*.85),uniforms.flowMode),0.0,.9);
    let reflectionWeight=clamp(fresnel*mix(.96,.84,uniforms.flowMode),0.0,.96);
    var result=mix(tint,reflection,reflectionWeight)+uniforms.sunRadiance*sparkle*.12;
    result=mix(result,vec3f(.7,.84,.86),foam);
    result=applyAerial(result,uniforms.cameraPos,p,-V,uniforms.sunDir,skyLUT,skyLUTSampler,uniforms.sunRadiance,uniforms.fogDensity,uniforms.fogHeightFalloff,uniforms.fogStart,uniforms.aerialStrength);
    fragmentOutputs.color=vec4f(result,1.0);
#endif
}
