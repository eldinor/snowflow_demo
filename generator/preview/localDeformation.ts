import { Constants } from '@babylonjs/core/Engines/constants';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import type { Scene } from '@babylonjs/core/scene';
import type { SurfaceResponse } from '../config/surfaceResponse.ts';

export const DEFORMATION_RESOLUTION = 512;
export const DEFORMATION_SIZE = 256;
// Zero maps exactly to byte 170, avoiding a whole-patch offset before editing.
export const DEFORMATION_MIN = -0.48;
export const DEFORMATION_RANGE = 0.72;

/** High-resolution editable displacement patch used to review biome response. */
export class LocalDeformation {
    public readonly values = new Float32Array(DEFORMATION_RESOLUTION * DEFORMATION_RESOLUTION);
    public readonly pixels = new Uint8Array(DEFORMATION_RESOLUTION * DEFORMATION_RESOLUTION * 4);
    public readonly texture: RawTexture;
    public centerX = 0;
    public centerZ = 0;
    public active = false;

    public constructor(scene: Scene) {
        this.encodePixels();
        this.texture = RawTexture.CreateRGBATexture(
            this.pixels,
            DEFORMATION_RESOLUTION,
            DEFORMATION_RESOLUTION,
            scene,
            false,
            false,
            Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
        );
        this.texture.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE;
        this.texture.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
    }

    public clear(): void {
        this.values.fill(0);
        this.encodePixels();
        this.texture.update(this.pixels);
        this.active = false;
    }

    /** Applies a pressure brush with a depression and material-conserving outer berm. */
    public stamp(
        worldX: number,
        worldZ: number,
        response: SurfaceResponse,
        radius = 5,
        pressure = 0.7,
    ): boolean {
        if (response.compressionDepth <= 0.001) return false;
        if (!this.active || Math.abs(worldX - this.centerX) > DEFORMATION_SIZE * 0.42
            || Math.abs(worldZ - this.centerZ) > DEFORMATION_SIZE * 0.42) {
            this.values.fill(0);
            this.centerX = worldX;
            this.centerZ = worldZ;
            this.active = true;
        }
        const texelsPerMetre = DEFORMATION_RESOLUTION / DEFORMATION_SIZE;
        const localX = (worldX - (this.centerX - DEFORMATION_SIZE / 2)) * texelsPerMetre;
        const localZ = (worldZ - (this.centerZ - DEFORMATION_SIZE / 2)) * texelsPerMetre;
        const texelRadius = Math.max(2, radius * texelsPerMetre);
        const reach = Math.ceil(texelRadius * 1.9);
        const minX = Math.max(0, Math.floor(localX - reach));
        const maxX = Math.min(DEFORMATION_RESOLUTION - 1, Math.ceil(localX + reach));
        const minZ = Math.max(0, Math.floor(localZ - reach));
        const maxZ = Math.min(DEFORMATION_RESOLUTION - 1, Math.ceil(localZ + reach));
        const depth = response.compressionDepth * pressure * (1 - response.hardness * 0.35);
        for (let z = minZ; z <= maxZ; z++) {
            for (let x = minX; x <= maxX; x++) {
                const distance = Math.hypot(x - localX, z - localZ) / texelRadius;
                if (distance > 1.9) continue;
                const depression = -depth * Math.exp(-distance * distance * 3.2);
                const bermDistance = (distance - 1.18) / 0.28;
                const berm = depth * response.bermRatio * Math.exp(-bermDistance * bermDistance);
                const index = z * DEFORMATION_RESOLUTION + x;
                this.values[index] = Math.max(-response.compressionDepth, Math.min(0.18, this.values[index] + depression + berm));
            }
        }
        this.encodePixels();
        this.texture.update(this.pixels);
        return true;
    }

    private encodePixels(): void {
        for (let index = 0; index < this.values.length; index++) {
            const encoded = Math.round(Math.max(0, Math.min(1, (this.values[index] - DEFORMATION_MIN) / DEFORMATION_RANGE)) * 255);
            const offset = index * 4;
            this.pixels[offset] = encoded;
            this.pixels[offset + 1] = encoded;
            this.pixels[offset + 2] = encoded;
            this.pixels[offset + 3] = 255;
        }
    }
}
