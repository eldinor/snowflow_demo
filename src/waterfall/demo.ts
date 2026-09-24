/** Standalone GPU waterfall and Babylon FluidRenderer performance lab. @module waterfall/demo */

import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import "@babylonjs/core/Engines/WebGPU/Extensions/index";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Constants } from "@babylonjs/core/Engines/constants";
import { GPUParticleSystem } from "@babylonjs/core/Particles/gpuParticleSystem";
// Registers the WebGPU compute backend selected internally by GPUParticleSystem.
// The facade deliberately does not import it so applications can tree-shake it.
import "@babylonjs/core/Particles/computeShaderParticleSystem";
import "@babylonjs/core/Rendering/fluidRenderer/fluidRenderer";
// FluidRenderer normally registers these through asynchronous imports. Vite's
// HTML fallback can win that first-frame race, causing the page itself to be
// compiled as WGSL. Static registration makes every fluid pass ready up front.
import "@babylonjs/core/ShadersWGSL/fluidRenderingParticleDepth.vertex";
import "@babylonjs/core/ShadersWGSL/fluidRenderingParticleDepth.fragment";
import "@babylonjs/core/ShadersWGSL/fluidRenderingParticleThickness.vertex";
import "@babylonjs/core/ShadersWGSL/fluidRenderingParticleThickness.fragment";
import "@babylonjs/core/ShadersWGSL/fluidRenderingParticleDiffuse.vertex";
import "@babylonjs/core/ShadersWGSL/fluidRenderingParticleDiffuse.fragment";
import "@babylonjs/core/ShadersWGSL/fluidRenderingBilateralBlur.fragment";
import "@babylonjs/core/ShadersWGSL/fluidRenderingStandardBlur.fragment";
import "@babylonjs/core/ShadersWGSL/fluidRenderingRender.fragment";
import type { IFluidRenderingRenderObject } from "@babylonjs/core/Rendering/fluidRenderer/fluidRenderer";

const canvas = required<HTMLCanvasElement>("waterfall-view");
const status = required<HTMLElement>("status");
const stats = required<HTMLElement>("stats");
const controls = required<HTMLFieldSetElement>("controls");

let engine: WebGPUEngine | null = null;
let scene: Scene | null = null;
let water: GPUParticleSystem | null = null;
let veil: GPUParticleSystem | null = null;
let mist: GPUParticleSystem | null = null;
let fluidObject: IFluidRenderingRenderObject | null = null;
let sheet: ReturnType<typeof MeshBuilder.CreatePlane> | null = null;
let resizePending = false;

function required<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing #${id}`);
    return element as T;
}

function particleTexture(targetScene: Scene, mistTexture = false): RawTexture {
    const size = 64;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const dx = (x + .5) / size * 2 - 1;
        const dy = (y + .5) / size * 2 - 1;
        const falloff = Math.max(0, 1 - Math.hypot(dx, dy));
        const alpha = Math.pow(falloff, mistTexture ? 2.2 : .35);
        const offset = (y * size + x) * 4;
        data[offset] = mistTexture ? 205 : 225;
        data[offset + 1] = mistTexture ? 235 : 244;
        data[offset + 2] = 255;
        data[offset + 3] = Math.round(alpha * 255);
    }
    const texture = RawTexture.CreateRGBATexture(
        data, size, size, targetScene, true, false,
        Constants.TEXTURE_TRILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_UNSIGNED_BYTE,
    );
    // Raw textures do not infer alpha usage from their format. Without this,
    // Babylon renders the transparent edge texels as an opaque square.
    texture.hasAlpha = true;
    texture.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE;
    texture.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
    return texture;
}

function createWaterParticles(targetScene: Scene): GPUParticleSystem {
    const system = new GPUParticleSystem("waterfall-fluid", { capacity: 12000 }, targetScene);
    system.particleTexture = particleTexture(targetScene);
    system.emitter = new Vector3(0, 11.5, 0);
    system.createBoxEmitter(
        new Vector3(-.12, -2.2, -.08), new Vector3(.12, -1.6, .08),
        new Vector3(-2, -.08, -.12), new Vector3(2, .08, .12),
    );
    system.emitRate = 3200;
    // Respawn at the pool instead of letting the curtain continue visibly
    // through it; impact spray is owned by the separate mist layer.
    system.minLifeTime = 1.38;
    system.maxLifeTime = 1.52;
    system.minSize = .225;
    system.maxSize = .255;
    system.gravity.set(0, -9.81, 0);
    system.minEmitPower = 1;
    system.maxEmitPower = 1;
    system.updateSpeed = 1 / 60;
    system.start();
    return system;
}

function createMist(targetScene: Scene): GPUParticleSystem {
    const system = new GPUParticleSystem("waterfall-mist", { capacity: 2400 }, targetScene);
    system.particleTexture = particleTexture(targetScene, true);
    system.blendMode = GPUParticleSystem.BLENDMODE_STANDARD;
    system.emitter = new Vector3(0, .35, 0);
    system.createBoxEmitter(
        new Vector3(-1.3, .7, -.7), new Vector3(1.3, 1.7, .7),
        new Vector3(-1.6, 0, -.6), new Vector3(1.6, .15, .6),
    );
    system.emitRate = 300;
    system.minLifeTime = 1.2;
    system.maxLifeTime = 2.8;
    system.minSize = .12;
    system.maxSize = .42;
    system.minEmitPower = 1;
    system.maxEmitPower = 1;
    system.gravity.set(0, .05, 0);
    system.color1 = new Color4(.72, .88, .96, .24);
    system.color2 = new Color4(.9, .97, 1, .12);
    system.colorDead = new Color4(.8, .92, 1, 0);
    system.updateSpeed = 1 / 60;
    system.start();
    return system;
}

/** GPU streaks keep the falling column readable where its reconstructed fluid
 * surface is too thin against the dark cliff. */
function createWaterVeil(targetScene: Scene): GPUParticleSystem {
    const system = new GPUParticleSystem("waterfall-veil", { capacity: 9000 }, targetScene);
    system.particleTexture = particleTexture(targetScene, true);
    system.blendMode = GPUParticleSystem.BLENDMODE_STANDARD;
    system.emitter = new Vector3(0, 11.5, -.08);
    system.createBoxEmitter(
        new Vector3(-.06, -2.25, -.03), new Vector3(.06, -1.85, .03),
        new Vector3(-2, -.05, -.05), new Vector3(2, .05, .05),
    );
    system.emitRate = 2800;
    system.minLifeTime = 1.38;
    system.maxLifeTime = 1.52;
    system.minSize = .16;
    system.maxSize = .24;
    system.minScaleX = .45;
    system.maxScaleX = .8;
    system.minScaleY = 2.2;
    system.maxScaleY = 3.8;
    system.minEmitPower = 1;
    system.maxEmitPower = 1;
    system.gravity.set(0, -9.81, 0);
    system.color1 = new Color4(.42, .72, .82, .32);
    system.color2 = new Color4(.7, .9, .96, .2);
    system.colorDead = new Color4(.55, .82, .9, 0);
    system.updateSpeed = 1 / 60;
    system.start();
    return system;
}

function buildEnvironment(targetScene: Scene): void {
    const hemi = new HemisphericLight("sky-light", new Vector3(0, 1, 0), targetScene);
    hemi.intensity = .85;
    hemi.diffuse = new Color3(.65, .78, .9);
    const sun = new DirectionalLight("sun", new Vector3(-.45, -.8, .3), targetScene);
    sun.intensity = 2.2;
    sun.diffuse = new Color3(1, .88, .68);

    const cliffMat = new StandardMaterial("cliff", targetScene);
    cliffMat.diffuseColor = new Color3(.16, .2, .18);
    cliffMat.specularColor = new Color3(.03, .03, .03);
    const cliff = MeshBuilder.CreateBox("cliff", { width: 13, height: 13, depth: 3 }, targetScene);
    cliff.position.set(0, 6, 2);
    cliff.material = cliffMat;
    const cut = MeshBuilder.CreateBox("dark-channel", { width: 5.2, height: 12, depth: .5 }, targetScene);
    cut.position.set(0, 6, .48);
    const cutMat = new StandardMaterial("wet-rock", targetScene);
    cutMat.diffuseColor = new Color3(.055, .075, .07);
    cutMat.specularColor = new Color3(.18, .2, .2);
    cut.material = cutMat;

    const pool = MeshBuilder.CreateCylinder("pool", { diameter: 16, height: .08, tessellation: 96 }, targetScene);
    pool.position.y = -.03;
    const poolMat = new StandardMaterial("pool", targetScene);
    poolMat.diffuseColor = new Color3(.035, .16, .2);
    poolMat.specularColor = new Color3(.7, .82, .88);
    poolMat.specularPower = 120;
    pool.material = poolMat;

    sheet = MeshBuilder.CreatePlane("waterfall-sheet", { width: 4.2, height: 11.2, sideOrientation: 2 }, targetScene);
    // Keep this optional comparison aid behind the fluid particles. Placing a
    // transparent plane in front also places its depth in front of the fluid
    // reconstruction, making the falling column disappear.
    sheet.position.set(0, 5.9, .18);
    const sheetMat = new StandardMaterial("waterfall-sheet", targetScene);
    sheetMat.diffuseColor = new Color3(.22, .58, .7);
    sheetMat.emissiveColor = new Color3(.025, .075, .09);
    sheetMat.alpha = .28;
    sheetMat.disableDepthWrite = true;
    sheet.material = sheetMat;
    sheet.setEnabled(false);
}

function bindRange(id: string, apply: (value: number) => void, format = (value: number) => String(value)): void {
    const input = required<HTMLInputElement>(id);
    const output = required<HTMLOutputElement>(`${id}-out`);
    const update = (): void => {
        const value = Number(input.value);
        output.textContent = format(value);
        apply(value);
    };
    input.addEventListener("input", update);
    update();
}

function configureUI(camera: ArcRotateCamera): void {
    bindRange("emission", value => {
        if (water) water.emitRate = value;
        if (veil) veil.emitRate = value * .875;
    }, value => value.toFixed(0));
    bindRange("size", value => {
        if (!water || !fluidObject) return;
        water.minSize = value * .9;
        water.maxSize = value * 1.1;
        if (required<HTMLInputElement>("fluid").checked) fluidObject.object.particleSize = value;
        fluidObject.object.particleThicknessAlpha = value;
        fluidObject.targetRenderer.minimumThickness = value * .45;
    }, value => value.toFixed(2));
    bindRange("width", value => {
        if (!water) return;
        water.createBoxEmitter(
            new Vector3(-.12, -2.2, -.08), new Vector3(.12, -1.6, .08),
            new Vector3(-value / 2, -.08, -.12), new Vector3(value / 2, .08, .12),
        );
        veil?.createBoxEmitter(
            new Vector3(-.06, -2.25, -.03), new Vector3(.06, -1.85, .03),
            new Vector3(-value / 2, -.05, -.05), new Vector3(value / 2, .05, .05),
        );
        if (sheet) sheet.scaling.x = value / 4.2;
    }, value => `${value.toFixed(1)} m`);
    bindRange("density", value => { if (fluidObject) fluidObject.targetRenderer.density = value; }, value => value.toFixed(1));
    bindRange("refraction", value => { if (fluidObject) fluidObject.targetRenderer.refractionStrength = value; }, value => value.toFixed(3));
    bindRange("depth-blur", value => { if (fluidObject) fluidObject.targetRenderer.blurDepthNumIterations = value; }, value => value.toFixed(0));
    bindRange("thickness-blur", value => { if (fluidObject) fluidObject.targetRenderer.blurThicknessNumIterations = value; }, value => value.toFixed(0));

    required<HTMLSelectElement>("buffer").addEventListener("change", event => {
        if (!fluidObject) return;
        const value = (event.target as HTMLSelectElement).value;
        const size = value === "screen" ? null : Number(value);
        fluidObject.targetRenderer.depthMapSize = size;
        fluidObject.targetRenderer.thicknessMapSize = size;
    });
    required<HTMLInputElement>("fluid").addEventListener("change", event => {
        if (!fluidObject || !water) return;
        const enabled = (event.target as HTMLInputElement).checked;
        if (enabled) {
            fluidObject.object.particleSize = Number(required<HTMLInputElement>("size").value);
            water.start();
            veil?.start();
        } else {
            water.stop();
            water.reset();
            veil?.stop();
            veil?.reset();
        }
    });
    required<HTMLInputElement>("mist").addEventListener("change", event => {
        if (!mist) return;
        if ((event.target as HTMLInputElement).checked) mist.start(); else mist.stop();
    });
    required<HTMLInputElement>("curtain").addEventListener("change", event => {
        if (sheet) sheet.setEnabled((event.target as HTMLInputElement).checked);
    });
    required<HTMLButtonElement>("reset").addEventListener("click", () => {
        camera.alpha = -Math.PI / 2;
        camera.beta = 1.25;
        camera.radius = 24;
        camera.target.set(0, 5, 0);
    });
}

async function boot(): Promise<void> {
    if (!navigator.gpu) throw new Error("This lab requires a WebGPU-capable browser.");
    engine = new WebGPUEngine(canvas, { antialias: true, powerPreference: "high-performance" });
    await engine.initAsync();
    scene = new Scene(engine);
    scene.clearColor = new Color4(.29, .42, .5, 1);
    const camera = new ArcRotateCamera("camera", -Math.PI / 2, 1.25, 24, new Vector3(0, 5, 0), scene);
    camera.minZ = .1;
    camera.maxZ = 200;
    camera.wheelPrecision = 35;
    camera.attachControl(canvas, true);
    scene.activeCamera = camera;
    buildEnvironment(scene);

    water = createWaterParticles(scene);
    veil = createWaterVeil(scene);
    mist = createMist(scene);
    const renderer = scene.enableFluidRenderer();
    if (!renderer) throw new Error("Babylon FluidRenderer could not be enabled.");
    fluidObject = renderer.addParticleSystem(water, false, undefined, camera);
    fluidObject.object.particleSize = .2;
    fluidObject.object.particleThicknessAlpha = .2;
    fluidObject.targetRenderer.enableBlurDepth = true;
    fluidObject.targetRenderer.blurDepthFilterSize = 12;
    fluidObject.targetRenderer.blurDepthNumIterations = 3;
    fluidObject.targetRenderer.blurDepthDepthScale = 8;
    fluidObject.targetRenderer.enableBlurThickness = true;
    fluidObject.targetRenderer.blurThicknessFilterSize = 8;
    fluidObject.targetRenderer.blurThicknessNumIterations = 2;
    fluidObject.targetRenderer.depthMapSize = 1024;
    fluidObject.targetRenderer.thicknessMapSize = 1024;
    fluidObject.targetRenderer.fluidColor = new Color3(.16, .55, .68);
    fluidObject.targetRenderer.density = 3.5;
    fluidObject.targetRenderer.refractionStrength = .025;
    fluidObject.targetRenderer.specularPower = 180;
    fluidObject.targetRenderer.minimumThickness = .09;
    fluidObject.targetRenderer.dirLight = new Vector3(-.45, -.8, .3);

    controls.disabled = false;
    configureUI(camera);
    status.textContent = "Ready · GPU particles + Babylon FluidRenderer";
    const samples: number[] = [];
    let previous = performance.now();
    let lastStats = 0;
    engine.runRenderLoop(() => {
        if (resizePending) { engine?.resize(); resizePending = false; }
        const now = performance.now();
        const frame = now - previous;
        previous = now;
        samples.push(frame);
        if (samples.length > 180) samples.shift();
        scene?.render();
        if (now - lastStats > 300) {
            lastStats = now;
            const sorted = [...samples].sort((a, b) => a - b);
            const median = sorted[Math.floor(sorted.length * .5)] ?? 0;
            const p95 = sorted[Math.floor(sorted.length * .95)] ?? 0;
            stats.textContent = `Frame median / p95: ${median.toFixed(2)} / ${p95.toFixed(2)} ms\nApprox. FPS: ${(1000 / Math.max(.01, median)).toFixed(0)}\nFluid particles: ${water?.getActiveCount().toLocaleString() ?? 0}\nMist particles: ${mist?.getActiveCount().toLocaleString() ?? 0}\nFluid buffers: ${required<HTMLSelectElement>("buffer").value}\nViewport: ${engine?.getRenderWidth()} × ${engine?.getRenderHeight()}`;
        }
    });
    globalThis.EXALTED_WATERFALL = { engine, scene, camera, water, veil, mist, fluidObject };
}

declare global {
    var EXALTED_WATERFALL: Record<string, unknown>;
}

window.addEventListener("resize", () => { resizePending = true; });
boot().catch(error => {
    console.error(error);
    status.textContent = `Startup failed · ${error instanceof Error ? error.message : String(error)}`;
});

if (import.meta.hot) import.meta.hot.dispose(() => {
    engine?.stopRenderLoop();
    scene?.dispose();
    engine?.dispose();
});
