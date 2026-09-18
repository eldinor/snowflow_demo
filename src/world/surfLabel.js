/**
 * World-space MSDF instructions render after the world group, skipping intermediate passes.
 * @module world/surfLabel
 */

import { FontAsset } from '@babylonjs/addons/msdfText/fontAsset';
import { TextRenderer } from '@babylonjs/addons/msdfText/textRenderer';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Matrix } from '@babylonjs/core/Maths/math.vector';
import { Color4 } from '@babylonjs/core/Maths/math.color';

/**
 * Load the MSDF font and anchor luminous instructions above terrain near the display. Render only in the main world group; scene disposal removes the observer and owned resources.
 * @param scene - Scene owning the label and its rendering observer.
 * @param display - Placed display with a world position.
 * @param terrain - Grounding provider exposing heightAt(x,z).
 * @returns {Promise<object>} Renderer and anchor for inspection or later positioning.
 */
export async function createSurfLabel(scene,display,terrain) {
    const base=`${import.meta.env.BASE_URL}assets/fonts/`;
    const response=await fetch(`${base}roboto-regular.json`);
    if(!response.ok)throw new Error(`MSDF font load failed: ${response.status}`);
    const font=new FontAsset(await response.text(),`${base}roboto-regular.png`,scene);
    const renderer=await TextRenderer.CreateTextRendererAsync(font,scene.getEngine());
    const anchor=new TransformNode('surf-instruction-anchor',scene);
    anchor.position.set(display.position.x,terrain.heightAt(display.position.x,display.position.z)+.45,display.position.z);
    anchor.computeWorldMatrix(true);
    renderer.parent=anchor;
    renderer.isBillboard=true;
    renderer.ignoreDepthBuffer=false;
    renderer.writeToDepthBuffer=true;
    renderer.transformMatrix=Matrix.Scaling(.24,.24,.24);
    // HDR scene exposure is 0.105, so use a luminous white label.
    renderer.color=new Color4(8,8,8,1);
    renderer.strokeColor=new Color4(.025,.04,.055,1);
    renderer.strokeOutsetWidth=.16;
    renderer.addParagraph('Hold down RIGHT mouse button to SURF!',{textAlign:'center',lineHeight:1.15,letterSpacing:0});
    const observer=scene.onAfterRenderingGroupObservable.add(info=>{
        if(info.renderingGroupId!==1||scene._isInIntermediateRendering())return;
        const camera=scene.activeCamera;if(!camera)return;
        if(Math.hypot(camera.position.x-anchor.position.x,camera.position.y-anchor.position.y,camera.position.z-anchor.position.z)>65)return;
        renderer.render(camera.getViewMatrix(),camera.getProjectionMatrix());
    });
    scene.onDisposeObservable.addOnce(()=>{
        scene.onAfterRenderingGroupObservable.remove(observer);
        renderer.dispose();font.dispose();anchor.dispose();
    });
    return {renderer,anchor};
}
