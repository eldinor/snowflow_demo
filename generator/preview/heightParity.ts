import { Constants } from '@babylonjs/core/Engines/constants';
import { Vector2 } from '@babylonjs/core/Maths/math.vector';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import type { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { ProceduralTexture } from '@babylonjs/core/Materials/Textures/Procedurals/proceduralTexture';
import type { Scene } from '@babylonjs/core/scene';
import type { HeightField } from '../package/heightField.ts';

export interface HeightParityResult {
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
                reject(new Error('GPU height parity shader did not become ready within 25 seconds.'));
                return;
            }
            requestAnimationFrame(poll);
        };
        poll();
    });
}

/** Render fixed height probes on the GPU and compare their readback with CPU sampling. */
export async function runHeightParityProbe(
    scene: Scene,
    heightTexture: RawTexture,
    field: HeightField,
): Promise<HeightParityResult> {
    const resolution = 16;
    const probe = new ProceduralTexture(
        'generated-height-parity',
        { width: resolution, height: resolution },
        'generatedHeightProbe',
        scene,
        {
            generateMipMaps: false,
            type: Constants.TEXTURETYPE_FLOAT,
            format: Constants.TEXTUREFORMAT_R,
            samplingMode: Constants.TEXTURE_NEAREST_SAMPLINGMODE,
            shaderLanguage: ShaderLanguage.WGSL,
            skipSceneRegistration: true,
        },
    );
    probe.refreshRate = 0;
    probe.setTexture('heightTex', heightTexture);
    probe.setVector2('worldOrigin', new Vector2(...field.metadata.origin));
    probe.setVector2('worldExtent', new Vector2(...field.metadata.extent));
    probe.setFloat('heightRes', field.metadata.width);
    await whenReady(probe);
    probe.render();
    const raw = await probe.readPixels(0, 0);
    probe.dispose();
    if (!(raw instanceof Float32Array)) {
        throw new Error(`GPU height parity expected Float32Array, received ${raw?.constructor.name ?? 'null'}.`);
    }
    const stride = Math.max(1, Math.round(raw.length / (resolution * resolution)));
    let maximumError = 0;
    let errorSum = 0;
    for (let zIndex = 0; zIndex < resolution; zIndex++) {
        const z = field.metadata.origin[1]
            + ((zIndex + 0.5) / resolution) * field.metadata.extent[1];
        for (let xIndex = 0; xIndex < resolution; xIndex++) {
            const x = field.metadata.origin[0]
                + ((xIndex + 0.5) / resolution) * field.metadata.extent[0];
            const cpu = field.sample(x, z);
            const gpu = raw[(zIndex * resolution + xIndex) * stride];
            const error = Math.abs(cpu - gpu);
            maximumError = Math.max(maximumError, error);
            errorSum += error;
        }
    }
    return {
        samples: resolution * resolution,
        maximumError,
        meanError: errorSum / (resolution * resolution),
    };
}
