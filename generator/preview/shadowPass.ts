import { Constants } from '@babylonjs/core/Engines/constants';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Vector2, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { CLIPMAP_BASE_SPACING, CLIPMAP_GRID_HALF } from './clipmapMesh.ts';
import { DEFORMATION_MIN, DEFORMATION_RANGE, DEFORMATION_SIZE } from './localDeformation.ts';

const RESOLUTION = 1536;
const EXTENT = 520;
const _eye = new Vector3();
const _target = new Vector3();
const _snapped = new Vector3();
const _view = new Matrix();
// WebGPU uses a 0..1 NDC depth range. Passing halfZRange=true keeps the
// shadow caster and the comparison shader in that same coordinate system.
const _projection = Matrix.OrthoOffCenterLH(-EXTENT, EXTENT, -EXTENT, EXTENT, 1, 1_500, true);

/** One stable near-world directional shadow pass for generator material review. */
export class GeneratedTerrainShadow {
    public readonly texture: RenderTargetTexture;
    public readonly material: ShaderMaterial;
    public readonly matrix = new Matrix();
    public readonly sunDirection = new Vector3(-0.58, 0.52, 0.63).normalize();

    public constructor(
        scene: Scene,
        mesh: Mesh,
        heightTexture: BaseTexture,
        deformationTexture: BaseTexture,
        worldOrigin: Vector2,
        worldExtent: Vector2,
        heightResolution: number,
    ) {
        this.texture = new RenderTargetTexture('generated-terrain-shadow', { width: RESOLUTION, height: RESOLUTION }, scene, {
            generateMipMaps: false,
            generateDepthBuffer: true,
            type: Constants.TEXTURETYPE_FLOAT,
            format: Constants.TEXTUREFORMAT_RED,
            samplingMode: Constants.TEXTURE_NEAREST_SAMPLINGMODE,
        });
        this.texture.clearColor = new Color4(1, 1, 1, 1);
        this.texture.renderList = [mesh];
        scene.customRenderTargets.push(this.texture);
        this.material = new ShaderMaterial('generated-terrain-shadow-material', scene, 'generatedTerrainShadow', {
            shaderLanguage: ShaderLanguage.WGSL,
            attributes: ['position'],
            uniforms: ['lightViewProjection', 'lodCenter', 'baseSpacing', 'gridHalfN', 'worldOrigin', 'worldExtent', 'heightRes', 'deformCenter', 'deformSize', 'deformEnabled', 'deformMinimum', 'deformRange'],
            samplers: ['heightTex', 'deformTex'],
        });
        this.material.setTexture('heightTex', heightTexture);
        this.material.setTexture('deformTex', deformationTexture);
        this.material.setVector2('worldOrigin', worldOrigin);
        this.material.setVector2('worldExtent', worldExtent);
        this.material.setFloat('heightRes', heightResolution);
        this.material.setFloat('baseSpacing', CLIPMAP_BASE_SPACING);
        this.material.setFloat('gridHalfN', CLIPMAP_GRID_HALF);
        this.material.setVector2('deformCenter', Vector2.Zero());
        this.material.setFloat('deformSize', DEFORMATION_SIZE);
        this.material.setFloat('deformEnabled', 0);
        this.material.setFloat('deformMinimum', DEFORMATION_MIN);
        this.material.setFloat('deformRange', DEFORMATION_RANGE);
        this.texture.setMaterialForRendering(mesh, this.material);
    }

    public update(centerX: number, centerZ: number): void {
        const texelWorld = EXTENT * 2 / RESOLUTION;
        _snapped.set(
            Math.floor(centerX / texelWorld) * texelWorld,
            180,
            Math.floor(centerZ / texelWorld) * texelWorld,
        );
        _target.copyFrom(_snapped);
        _eye.copyFrom(_target).addInPlace(this.sunDirection.scale(700));
        Matrix.LookAtLHToRef(_eye, _target, Vector3.Up(), _view);
        _view.multiplyToRef(_projection, this.matrix);
        this.material.setMatrix('lightViewProjection', this.matrix);
        this.material.setVector2('lodCenter', new Vector2(centerX, centerZ));
    }

    public setDeformation(centerX: number, centerZ: number, enabled: boolean): void {
        this.material.setVector2('deformCenter', new Vector2(centerX, centerZ));
        this.material.setFloat('deformEnabled', enabled ? 1 : 0);
    }

    public static readonly resolution = RESOLUTION;
}
