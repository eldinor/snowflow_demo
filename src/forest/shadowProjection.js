import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';

export const SHADOW_RESOLUTION=1024;
export const SUN_OFFSET=new Vector3(-100,200,-70);
const forward=SUN_OFFSET.scale(-1).normalize();
const right=Vector3.Cross(Vector3.Up(),forward).normalize();
const up=Vector3.Cross(forward,right).normalize();

/** Align the orthographic light volume with a fixed world-space texel grid. */
export function snappedShadowTarget(position,radius,resolution=SHADOW_RESOLUTION){
    const step=2*radius/resolution;
    const snap=axis=>Math.round(Vector3.Dot(position,axis)/step)*step;
    return right.scale(snap(right)).addInPlace(up.scale(snap(up))).addInPlace(forward.scale(snap(forward)));
}
