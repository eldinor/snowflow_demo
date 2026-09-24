/** GPU waterfall rendering for the authored Exalted river. @module vfx/worldWaterfall */

import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { GPUParticleSystem } from '@babylonjs/core/Particles/gpuParticleSystem';
// GPUParticleSystem selects Babylon's compute backend on WebGPU. The method is
// installed as an engine extension and is absent unless this side effect runs.
import '@babylonjs/core/Engines/WebGPU/Extensions/engine.computeShader';
import '@babylonjs/core/Particles/computeShaderParticleSystem';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Constants } from '@babylonjs/core/Engines/constants';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { WorldWater } from '../world/worldWater.ts';
import type { WaterfallEmitter } from '../world/waterSurface.ts';

interface DropSite { source: WaterfallEmitter; dx: number; dz: number; bottomY: number; drop: number }

/** Make a soft radial sprite with explicit alpha metadata for WebGPU particles. */
function softParticleTexture(scene: Scene): RawTexture {
    const size = 64, data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const dx = (x + .5) / size * 2 - 1, dy = (y + .5) / size * 2 - 1;
        const alpha = Math.pow(Math.max(0, 1 - Math.hypot(dx, dy)), 2.2);
        const i = (y * size + x) * 4;
        data.set([205, 235, 255, Math.round(alpha * 255)], i);
    }
    const texture = RawTexture.CreateRGBATexture(
        data, size, size, scene, true, false,
        Constants.TEXTURE_TRILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_UNSIGNED_BYTE,
    );
    texture.hasAlpha = true;
    texture.wrapU = texture.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
    return texture;
}

/** Choose the valid steep blue river sample nearest the authored lake mouth. */
function selectDrop(water: WorldWater): DropSite | null {
    let best: DropSite | null = null;
    let bestDistance = Infinity;
    for (const source of water.emitters) {
        // At the lake mouth the coarse terrain triangles alternate their normal
        // direction, so use the authored river mouth as the stable downstream
        // direction and the lake plane as the fall's receiving level.
        const towardX = water.riverMouth.x - source.x;
        const towardZ = water.riverMouth.y - source.z;
        const length = Math.hypot(towardX, towardZ);
        if (length < .001) continue;
        const dx = towardX / length, dz = towardZ / length;
        const bottomY = water.level;
        const drop = source.y - bottomY;
        if (drop < 1.5 || drop > 28) continue;
        const distance = Math.hypot(source.x - water.riverMouth.x, source.z - water.riverMouth.y);
        if (distance < bestDistance || (distance === bestDistance && (!best || drop > best.drop))) {
            best = { source, dx, dz, bottomY, drop };
            bestDistance = distance;
        }
    }
    return best;
}

/** One bounded waterfall: a readable falling GPU veil and GPU impact mist. */
export class WorldWaterfall {
    readonly site: DropSite;
    readonly veil: GPUParticleSystem;
    readonly mist: GPUParticleSystem;
    private readonly emitter: Mesh;
    private active = false;

    static create(scene: Scene, water: WorldWater): WorldWaterfall | null {
        const site = selectDrop(water);
        return site ? new WorldWaterfall(scene, site) : null;
    }

    private constructor(scene: Scene, site: DropSite) {
        this.site = site;
        const texture = softParticleTexture(scene);
        const fallTime = Math.min(2.4, Math.max(.65, Math.sqrt(2 * site.drop / 9.81)));
        const width = Math.min(5, Math.max(2, site.drop * .32));
        this.emitter = new Mesh('world-waterfall:lip', scene);
        this.emitter.isVisible = false;
        this.emitter.position.set(site.source.x, site.source.y + .15, site.source.z);
        this.emitter.rotation.y = Math.atan2(site.dx, site.dz);

        this.veil = this.makeFall(scene, texture, 'world-waterfall:veil', 8000, width, fallTime, 2450);
        this.mist = new GPUParticleSystem('world-waterfall:mist', { capacity: 2200 }, scene);
        this.mist.particleTexture = texture;
        this.mist.blendMode = GPUParticleSystem.BLENDMODE_STANDARD;
        this.mist.emitter = new Vector3(
            site.source.x + site.dx * 5, site.bottomY + .3, site.source.z + site.dz * 5,
        );
        this.mist.createBoxEmitter(
            new Vector3(-1.2, .7, -.7), new Vector3(1.2, 1.7, .7),
            new Vector3(-width * .4, 0, -.45), new Vector3(width * .4, .12, .45),
        );
        this.mist.emitRate = 300;
        this.mist.minLifeTime = 1.1; this.mist.maxLifeTime = 2.5;
        this.mist.minSize = .12; this.mist.maxSize = .42;
        this.mist.minEmitPower = this.mist.maxEmitPower = 1;
        this.mist.gravity.set(0, .05, 0);
        this.mist.color1 = new Color4(.72, .88, .96, .24);
        this.mist.color2 = new Color4(.9, .97, 1, .12);
        this.mist.colorDead = new Color4(.8, .92, 1, 0);
        this.mist.updateSpeed = 1 / 60;
        this.mist.renderingGroupId = 2;

        scene.onDisposeObservable.addOnce(() => this.dispose());
    }

    private makeFall(scene: Scene, texture: RawTexture, name: string, capacity: number,
        width: number, life: number, rate: number): GPUParticleSystem {
        const system = new GPUParticleSystem(name, { capacity }, scene);
        system.particleTexture = texture;
        system.emitter = this.emitter;
        system.createBoxEmitter(
            new Vector3(-.06, -2.25, -.03), new Vector3(.06, -1.85, .03),
            new Vector3(-width / 2, -.05, -.05), new Vector3(width / 2, .05, .05),
        );
        system.emitRate = rate;
        system.minLifeTime = life * .94; system.maxLifeTime = life * 1.06;
        system.minSize = .16; system.maxSize = .24;
        system.blendMode = GPUParticleSystem.BLENDMODE_STANDARD;
        system.minScaleX = .45; system.maxScaleX = .8;
        system.minScaleY = 2.2; system.maxScaleY = 3.8;
        system.color1 = new Color4(.42, .72, .82, .32);
        system.color2 = new Color4(.7, .9, .96, .2);
        system.colorDead = new Color4(.55, .82, .9, 0);
        system.minEmitPower = system.maxEmitPower = 1;
        system.gravity.set(0, -9.81, 0);
        system.updateSpeed = 1 / 60;
        system.renderingGroupId = 2;
        return system;
    }

    /** Suspend all GPU work outside the waterfall's useful viewing radius. */
    update(camera: Vector3): void {
        const { source } = this.site;
        const shouldRun = Vector3.DistanceSquared(camera, new Vector3(source.x, source.y, source.z)) < 220 * 220;
        if (shouldRun === this.active) return;
        this.active = shouldRun;
        for (const system of [this.veil, this.mist]) {
            if (shouldRun) system.start();
            else { system.stop(); system.reset(); }
        }
    }

    dispose(): void {
        this.veil.dispose(); this.mist.dispose(); this.emitter.dispose();
    }
}
