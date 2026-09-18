/**
 * Shared ground texture bindings keep displaced sand and airborne dust consistent.
 * @module terrain/desertAppearance
 */

import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';

export const DESERT_EFFECT_UNIFORMS = ['useDesertTextures','desertU','desertV','desertBaseMatrix','desertColor','desertGamma'];

/** Reuse the ground's colour source for displaced soil and airborne dust. */
export function bindDesertAppearance(material, terrain) {
    const ground=terrain.desertGround;
    material.setTexture('desertBaseTex',ground?.base || terrain.heightfield.heightTex);
    material.setVector3('desertU',ground ? Vector3.FromArray(ground.uv.u) : Vector3.Zero());
    material.setVector3('desertV',ground ? Vector3.FromArray(ground.uv.v) : Vector3.Zero());
    material.setMatrix('desertBaseMatrix',ground?.base.getTextureMatrix() || Matrix.Identity());
    material.setColor3('desertColor',ground?.color || Color3.White());
    material.setFloat('desertGamma',ground?.base.gammaSpace && !ground.base._texture?._useSRGBBuffer ? 1 : 0);
    material.setFloat('useDesertTextures',terrain.exalted && terrain.useDesertTextures ? 1 : 0);
}
