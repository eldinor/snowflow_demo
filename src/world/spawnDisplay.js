/**
 * Bake the hierarchy, apply the requested scale, and ground the display's base.
 * @module world/spawnDisplay
 */

import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Vector2, Matrix } from '@babylonjs/core/Maths/math.vector';
import { DEFAULT_SPAWN } from './spawnPoints.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { VideoTexture } from '@babylonjs/core/Materials/Textures/videoTexture';
// Modular Babylon imports require the WebGPU upload extensions explicitly.
import '@babylonjs/core/Engines/WebGPU/Extensions/engine.dynamicTexture';
import '@babylonjs/core/Engines/WebGPU/Extensions/engine.videoTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';

/** Bake the hierarchy, apply the requested scale, and ground the display's base. */
export async function placeSpawnDisplay(scene,terrain,props,shadows,depthPass,options={}) {
    const {file='disp2-opt.glb',scale=.5,ahead=4,right=2.5,rotationY=0,groundClearance=0,videoFile=null,videoMesh='Cylinder',videoInvertY=false}=options;
    const container=await LoadAssetContainerAsync(`${import.meta.env.BASE_URL}assets/exalted/${file}`,scene);
    let videoTexture=null,videoMaterial=null,fallbackMaterial=null,videoObserver=null;
    let retryPlayback=null;
    if(videoFile) {
        if(!container.meshes.some(m=>m.name.toLowerCase()===videoMesh.toLowerCase()&&m.getTotalVertices())) {
            container.dispose();throw new Error(`${file} is missing ${videoMesh}`);
        }
        const video=document.createElement('video');
        video.muted=true;video.loop=true;video.autoplay=true;video.playsInline=true;video.preload='auto';
        video.src=`${import.meta.env.BASE_URL}assets/exalted/${videoFile}`;
        videoTexture=new VideoTexture('curved-display-video',video,scene,false,videoInvertY,Texture.BILINEAR_SAMPLINGMODE,{autoPlay:true,loop:true,muted:true});
        videoTexture.gammaSpace=true;
        // Correct the screen's authored V orientation independently of upload orientation.
        videoTexture.vScale=-1;
        videoTexture.vOffset=1;
        videoMaterial=new PBRMaterial('curved-display-screen',scene);
        videoMaterial.albedoColor=Color3.Black();
        videoMaterial.emissiveColor=Color3.White();videoMaterial.emissiveTexture=videoTexture;
        // The outdoor scene uses exposure 0.105; give the screen its own luminance.
        videoMaterial.emissiveIntensity=8;
        videoMaterial.roughness=1;videoMaterial.metallic=0;videoMaterial.backFaceCulling=false;
        videoMaterial.unlit=true;
        // Custom ShaderMaterials do not use PBR's video-texture update path.
        videoObserver=scene.onBeforeRenderObservable.add(()=>videoTexture.update());
        retryPlayback=()=>{if(video.paused)void video.play().catch(()=>{});};
        window.addEventListener('pointerdown',retryPlayback);
        window.addEventListener('keydown',retryPlayback);
        retryPlayback();
    }
    const parts=[];const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(const source of container.meshes) {
        if(!source.getTotalVertices())continue;
        const data=VertexData.ExtractFromMesh(source,true,true);
        data.transform(source.computeWorldMatrix(true));
        data.transform(Matrix.RotationY(rotationY));
        for(let i=0;i<data.positions.length;i++)data.positions[i]*=scale;
        if(!data.uvs)data.uvs=new Float32Array(data.positions.length/3*2);
        for(let i=0;i<data.positions.length;i++){min[i%3]=Math.min(min[i%3],data.positions[i]);max[i%3]=Math.max(max[i%3],data.positions[i]);}
        let material=source.material;
        if(file==='disp2-opt.glb' && material?.name==='Material.011') {
            // Screen lettering/buttons use emission only, without sun or spell highlights.
            material.unlit=true;
            material.emissiveIntensity=8;
        }
        if(videoMaterial&&source.name.toLowerCase()===videoMesh.toLowerCase())material=videoMaterial;
        if(!material) {
            fallbackMaterial??=new PBRMaterial('display-housing',scene);
            fallbackMaterial.albedoColor=new Color3(.06,.07,.08);
            fallbackMaterial.roughness=.65;fallbackMaterial.metallic=0;fallbackMaterial.backFaceCulling=false;
            material=fallbackMaterial;
        }
        parts.push({data,material,side:source.sideOrientation,name:source.name});
    }
    if(!parts.length)throw new Error(`${file} contains no geometry`);
    const yaw=DEFAULT_SPAWN.yaw;
    const x=-DEFAULT_SPAWN.x+Math.sin(yaw)*ahead+Math.cos(yaw)*right;
    const z=-DEFAULT_SPAWN.y+Math.cos(yaw)*ahead-Math.sin(yaw)*right;
    const dx=x-(min[0]+max[0])/2,dz=z-(min[2]+max[2])/2;
    let dy=-Infinity;
    // Lowest terrain-safe placement, including slope across the whole footprint.
    for(const {data} of parts)for(let i=0;i<data.positions.length;i+=3)
        dy=Math.max(dy,terrain.heightfield.heightAt(data.positions[i]+dx,data.positions[i+2]+dz)-data.positions[i+1]);
    dy+=groundClearance;
    const groups=new Map();
    for(const part of parts) {
        const p=part.data.positions;
        for(let i=0;i<p.length;i+=3){p[i]+=dx;p[i+1]+=dy;p[i+2]+=dz;}
        const existing=groups.get(part.material);
        if(existing)existing.data.merge(part.data,true);
        else groups.set(part.material,part);
    }
    const meshes=[];
    const size=max.map((v,i)=>v-min[i]);
    // Conservative cylinder shared by walking, flight and camera collision.
    const collider={name:`spawn:${file}`,kind:'terminal',x,z,
        radius:Math.hypot(size[0],size[2])*.5,minY:min[1]+dy,maxY:max[1]+dy};
    props.collisions.add(collider);
    for(const {data,material,side,name} of groups.values()) {
        const mesh=new Mesh(videoFile ? name : `spawn-display:${material.name}`,scene);data.applyToMesh(mesh);
        mesh.sideOrientation=side;mesh.renderingGroupId=1;
        mesh.metadata={source:file,spawn:'desert-start',video:material===videoMaterial?videoFile:null};
        const batch={mesh,sourceMaterial:material,distance:200,windEnabled:false,windBounds:new Vector2(0,1),instanced:false};
        mesh.material=props.makeMaterial(batch);props.materials.push(mesh.material);
        const shadowMats=Array.from({length:3},()=>props.makeMaterial(batch,'PROP_SHADOW'));
        shadows.registerCaster(mesh,i=>shadowMats[i]);
        depthPass.registerCaster(mesh,props.makeMaterial(batch,'PROP_PREPASS'));
        meshes.push(mesh);
    }
    for(const mesh of [...container.meshes])mesh.dispose(false,false);
    for(const node of [...container.transformNodes])node.dispose();
    container.meshes.length=container.transformNodes.length=0;
    scene.onDisposeObservable.addOnce(()=>{
        meshes.forEach(m=>m.dispose());container.dispose();
        if(videoObserver)scene.onBeforeRenderObservable.remove(videoObserver);
        if(retryPlayback){window.removeEventListener('pointerdown',retryPlayback);window.removeEventListener('keydown',retryPlayback);}
        if(videoTexture){videoTexture.video.pause();videoTexture.dispose();}
        videoMaterial?.dispose();fallbackMaterial?.dispose();
    });
    return {meshes,videoTexture,position:{x,y:min[1]+dy,z},size,collider,triangles:meshes.reduce((s,m)=>s+m.getTotalIndices()/3,0)};
}
