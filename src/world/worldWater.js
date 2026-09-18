import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore';
import { Vector2 } from '@babylonjs/core/Maths/math.vector';
import { S } from '../core/settings.js';
import { whenReady } from '../core/gpuUtil.js';
import { buildWaterGeometry } from './waterGeometry.js';
import reference from './waterReference.json';
import { WaterSurface, waterfallEmitters } from './waterSurface.js';
import vertex from '../shaders/worldWater.vertex.wgsl?raw';
import fragment from '../shaders/worldWater.fragment.wgsl?raw';

/** Persistent water, separate from spell water and terrain grounding. */
export class WorldWater {
    constructor(scene,terrain,sky,depthPass) {
        this.sky=sky;this.time=0;this.wind=new Vector2();this.meshes=[];this.materials=[];
        this.ripples=new Float32Array(16);this.rippleIndex=0;
        for(let i=0;i<4;i++)this.ripples[i*4+2]=-100;
        ShaderStore.ShadersStoreWGSL.worldWaterVertexShader=vertex;
        ShaderStore.ShadersStoreWGSL.worldWaterPixelShader=fragment;
        const geometry=buildWaterGeometry(terrain.heightfield.data,reference,0);
        this.level=geometry.level;
        this.surface=new WaterSurface(geometry.lake,this.level);
        this.emitters=waterfallEmitters(geometry.river);
        terrain.water=this;
        this.triangles=0;
        for(const [name,flow] of [['lake',0],['river',1]]) {
            const data=geometry[name];if(!data.indices.length)continue;
            const mesh=new Mesh(`world-water:${name}`,scene);
            const vd=new VertexData();Object.assign(vd,data);vd.applyToMesh(mesh);
            mesh.isPickable=false;mesh.renderingGroupId=1;mesh.hasVertexAlpha=false;
            mesh.material=this.makeMaterial(scene,flow);
            const depth=this.makeMaterial(scene,flow,true);
            depthPass.registerCaster(mesh,depth);
            this.meshes.push(mesh);this.materials.push(mesh.material);
            this.triangles+=data.indices.length/3;
        }
        scene.onDisposeObservable.addOnce(()=>this.dispose());
    }
    sample(x,z){return this.surface.sample(x,z);}
    ripple(x,z,strength){this.ripples.set([x,z,this.time,strength],this.rippleIndex*4);this.rippleIndex=(this.rippleIndex+1)%4;}
    makeMaterial(scene,flow,depth=false) {
        const mat=new ShaderMaterial(`world-water:${depth?'depth':flow?'river':'lake'}`,scene,'worldWater',{
            shaderLanguage:ShaderLanguage.WGSL,attributes:['position','normal','color'],
            defines:depth?['#define WATER_PREPASS']:[],
            uniforms:['viewProjection','cameraPos','sunDir','sunRadiance','waterTime','flowMode','wind','waterRipples','fogDensity','fogHeightFalloff','fogStart','aerialStrength'],
            samplers:['skyLUT'],
        });
        mat.backFaceCulling=false;
        mat.setFloat('flowMode',flow);mat.setFloat('waterTime',0);mat.setVector2('wind',this.wind);
        mat.setTexture('skyLUT',this.sky.lut);
        mat.setArray4('waterRipples',this.ripples);
        return mat;
    }
    update(dt,camera) {
        this.time+=dt;
        const angle=S.windDirection*Math.PI/180;this.wind.set(Math.sin(angle),Math.cos(angle));
        for(const mat of this.materials) {
            mat.setFloat('waterTime',this.time);mat.setVector2('wind',this.wind);
            mat.setArray4('waterRipples',this.ripples);
            mat.setVector3('cameraPos',camera);mat.setVector3('sunDir',this.sky.sunDir);mat.setColor3('sunRadiance',this.sky.sunRadiance);
            for(const name of ['fogDensity','fogHeightFalloff','fogStart','aerialStrength'])mat.setFloat(name,S[name]);
        }
    }
    async warmUp() {for(let i=0;i<this.meshes.length;i++)await whenReady(this.materials[i],this.materials[i].name,[this.meshes[i],false]);}
    dispose(){this.meshes.forEach(m=>m.dispose());this.materials.forEach(m=>m.dispose());}
}
