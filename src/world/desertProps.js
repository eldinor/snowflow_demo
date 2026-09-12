import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import '@babylonjs/core/Meshes/instancedMesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Matrix, Vector2, Vector3, Vector4 } from '@babylonjs/core/Maths/math.vector';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { S } from '../core/settings.js';
import { bindMatrixArray, whenReady } from '../core/gpuUtil.js';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import { PropCollisions, solidPropKind } from './propCollisions.js';

/** Authored placements, compacted into shared geometry/material instance batches. */
export class DesertProps {
    constructor(scene, terrain, sky, shadows, depthPass) {
        Object.assign(this, { scene, terrain, sky, shadows, depthPass });
        this.batches = []; this.materials = []; this.passes = [];
        this.collisions = new PropCollisions();
        terrain.obstacles = this.collisions;
        this.center = new Vector2(-65, 604);
        this.last = new Vector2(Infinity, Infinity);
        this.splits = new Vector4(); this.triangles = 0; this.visibleInstances = 0;
        this.windTime = 0;
        this.wind = new Vector4();
        this.white = RawTexture.CreateRGBATexture(new Uint8Array([255,255,255,255]),1,1,scene,false,false);
        this.flat = RawTexture.CreateRGBATexture(new Uint8Array([128,128,255,255]),1,1,scene,false,false);
    }
    async load() {
        const started = performance.now();
        await MeshoptSimplifier.ready;
        const container = await LoadAssetContainerAsync(`${import.meta.env.BASE_URL}assets/exalted/exalted_desert.glb`, this.scene);
        this.container = container;
        const ground=container.meshes.find(m=>m.name==='Ground');
        if(!ground) throw new Error('Desert GLB ground material is missing');
        this.terrain.setDesertGround(ground);
        const root = container.meshes.find(m => m.name === '__root__');
        if (!root) throw new Error('Desert GLB has no loader root');
        const rootMatrix = root.computeWorldMatrix(true).clone(), inverseRoot = Matrix.Invert(rootMatrix);
        const groups = new Map(), seats = [], point = new Vector3(), lowest = new Vector3();
        let transformError = 0;
        for (const node of container.meshes) {
            if (!node.getTotalVertices() || node.name === 'Ground') continue;
            const source = node.sourceMesh || node;
            if (!source.geometry || !source.material) continue;
            const key = `${source.geometry.uniqueId}:${source.material.uniqueId}`;
            let batch = groups.get(key);
            if (!batch) {
                const data = VertexData.ExtractFromMesh(source, true, true);
                data.transform(rootMatrix);
                if (!data.uvs) data.uvs = new Float32Array(data.positions.length / 3 * 2);
                const mesh = new Mesh(`desert:${source.material.name}:${groups.size}`, this.scene);
                data.applyToMesh(mesh);
                mesh.sideOrientation = source.sideOrientation;
                mesh.renderingGroupId = 1; mesh.isPickable = false;
                mesh.alwaysSelectAsActiveMesh = true;
                // Distance is based on object size, so small stones do not survive to the horizon.
                const size = source.getBoundingInfo().boundingBox.extendSize.length() * 2;
                batch = { mesh, sourceMaterial: source.material, matrices: [], centers: [], names: [], data,
                    distance: 40, size, count: 0 };
                groups.set(key, batch);
            }
            const authored = node.computeWorldMatrix(true).clone();
            const instance = inverseRoot.multiply(authored);
            batch.matrices.push(...instance.m);
            const bound = source.getBoundingInfo().boundingBox;
            Vector3.TransformCoordinatesToRef(bound.center, authored, point);
            batch.centers.push(point.x, point.z);
            batch.names.push(node.name);
            const scale = new Vector3(); authored.decompose(scale);
            const diameter = batch.size * Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
            batch.distance = Math.max(batch.distance, Math.min(220, 35 + diameter * 24));
            // Check the actual transformed vertex chain, not just position metadata.
            const original = source.getVerticesData('position');
            const kind = solidPropKind(source.material.name);
            if (kind) {
                const vertices = [];
                let bottom=Infinity, top=-Infinity;
                for (let v=0;v<original.length;v+=3) {
                    Vector3.TransformCoordinatesFromFloatsToRef(original[v],original[v+1],original[v+2],authored,point);
                    vertices.push(point.x,point.y,point.z);
                    bottom=Math.min(bottom,point.y); top=Math.max(top,point.y);
                }
                let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
                // Only the lower trunk defines width; leaves and crowns stay passable.
                const cutoff=kind==='trunk' ? bottom+Math.min(1.8,(top-bottom)*.2) : top;
                for (let v=0;v<vertices.length;v+=3) {
                    if (vertices[v+1]>cutoff) continue;
                    minX=Math.min(minX,vertices[v]); maxX=Math.max(maxX,vertices[v]);
                    minZ=Math.min(minZ,vertices[v+2]); maxZ=Math.max(maxZ,vertices[v+2]);
                }
                const x=(minX+maxX)/2,z=(minZ+maxZ)/2;
                const radius=Math.max(maxX-minX,maxZ-minZ)*.5;
                const ground=this.terrain.heightfield.heightAt(x,z);
                if (kind==='trunk' || (radius>=.4 && top-ground>=.35)) {
                    this.collisions.add({name:node.name,kind,x,z,radius:Math.max(.12,radius),minY:bottom,
                        maxY:kind==='trunk' ? Math.min(top,Math.max(ground+2.2,bottom+(top-bottom)*.55)) : top});
                }
                // Restore the centre used by the existing placement audit.
                Vector3.TransformCoordinatesToRef(bound.center,authored,point);
            }
            const originalPoint = Vector3.TransformCoordinates(Vector3.FromArray(original), authored);
            const instancedPoint = Vector3.TransformCoordinates(Vector3.FromArray(batch.data.positions), instance);
            transformError = Math.max(transformError, Vector3.Distance(originalPoint, instancedPoint));
            if (Math.hypot(point.x + 65, point.z - 604) < 55) {
                lowest.set(0, Infinity, 0);
                for (let v = 0; v < original.length; v += 3) {
                    Vector3.TransformCoordinatesFromFloatsToRef(original[v], original[v+1], original[v+2], authored, point);
                    if (point.y < lowest.y) lowest.copyFrom(point);
                }
                const ground = this.terrain.heightfield.heightAt(lowest.x, lowest.z);
                seats.push({ name: node.name, x: lowest.x, z: lowest.z, lowestY: lowest.y, groundY: ground, clearance: lowest.y - ground });
            }
        }
        for (const batch of groups.values()) {
            const name = batch.sourceMaterial.name;
            batch.windEnabled = /didelta|leipoldtia|iceplant/.test(name);
            const bounds = batch.mesh.getBoundingInfo().boundingBox;
            batch.windBounds = new Vector2(bounds.minimum.y, Math.max(.01, bounds.maximum.y - bounds.minimum.y));
            if (/sand_rocks_small|namaqualand_stones/.test(name)) batch.distance = 35;
            else if (/didelta|leipoldtia|iceplant/.test(name)) batch.distance = 60;
            else batch.distance = Math.min(180, batch.distance);
            batch.all = new Float32Array(batch.matrices); delete batch.matrices;
            batch.centers = new Float32Array(batch.centers);
            batch.visible = new Float32Array(batch.all.length);
            batch.visible.set(batch.all);
            batch.mesh.thinInstanceSetBuffer('matrix', batch.visible, 16, false);
            batch.mesh.thinInstanceCount = batch.names.length;
            batch.mesh.doNotSyncBoundingInfo = true;
            batch.mesh.material = this.makeMaterial(batch);
            this.materials.push(batch.mesh.material);
            const shadowMats = Array.from({length:3},()=>this.makeMaterial(batch, 'PROP_SHADOW'));
            const prepass = this.makeMaterial(batch, 'PROP_PREPASS');
            this.shadows.registerCaster(batch.mesh, i => shadowMats[i]);
            this.depthPass.registerCaster(batch.mesh, prepass);
            const [indices, error] = MeshoptSimplifier.simplify(new Uint32Array(batch.data.indices),
                new Float32Array(batch.data.positions), 3, Math.max(12,Math.floor(batch.data.indices.length*.15/3)*3), .025, ['Prune']);
            batch.lodError = error;
            const far = new Mesh(`${batch.mesh.name}:distant`, this.scene);
            const data = new VertexData();
            data.positions = batch.data.positions; data.normals = batch.data.normals; data.uvs = batch.data.uvs; data.indices = indices;
            data.applyToMesh(far);
            far.sideOrientation = batch.mesh.sideOrientation; far.material = batch.mesh.material;
            far.renderingGroupId = 1; far.isPickable = false; far.alwaysSelectAsActiveMesh = true;
            batch.far = far; batch.farVisible = new Float32Array(batch.all.length);
            batch.farVisible.set(batch.all);
            far.thinInstanceSetBuffer('matrix',batch.farVisible,16,false);
            far.doNotSyncBoundingInfo = true;
            this.shadows.registerCaster(far, i => shadowMats[i]);
            this.depthPass.registerCaster(far,prepass);
            this.batches.push(batch);
        }
        // Retain textures/material provenance; imported nodes and their geometry are no longer needed.
        for (const mesh of [...container.meshes]) mesh.dispose(false, false);
        for (const node of [...container.transformNodes]) node.dispose();
        container.meshes.length = 0; container.transformNodes.length = 0;
        this.audit = { loadMs: performance.now() - started, batches: this.batches.length,
            primitiveInstances: this.batches.reduce((n,b) => n+b.names.length,0), transformError,
            nearby: seats.length, floatingOver20cm: seats.filter(s => s.clearance > .2).length,
            buriedOver50cm: seats.filter(s => s.clearance < -.5).length,
            seats: seats.sort((a,b) => b.clearance-a.clearance) };
    }
    makeMaterial(batch, pass) {
        const source = batch.sourceMaterial;
        const mat = new ShaderMaterial(`desert:${pass || 'beauty'}:${source.name}`, this.scene, 'desertProp', {
            shaderLanguage: ShaderLanguage.WGSL,
            attributes: ['position','normal','uv'],
            defines: [...(pass ? [`#define ${pass}`] : []), ...(batch.windEnabled ? ['#define PROP_WIND'] : [])],
            uniforms: ['world','viewProjection','lightViewProjection','uvMatrix','baseColor','alphaCutoff','gammaDecode','roughness','normalStrength',
                'cameraPos','cullCenter','cullDistance','sunDir','sunRadiance','shR','cascadeMatrices','cascadeSplits','cascadeParams','shadowTexel','shadowSoftness','shadowBias',
                'ambientIntensity','fogDensity','fogHeightFalloff','fogStart','aerialStrength','spellLightPos','spellLightCol','spellLightCount',
                'propWind','windTime','windBounds'],
            samplers: ['baseTex','normalTex','roughTex','skyLUT','cascade0','cascade1','cascade2'],
        });
        mat.backFaceCulling = source.backFaceCulling;
        mat.setTexture('baseTex', source.albedoTexture || this.white);
        mat.setTexture('normalTex', source.bumpTexture || this.flat);
        mat.setTexture('roughTex', source.metallicTexture || this.white);
        mat.setMatrix('uvMatrix', source.albedoTexture?.getTextureMatrix() || Matrix.Identity());
        const color = source.albedoColor;
        mat.setVector4('baseColor', new Vector4(color.r,color.g,color.b,source.alpha));
        mat.setFloat('alphaCutoff', source.needAlphaBlending() || source.needAlphaTesting() ? (source.alphaCutOff || .5) : 0);
        mat.setFloat('gammaDecode', source.albedoTexture?.gammaSpace && !source.albedoTexture?._texture?._useSRGBBuffer ? 1 : 0);
        mat.setFloat('roughness', source.roughness ?? 1);
        mat.setFloat('normalStrength', source.bumpTexture ? (source.bumpTexture.level ?? 1) : 0);
        mat.setFloat('cullDistance', batch.distance);
        mat.setFloat('spellLightCount', 0);
        mat.setVector4('propWind', this.wind);
        mat.setFloat('windTime', this.windTime);
        mat.setVector2('windBounds', batch.windBounds);
        mat.setTexture('skyLUT', this.sky.lut);
        for (let i=0;i<3;i++) mat.setTexture(`cascade${i}`,this.shadows.maps[i]);
        this.passes.push({ mat, mesh: batch.mesh, pass });
        return mat;
    }
    update(camera, focus, force = false, dt = 0) {
        this.windTime += dt * S.bushWindSpeed;
        const angle = S.windDirection * Math.PI / 180;
        this.wind.set(Math.sin(angle), Math.cos(angle), S.windStrength * S.bushWindStrength, 0);
        this.center.set(focus.x, focus.z);
        if (force || Math.hypot(focus.x-this.last.x,focus.z-this.last.y) > 3) {
            this.last.copyFrom(this.center); this.triangles = 0; this.visibleInstances = 0;
            for (const b of this.batches) {
                let count = 0, farCount = 0;
                for (let i=0;i<b.names.length;i++) {
                    const distance = Math.hypot(b.centers[i*2]-focus.x,b.centers[i*2+1]-focus.z);
                    if (distance > b.distance+6) continue;
                    if (distance < (b.distance > 100 ? 30 : 16)) b.visible.set(b.all.subarray(i*16,i*16+16),count++*16);
                    else b.farVisible.set(b.all.subarray(i*16,i*16+16),farCount++*16);
                }
                b.mesh.thinInstanceCount = count;
                if (count) b.mesh.thinInstanceBufferUpdated('matrix');
                b.mesh.setEnabled(count > 0);
                b.far.thinInstanceCount = farCount;
                if (farCount) b.far.thinInstanceBufferUpdated('matrix');
                b.far.setEnabled(farCount > 0); b.count = count + farCount; b.nearCount = count; b.farCount = farCount;
                this.visibleInstances += count + farCount;
                this.triangles += (count * b.mesh.getTotalIndices() + farCount * b.far.getTotalIndices())/3;
            }
        }
        this.splits.set(...this.shadows.splits);
        for (const { mat, pass } of this.passes) {
            mat.setVector3('cameraPos',camera); mat.setVector2('cullCenter',this.center);
            mat.setVector4('propWind', this.wind); mat.setFloat('windTime', this.windTime);
            if (pass) continue;
            mat.setVector3('sunDir',this.sky.sunDir); mat.setColor3('sunRadiance',this.sky.sunRadiance);
            mat.setArray4('shR',this.sky.sh); bindMatrixArray(mat,'cascadeMatrices',this.shadows.matrixData);
            mat.setVector4('cascadeSplits',this.splits); mat.setArray4('cascadeParams',this.shadows.paramData);
            mat.setFloat('shadowTexel',this.shadows.texelSize); mat.setFloat('shadowSoftness',1.8); mat.setFloat('shadowBias',.01);
            mat.setFloat('ambientIntensity',S.ambientIntensity); mat.setFloat('fogDensity',S.fogDensity);
            mat.setFloat('fogHeightFalloff',S.fogHeightFalloff); mat.setFloat('fogStart',S.fogStart); mat.setFloat('aerialStrength',S.aerialStrength);
        }
    }
    async warmUp() {
        for (const { mat, mesh } of this.passes) await whenReady(mat,mat.name,[mesh,true]);
    }
    dispose() {
        for (const b of this.batches) { b.mesh.dispose(); b.far.dispose(); }
        for (const p of this.passes) p.mat.dispose();
        this.container?.dispose(); this.white.dispose(); this.flat.dispose();
    }
}
