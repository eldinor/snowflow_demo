varying vNormal: vec3f;
varying vHeight: f32;
varying vWorld: vec3f;
uniform cameraPosition: vec3f;
uniform visualization: f32;
uniform lodKind: f32;
@fragment
fn main(input: FragmentInputs)->FragmentOutputs {
  let root=vec3f(.055,.16,.035);
  let tip=vec3f(.30,.46,.105);
  var color=mix(root,tip,smoothstep(0.0,1.0,input.vHeight));
  let variation=.88+.12*sin(dot(input.vWorld.xz,vec2f(4.17,7.31)));
  color*=variation;
  let sun=normalize(vec3f(-.45,1.0,-.28));
  let lighting=.34+.74*abs(dot(normalize(input.vNormal),sun));
  color*=lighting;
  if(uniforms.visualization>.5&&uniforms.visualization<1.5){color=select(vec3f(.2,.55,1.0),vec3f(1.0,.48,.08),uniforms.lodKind<.5);}
  if(uniforms.visualization>1.5&&uniforms.visualization<2.5){color=vec3f(.12,.8,.25);}
  if(uniforms.visualization>2.5){
    let cell=fract(input.vWorld.xz/16.0);
    let edge=1.0-step(.035,min(min(cell.x,1.0-cell.x),min(cell.y,1.0-cell.y)));
    color=mix(color,vec3f(1.0,.72,.08),edge);
  }
  let fog=1.0-exp(-distance(input.vWorld,uniforms.cameraPosition)*.007);
  fragmentOutputs.color=vec4f(pow(mix(color,vec3f(.36,.46,.50),fog),vec3f(1.0/2.2)),1.0);
}
