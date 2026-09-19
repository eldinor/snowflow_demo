/**
 * DOM-independent forest rendering, wind, nearby shadows and collision data.
 * @module forest/ForestSystem
 */

import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders/glTF';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Matrix,Quaternion,Vector3,Vector4 } from '@babylonjs/core/Maths/math.vector';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Camera } from '@babylonjs/core/Cameras/camera';
import { Constants } from '@babylonjs/core/Engines/constants';
import { Frustum } from '@babylonjs/core/Maths/math.frustum';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import { PropCollisions } from '../world/propCollisions.ts';
import { DEFAULTS,groupPlacements,lodFor,retained } from './chunks.js';
import { reduceFoliage } from './foliageLod.js';
import { attachBatchGeometry } from './batchGeometry.js';
import { SHADOW_RESOLUTION,SUN_OFFSET,snappedShadowTarget } from './shadowProjection.js';
import vertex from './forest.vertex.wgsl?raw';
import fragment from './forest.fragment.wgsl?raw';

/** Reusable forest renderer. No DOM, input handlers or dependency on main-page settings. */
export class ForestSystem {
    /**
     * Create scene-owned shadow resources; call load before update. The caller retains camera, movement and terrain ownership.
     * @param scene - Babylon scene using the left-handed world convention.
     * @param options - Asset base URL, optional heightAt(x,z) in metres and initial forest settings.
     */
    constructor(scene,{heightAt,assetBase=`${import.meta.env.BASE_URL}assets/forest-demo/`,options={}}={}) {
        Object.assign(this,{scene,heightAt,assetBase});this.options={...DEFAULTS,...options};
        this.prototypes=[];this.materials=[];this.batches=[];this.textures=[];this.time=0;this.lastUpdate=-Infinity;
        this.lastPosition=new Vector3(Infinity,0,Infinity);this.force=true;this.collisions=new PropCollisions(16);
        this.stats={};this.alignment=[];this.shadowList=[];
        ShaderStore.ShadersStoreWGSL.forestVertexShader=vertex;ShaderStore.ShadersStoreWGSL.forestPixelShader=fragment;
        this.white=RawTexture.CreateRGBATexture(new Uint8Array([255,255,255,255]),1,1,scene,false,false);
        this.shadowCamera=new FreeCamera('forest-shadow-camera',new Vector3(),scene);
        this.shadowCamera.mode=Camera.ORTHOGRAPHIC_CAMERA;this.shadowCamera.minZ=.1;this.shadowCamera.maxZ=450;
        this.shadowMap=new RenderTargetTexture('forest-near-shadows',SHADOW_RESOLUTION,scene,false,true,Constants.TEXTURETYPE_FLOAT,false,Constants.TEXTURE_NEAREST_SAMPLINGMODE);
        this.shadowMap.activeCamera=this.shadowCamera;this.shadowMap.clearColor=new Color4(1,1,1,1);
        this.shadowMap.renderParticles=false;this.shadowMap.renderSprites=false;this.shadowMap.renderList=[];
        scene.customRenderTargets.push(this.shadowMap);
    }
    /**
     * Create matching beauty/shadow shader variants. Shape encodes local base height, height span, bend and flutter; grayscale foliage is tinted once before card baking.
     */
    material(source,shape,defines=[]) {
        const mat=new ShaderMaterial(`forest:${source.name||'surface'}:${defines.join()}`,this.scene,'forest',{
            shaderLanguage:ShaderLanguage.WGSL,attributes:['position','normal','uv',...(defines.includes('GROUND')?['color']:[])],
            defines:defines.map(d=>`#define ${d}`),uniforms:['world','viewProjection','shadowMatrix','cameraPos','wind','windShape','baseColor','cutoff','gammaDecode','shadowEnabled','shadowTexel','fogDensity'],samplers:['baseTex','shadowTex']});
        mat.backFaceCulling=false;mat.setTexture('baseTex',source.albedoTexture||this.white);
        const c=source.albedoColor||{r:1,g:1,b:1};
        // The supplied spruce needles are grayscale. Tint in linear colour space;
        // impostors inherit this during baking and must not receive it twice.
        const spruce=/Spruce_Tree_Branch/.test(source.name||'');
        const bush=/Bush_Leaves/.test(source.name||'');
        const grass=/UNS_Grass/.test(source.name||'');
        mat.setVector4('baseColor',new Vector4(c.r*(spruce?.055:bush?.10:grass?.11:1),c.g*(spruce?.16:bush?.23:grass?.25:1),c.b*(spruce?.085:bush?.065:grass?.072:1),source.alpha??1));
        mat.setFloat('cutoff',source.albedoTexture?.hasAlpha ? (source.alphaCutOff??.5) : 0);
        mat.setFloat('gammaDecode',source.albedoTexture?.gammaSpace&&!source.albedoTexture?._texture?._useSRGBBuffer?1:0);
        mat.setVector4('windShape',shape);mat.setVector4('wind',new Vector4());mat.setMatrix('shadowMatrix',Matrix.Identity());
        mat.setVector3('cameraPos',Vector3.Zero());mat.setFloat('fogDensity',0);mat.setFloat('shadowEnabled',0);mat.setFloat('shadowTexel',1/SHADOW_RESOLUTION);
        mat.setTexture('shadowTex',defines.includes('SHADOW_PASS')?this.white:this.shadowMap);this.materials.push(mat);return mat;
    }
    /**
     * Load prototypes and placements, prepare reduced geometry/cards, then allocate independent chunk bindings and trunk colliders.
     * @param onProgress - Optional status callback during preparation.
     * @returns {Promise<void>} Resolves when update can select live batches.
     * @remarks Call once per renderer. Asset length mismatch and unrecognized prototypes fail explicitly.
     */
    async load(onProgress=()=>{}) {
        const start=performance.now();
        const [manifestResponse,placementResponse]=await Promise.all([fetch(`${this.assetBase}manifest.json`),fetch(`${this.assetBase}placements.bin`)]);
        if(!manifestResponse.ok||!placementResponse.ok)throw Error('Forest assets missing; run npm run prepare:forest');
        const manifest=await manifestResponse.json(),records=new Float32Array(await placementResponse.arrayBuffer());
        if(records.length!==manifest.count*11)throw Error('Forest placement length mismatch');
        this.chunks=groupPlacements(records);this.manifest=manifest;
        await MeshoptSimplifier.ready;
        this.container=await LoadAssetContainerAsync(`${this.assetBase}prototypes.glb`,this.scene);
        const models=manifest.models.map(m=>({...m,parts:[],min:new Vector3(Infinity,Infinity,Infinity),max:new Vector3(-Infinity,-Infinity,-Infinity)}));
        for(const source of this.container.meshes) {
            if(!source.getTotalVertices())continue;
            let node=source,match;while(node&&!(match=/prototype-(\d+)/.exec(node.name)))node=node.parent;
            if(!match)throw Error(`Unidentified forest prototype ${source.name}`);
            const model=models[Number(match[1])],data=VertexData.ExtractFromMesh(source,true,true);
            data.transform(source.computeWorldMatrix(true));
            for(let i=0;i<data.positions.length;i+=3){model.min.minimizeInPlace(Vector3.FromArray(data.positions,i));model.max.maximizeInPlace(Vector3.FromArray(data.positions,i));}
            const original=new Mesh(`prototype:${model.id}:${model.parts.length}`,this.scene);data.applyToMesh(original);original.setEnabled(false);
            model.parts.push({data,source:source.material,original});
        }
        this.models=models;
        for(const model of models) {
            onProgress(`Preparing ${model.kind} geometry`);
            for(const part of model.parts) {
                const woody=/Color_Palette/.test(part.source.name),height=model.max.y-model.min.y;
                const shape=new Vector4(model.min.y,height,model.kind==='tree'?(woody?.007:.025):.08,woody?0:1);
                part.beauty=this.material(part.source,shape);part.shadow=this.material(part.source,shape,['SHADOW_PASS']);
                part.original.material=part.beauty;
                const [indices,error]=woody?MeshoptSimplifier.simplify(new Uint32Array(part.data.indices),new Float32Array(part.data.positions),3,
                    Math.max(12,Math.floor(part.data.indices.length*.18/3)*3),.025,['Prune']):[reduceFoliage(part.data.indices,part.data.positions.length/3),0];
                part.error=error;
                const reduced=new Mesh(`${part.original.name}:reduced`,this.scene);const data=new VertexData();
                data.positions=part.data.positions;data.normals=part.data.normals;data.uvs=part.data.uvs;data.indices=indices;data.applyToMesh(reduced);reduced.setEnabled(false);
                part.reduced=reduced;
            }
            if(model.kind==='tree')await this.bakeImpostor(model);
        }
        for(const chunk of this.chunks) {
            chunk.byType=new Map();
            for(const record of chunk.records) {
                const model=models[record.type];
                record.authoredY=record.y;
                record.groundDelta=this.heightAt?this.heightAt(record.x,record.z)-(record.y+model.min.y*record.scale[1]):0;
                if(this.heightAt)this.alignment.push(-record.groundDelta);
                if(this.options.grounded)record.y+=record.groundDelta;
                record.matrix=Matrix.Compose(Vector3.FromArray(record.scale),Quaternion.FromArray(record.rotation),new Vector3(record.x,record.y,record.z));
                if(!chunk.byType.has(record.type))chunk.byType.set(record.type,[]);chunk.byType.get(record.type).push(record);
                if(model.kind==='tree') {
                    // The lowest 1.5 m of opaque wood determines trunk width, not foliage bounds.
                    const wood=model.parts.find(p=>/Color_Palette/.test(p.source.name));
                    if(!model.trunkRadius) {
                        let r=.1;const p=wood?.data.positions||[];
                        for(let i=0;i<p.length;i+=3)if(p[i+1]<model.min.y+Math.min(1.5,(model.max.y-model.min.y)*.12))r=Math.max(r,Math.hypot(p[i],p[i+2]));
                        model.trunkRadius=r;
                    }
                    record.collider={name:`forest-tree-${record.id}`,kind:'trunk',x:record.x,z:record.z,
                        radius:model.trunkRadius*Math.max(record.scale[0],record.scale[2]),minY:record.y+model.min.y*record.scale[1],maxY:record.y+model.max.y*record.scale[1]};
                    this.collisions.add(record.collider);
                }
            }
            for(const [type,plants] of chunk.byType) {
                const model=models[type];
                for(let lod=0;lod<(model.kind==='tree'?3:2);lod++) {
                    const sources=lod===2?[model.impostor]:model.parts;
                    for(const part of sources) {
                        const template=lod===1?part.reduced:part.original;
                        const mesh=new Mesh(`forest:${chunk.key}:${type}:${lod}:${this.batches.length}`,this.scene);
                        attachBatchGeometry(template,mesh);mesh.material=part.beauty;mesh.isPickable=false;
                        const matrices=new Float32Array(plants.length*16);plants.forEach((p,i)=>matrices.set(p.matrix.m,i*16));
                        mesh.thinInstanceSetBuffer('matrix',matrices,16,false);mesh.thinInstanceRefreshBoundingInfo(true);
                        mesh.doNotSyncBoundingInfo=true;mesh.setEnabled(false);
                        this.batches.push({chunk,model,lod,plants,mesh,matrices,shadow:part.shadow});
                        if(part.shadow)this.shadowMap.setMaterialForRendering(mesh,part.shadow);
                    }
                }
            }
        }
        this.alignment.sort((a,b)=>a-b);
        this.stats.loadMs=performance.now()-start;this.stats.authoredPlants=manifest.count;this.stats.chunks=this.chunks.length;
        this.stats.grounding={median:this.alignment[Math.floor(this.alignment.length/2)]||0,min:this.alignment[0]||0,max:this.alignment.at(-1)||0,
            over20cm:this.alignment.filter(v=>Math.abs(v)>.2).length};
    }
    /**
     * Render a tree prototype into a transparent atlas for crossed distant cards. Matching the render-target V orientation prevents upside-down trees.
     * @param model - Prepared prototype whose full-detail parts supply the baked image.
     */
    async bakeImpostor(model) {
        const scene=this.scene,engine=scene.getEngine(),height=model.max.y-model.min.y;
        const width=Math.max(model.max.x-model.min.x,model.max.z-model.min.z)*1.12;
        const camera=new FreeCamera('impostor-bake-camera',new Vector3(0,(model.min.y+model.max.y)/2,-width*3),scene);
        camera.setTarget(new Vector3(0,camera.position.y,0));camera.mode=Camera.ORTHOGRAPHIC_CAMERA;camera.minZ=.01;camera.maxZ=width*8;
        camera.orthoLeft=-width/2;camera.orthoRight=width/2;camera.orthoBottom=-height*.55;camera.orthoTop=height*.55;
        const texture=new RenderTargetTexture(`tree-${model.id}-impostor`,512,scene,false,true);
        texture.activeCamera=camera;texture.clearColor=new Color4(0,0,0,0);texture.renderList=model.parts.map(p=>p.original);
        texture.renderParticles=false;texture.renderSprites=false;texture.hasAlpha=true;texture.gammaSpace=true;
        for(const p of model.parts){p.original.setEnabled(true);p.beauty.setVector3('cameraPos',camera.position);await p.beauty.forceCompilationAsync(p.original);}
        engine.beginFrame();texture.render();engine.endFrame();
        model.parts.forEach(p=>p.original.setEnabled(false));camera.dispose();texture.activeCamera=null;texture.renderList=[];this.textures.push(texture);
        const mesh=new Mesh(`tree-${model.id}-cards`,scene),data=new VertexData();
        const y0=model.min.y-height*.05,y1=model.max.y+height*.05,w=width/2;
        data.positions=[-w,y0,0,w,y0,0,w,y1,0,-w,y1,0,0,y0,-w,0,y0,w,0,y1,w,0,y1,-w];
        data.normals=[0,0,-1,0,0,-1,0,0,-1,0,0,-1,1,0,0,1,0,0,1,0,0,1,0,0];
        // Babylon's WebGPU render target is already Y-flipped during rendering.
        // Its bottom is V=0; imported-image UV orientation would invert the tree.
        data.uvs=[0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1];data.indices=[0,1,2,0,2,3,4,5,6,4,6,7];data.applyToMesh(mesh);mesh.setEnabled(false);
        const source={name:`tree-${model.id}-impostor`,albedoTexture:texture,alphaCutOff:.35};
        model.impostor={original:mesh,beauty:this.material(source,new Vector4(model.min.y,height,.005,0),['IMPOSTOR'])};
    }
    /**
     * Create the benchmark-only vertex-colour ground shader. Main-world integration should keep its existing ground material.
     */
    createGroundMaterial(){return this.material({name:'ground'},new Vector4(),['GROUND']);}
    /**
     * Apply partial settings and invalidate batch selection. Grounding changes also move trunk colliders and refresh chunk bounds; density changes affect rendering only.
     */
    configure(values){
        const wasGrounded=this.options.grounded;
        Object.assign(this.options,values);this.force=true;
        if(this.models&&wasGrounded!==this.options.grounded){
            for(const chunk of this.chunks)for(const p of chunk.records){
                const oldY=p.y;p.y=p.authoredY+(this.options.grounded?p.groundDelta:0);
                p.matrix.setTranslationFromFloats(p.x,p.y,p.z);
                if(p.collider){p.collider.minY+=p.y-oldY;p.collider.maxY+=p.y-oldY;}
            }
            for(const b of this.batches){
                b.plants.forEach((p,i)=>b.matrices.set(p.matrix.m,i*16));
                b.mesh.thinInstanceCount=b.plants.length;
                b.mesh.thinInstanceRefreshBoundingInfo(true);
            }
        }
    }
    /**
     * Select LOD instances after camera travel, update world-aligned shadows and GPU wind, and publish visibility statistics.
     * @param camera - Active Babylon camera; its position controls distance selection.
     * @param {number} dt - Simulation seconds, not milliseconds.
     * @remarks Call before scene.render(). Primitive-instance statistics count wood and foliage separately.
     */
    update(camera,dt) {
        const begin=performance.now(),o=this.options;if(!o.freeze)this.time+=dt*o.windSpeed;
        const position=camera.position;
        if(this.force||(Vector3.DistanceSquared(position,this.lastPosition)>1&&performance.now()-this.lastUpdate>100)) {
            this.force=false;this.lastPosition.copyFrom(position);this.lastUpdate=performance.now();this.shadowList.length=0;
            let selected=0,triangles=0,near=0,medium=0,far=0;
            for(const b of this.batches) {
                let count=0;
                for(const p of b.plants) {
                    const distance=Math.hypot(p.x-position.x,p.z-position.z);
                    if(!retained(p.id,o.density)||lodFor(b.model.kind,distance,o)!==b.lod)continue;
                    b.matrices.set(p.matrix.m,count++*16);
                }
                b.mesh.thinInstanceCount=count;b.mesh.setEnabled(count>0);
                if(count)b.mesh.thinInstanceBufferUpdated('matrix');
                selected+=count;triangles+=count*b.mesh.getTotalIndices()/3;
                if(b.lod===0)near+=count;else if(b.lod===1)medium+=count;else far+=count;
                if(o.shadows&&count&&b.shadow&&b.model.kind!=='grass'&&Math.hypot(b.chunk.x-position.x,b.chunk.z-position.z)<o.shadowDistance+23)this.shadowList.push(b.mesh);
            }
            this.shadowMap.renderList=this.shadowList;
            this.shadowMap.refreshRate=o.shadows?1:0;
            Object.assign(this.stats,{selectedPrimitiveInstances:selected,selectedTriangles:triangles,near,medium,far,shadowBatches:this.shadowList.length});
        }
        const radius=o.shadowDistance+24;
        const shadowTarget=snappedShadowTarget(position,radius);
        this.shadowCamera.position.copyFrom(shadowTarget).addInPlace(SUN_OFFSET);
        this.shadowCamera.setTarget(shadowTarget);
        this.shadowCamera.orthoLeft=this.shadowCamera.orthoBottom=-radius;this.shadowCamera.orthoRight=this.shadowCamera.orthoTop=radius;
        const lightMatrix=this.shadowCamera.getViewMatrix().multiply(this.shadowCamera.getProjectionMatrix(true));
        const wind=new Vector4(Math.sin(o.windDirection*Math.PI/180),Math.cos(o.windDirection*Math.PI/180),this.time,o.windStrength);
        for(const mat of this.materials){mat.setVector4('wind',wind);mat.setVector3('cameraPos',position);mat.setMatrix('shadowMatrix',lightMatrix);mat.setFloat('shadowEnabled',o.shadows?1:0);mat.setFloat('fogDensity',.002);}
        const planes=Frustum.GetPlanes(camera.getTransformationMatrix());let visible=0,draws=0,triangles=0;
        for(const b of this.batches)if(b.mesh.isEnabled()&&b.mesh.isInFrustum(planes)){draws++;visible+=b.mesh.thinInstanceCount;triangles+=b.mesh.thinInstanceCount*b.mesh.getTotalIndices()/3;}
        Object.assign(this.stats,{visiblePrimitiveInstances:visible,visibleTriangles:triangles,visibleBatches:draws,cpuUpdateMs:performance.now()-begin});
    }
    /**
     * Release owned meshes, materials, atlases, shadow target and imported prototypes. Caller-owned terrain and camera are retained.
     */
    dispose() {
        const targets=this.scene.customRenderTargets,index=targets.indexOf(this.shadowMap);if(index>=0)targets.splice(index,1);
        this.shadowMap.dispose();this.shadowCamera.dispose();this.batches.forEach(b=>b.mesh.dispose());
        this.models?.forEach(m=>{m.parts.forEach(p=>{p.original.dispose();p.reduced.dispose();});m.impostor?.original.dispose();});
        this.materials.forEach(m=>m.dispose());this.textures.forEach(t=>t.dispose());this.white.dispose();this.container?.dispose();
    }
}
