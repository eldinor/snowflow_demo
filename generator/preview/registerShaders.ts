import { ShaderStore } from '@babylonjs/core/Engines/shaderStore';
import vertex from './heightTerrain.vertex.wgsl?raw';
import fragment from './heightTerrain.fragment.wgsl?raw';
import sampling from './heightSampling.wgsl?raw';
import probe from './heightProbe.fragment.wgsl?raw';
import biomeProbe from './biomeProbe.fragment.wgsl?raw';
import waterVertex from './waterTerrain.vertex.wgsl?raw';
import waterFragment from './waterTerrain.fragment.wgsl?raw';

/** Registers the generator-only GPU terrain material without touching runtime shaders. */
export function registerGeneratedTerrainShaders(): void {
    ShaderStore.IncludesShadersStoreWGSL.generatedHeightSampling = sampling;
    ShaderStore.ShadersStoreWGSL.generatedHeightTerrainVertexShader = vertex;
    ShaderStore.ShadersStoreWGSL.generatedHeightTerrainPixelShader = fragment;
    ShaderStore.ShadersStoreWGSL.generatedHeightProbePixelShader = probe;
    ShaderStore.ShadersStoreWGSL.generatedBiomeProbePixelShader = biomeProbe;
    ShaderStore.ShadersStoreWGSL.generatedWaterTerrainVertexShader = waterVertex;
    ShaderStore.ShadersStoreWGSL.generatedWaterTerrainPixelShader = waterFragment;
}
