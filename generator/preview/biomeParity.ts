import { Constants } from '@babylonjs/core/Engines/constants';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import type { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { ProceduralTexture } from '@babylonjs/core/Materials/Textures/Procedurals/proceduralTexture';
import type { Scene } from '@babylonjs/core/scene';
import { BIOME_NAMES } from '../config/biomes.ts';
import type { BiomeField } from '../package/biomeField.ts';

export interface BiomeParityResult {
    readonly samples: number;
    readonly maximumError: number;
    readonly meanError: number;
}

function whenReady(texture: ProceduralTexture): Promise<void> {
    return new Promise((resolve, reject) => {
        const started = performance.now();
        const poll = (): void => {
            try {
                if (texture.isReady()) {
                    resolve();
                    return;
                }
            } catch (error) {
                reject(error);
                return;
            }
            if (performance.now() - started > 25_000) {
                reject(new Error('GPU biome parity shader did not become ready within 25 seconds.'));
                return;
            }
            requestAnimationFrame(poll);
        };
        poll();
    });
}

/** Compares hardware-filtered GPU biome weights with CPU bilinear sampling. */
export async function runBiomeParityProbe(
    scene: Scene,
    texture0: RawTexture,
    texture1: RawTexture,
    field: BiomeField,
): Promise<BiomeParityResult> {
    const resolution = 16;
    const probe = new ProceduralTexture(
        'generated-biome-parity',
        { width: resolution, height: resolution },
        'generatedBiomeProbe',
        scene,
        {
            generateMipMaps: false,
            type: Constants.TEXTURETYPE_FLOAT,
            format: Constants.TEXTUREFORMAT_RGBA,
            samplingMode: Constants.TEXTURE_NEAREST_SAMPLINGMODE,
            shaderLanguage: ShaderLanguage.WGSL,
            skipSceneRegistration: true,
        },
    );
    probe.refreshRate = 0;
    probe.setTexture('biomes0', texture0);
    probe.setTexture('biomes1', texture1);
    await whenReady(probe);
    const maps: Float32Array[] = [];
    for (let mapIndex = 0; mapIndex < 2; mapIndex++) {
        probe.setFloat('biomeMap', mapIndex);
        probe.render();
        const raw = await probe.readPixels(0, 0);
        if (!(raw instanceof Float32Array)) {
            probe.dispose();
            throw new Error(`GPU biome parity expected Float32Array, received ${raw?.constructor.name ?? 'null'}.`);
        }
        maps.push(new Float32Array(raw));
    }
    probe.dispose();
    let maximumError = 0;
    let errorSum = 0;
    let comparisons = 0;
    for (let zIndex = 0; zIndex < resolution; zIndex++) {
        const z = field.metadata.origin[1]
            + ((zIndex + 0.5) / resolution) * field.metadata.extent[1];
        for (let xIndex = 0; xIndex < resolution; xIndex++) {
            const x = field.metadata.origin[0]
                + ((xIndex + 0.5) / resolution) * field.metadata.extent[0];
            const cpu = field.sample(x, z);
            const pixel = (zIndex * resolution + xIndex) * 4;
            for (let channel = 0; channel < 8; channel++) {
                const gpu = maps[channel < 4 ? 0 : 1][pixel + channel % 4];
                const error = Math.abs(cpu[BIOME_NAMES[channel]] - gpu);
                maximumError = Math.max(maximumError, error);
                errorSum += error;
                comparisons++;
            }
        }
    }
    return {
        samples: resolution * resolution,
        maximumError,
        meanError: errorSum / comparisons,
    };
}
