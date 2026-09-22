attribute position: vec3f;
attribute normal: vec3f;
#ifdef INSTANCES
attribute world0: vec4f;
attribute world1: vec4f;
attribute world2: vec4f;
attribute world3: vec4f;
#endif
uniform world: mat4x4f;
uniform viewProjection: mat4x4f;
uniform time: f32;
uniform wind: vec2f;
uniform cameraPosition: vec3f;
uniform interactionEnabled: f32;
varying vNormal: vec3f;
varying vHeight: f32;
varying vWorld: vec3f;
@vertex
fn main(input: VertexInputs)->FragmentInputs {
#ifdef INSTANCES
  let model=uniforms.world*mat4x4f(input.world0,input.world1,input.world2,input.world3);
#else
  let model=uniforms.world;
#endif
  let root=model[3].xyz;
  let h=clamp(input.position.y,0.0,1.0);
  let phase=dot(root.xz,vec2f(.371,.613));
  let gust=.62+.25*sin(uniforms.time*.73+phase*.045)+.13*sin(uniforms.time*1.91+phase*.17);
  var bend=vec2f(.78,.32)*uniforms.wind.x*gust*h*h;
  if(uniforms.interactionEnabled>.5) {
    let delta=root.xz-uniforms.cameraPosition.xz;
    let distanceToCamera=length(delta);
    let influence=1.0-smoothstep(.25,2.4,distanceToCamera);
    bend+=select(vec2f(0.0),normalize(delta)*influence*.55,distanceToCamera>.001)*h*h;
  }
  var worldPosition=model*vec4f(input.position,1.0);
  worldPosition.x+=bend.x;
  worldPosition.z+=bend.y;
  vertexOutputs.vNormal=normalize((model*vec4f(input.normal,0.0)).xyz);
  vertexOutputs.vHeight=h;
  vertexOutputs.vWorld=worldPosition.xyz;
  vertexOutputs.position=uniforms.viewProjection*worldPosition;
}
