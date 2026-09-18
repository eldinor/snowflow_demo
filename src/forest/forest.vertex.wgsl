attribute position: vec3f;
attribute normal: vec3f;
attribute uv: vec2f;
#ifdef GROUND
attribute color: vec4f;
#endif
#ifdef INSTANCES
attribute world0: vec4f;
attribute world1: vec4f;
attribute world2: vec4f;
attribute world3: vec4f;
#endif
uniform world: mat4x4f;
uniform viewProjection: mat4x4f;
uniform shadowMatrix: mat4x4f;
uniform wind: vec4f;
uniform windShape: vec4f;
uniform cameraPos: vec3f;
varying vWorld: vec3f;
varying vNormal: vec3f;
varying vUV: vec2f;
varying vTint: vec3f;
varying vShadow: vec4f;
@vertex
fn main(input: VertexInputs)->FragmentInputs {
#ifdef INSTANCES
    let model=uniforms.world*mat4x4f(input.world0,input.world1,input.world2,input.world3);
#else
    let model=uniforms.world;
#endif
    var p=model*vec4f(input.position,1.0);
    let height=max(uniforms.windShape.y,.01);
    let h=clamp((input.position.y-uniforms.windShape.x)/height,0.0,1.0);
    let fade=1.0-smoothstep(45.0,110.0,distance(model[3].xz,uniforms.cameraPos.xz));
    let phase=dot(model[3].xz,vec2f(.37,.73));
    let sway=.5+.3*sin(uniforms.wind.z*1.5+phase)+.2*sin(uniforms.wind.z*.6+phase*.08);
    let flutter=sin(uniforms.wind.z*7.0+phase+input.position.x*3.0)*.08*uniforms.windShape.w;
    let amplitude=uniforms.wind.w*uniforms.windShape.z*fade*min(height*length(model[1].xyz),5.0);
    p=vec4f(p.xyz+vec3f(uniforms.wind.x,0.0,uniforms.wind.y)*amplitude*(sway*h*h+flutter*h*h*h),1.0);
    vertexOutputs.vWorld=p.xyz;
    vertexOutputs.vNormal=normalize(mat3x3f(model[0].xyz/dot(model[0].xyz,model[0].xyz),model[1].xyz/dot(model[1].xyz,model[1].xyz),model[2].xyz/dot(model[2].xyz,model[2].xyz))*input.normal);
    vertexOutputs.vUV=input.uv;
#ifdef GROUND
    vertexOutputs.vTint=input.color.rgb;
#else
    vertexOutputs.vTint=vec3f(1.0);
#endif
    vertexOutputs.vShadow=uniforms.shadowMatrix*p;
    vertexOutputs.position=uniforms.viewProjection*p;
}
