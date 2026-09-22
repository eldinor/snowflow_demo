/**
 * EXALTED Р В Р’В Р В РІР‚В Р В Р’В Р Р†Р вЂљРЎв„ўР В Р вЂ Р В РІР‚С™Р РЋРЎС™ entry point and frame orchestration.
 *
 * WebGPU only, by design. No WebGL path, no feature-detect branches: if the
 * adapter isn't there we say so once and stop.
 *
 * @module main
 */

import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
// Side-effect import: installs `captureGPUFrameTime` / `getGPUFrameTimeCounter`
// onto the engine prototype, which is what makes the overlay's GPU row a real
// GPU number rather than the presentation cadence.
import "@babylonjs/core/Engines/AbstractEngine/abstractEngine.timeQuery";
import { Scene } from "@babylonjs/core/scene";
import { Vector3, Color3, Color4 } from "@babylonjs/core/Maths/math";

import { registerShaders } from "./shaders/registry.ts";
import { S, onChange } from "./core/settings.ts";
import {
    sample, checkSpike, stats, mark, installDrawCounter, endFrameDraws,
} from "./core/perf.ts";
import { initInput, pollInput, endFrame, input, resetInput } from "./core/input.ts";
import { CameraRig } from "./core/camera.ts";
import { CharacterController } from "./character/controller.ts";
import { Character } from "./character/character.ts";
import { SnowContact } from "./character/snowContact.ts";
import { SprayField } from "./vfx/particles.ts";
import { SurfWake } from "./vfx/surfWake.ts";
import { SpellSystem } from "./spells/spellSystem.ts";
import { Overlay } from "./ui/overlay.ts";
import { SpawnBar } from "./ui/spawnBar.ts";
import { installInspectorShortcut } from './ui/inspector.ts';
import { ScreenshotGallery } from './ui/screenshotGallery.ts';
import { Sky } from "./render/sky.ts";
import { ShadowSystem } from "./render/shadows.ts";
import { Terrain } from "./terrain/terrain.ts";
import { EXALTED_SPAWN, ExaltedWorld } from "./terrain/exaltedWorld.ts";
import type { SpawnPoint } from "./world/spawnPoints.ts";
import { DesertProps } from './world/desertProps.ts';
import { FlightWind } from './vfx/flightWind.ts';
import { WorldWater } from './world/worldWater.ts';
import { WaterEffects } from './vfx/waterEffects.ts';
import { DepthPass } from "./render/depthPass.ts";
import { PostChain } from "./post/postChain.ts";
import { whenReady } from "./core/gpuUtil.ts";
import * as loading from "./core/loading.ts";

// ------------------------------------------------------- module-scope scratch
const _vel = new Vector3();

/** Systems intentionally exposed for live inspection and tuning in the browser console. */
interface ExaltedRuntime {
    engine: WebGPUEngine;
    scene: Scene;
    rig: CameraRig;
    character: CharacterController;
    figure: Character;
    contact: SnowContact;
    spray: SprayField;
    wake: SurfWake;
    spells: SpellSystem;
    overlay: Overlay;
    terrain: Terrain;
    sky: Sky;
    shadows: ShadowSystem;
    post: PostChain;
    depthPass: DepthPass;
    spawnBar: SpawnBar | null;
    S: typeof S;
    input: typeof input;
    perfStats: typeof stats;
    desertProps: DesertProps | null;
    worldWater: WorldWater | null;
    screenshotGallery: ScreenshotGallery;
}

declare global {
    var EXALTED: ExaltedRuntime;
}

/** Return a required canvas with a clear startup error if the page shell is incomplete. */
function requiredCanvas(id: string): HTMLCanvasElement {
    const element = document.getElementById(id);
    if (!(element instanceof HTMLCanvasElement)) {
        throw new Error(`Required canvas #${id} was not found.`);
    }
    return element;
}

/** Initialize world systems in dependency order, warm pipelines and start the ordered simulation/render loop. */
async function boot(): Promise<void> {
    const exalted = new URLSearchParams(location.search).get("terrain") !== "procedural";
    if (exalted) {
        // Exalted's actual mountain silhouettes replace the invented sky range.
        S.showMountains = false;
    }
    const canvas = requiredCanvas("view");

    if (!navigator.gpu) {
        loading.fail("WebGPU is not available in this browser.");
        return;
    }

    await loading.phase("creating device", 0.05);

    const engine = new WebGPUEngine(canvas, {
        antialias: false, // TAA handles edges; MSAA here would just cost bandwidth
        stencil: false,
        powerPreference: "high-performance",
    });

    try {
        await engine.initAsync();
    } catch (err) {
        console.error(err);
        loading.fail("WebGPU device initialisation failed.");
        return;
    }

    // The heightfield is R32F and is filtered in the vertex shader, which needs
    // this feature. Every desktop GPU that can run this demo has it.
    const filterable = engine.getCaps().textureFloatLinearFiltering;
    if (!filterable) {
        console.warn("[exalted] float32-filterable unavailable; height will step");
    }

    // Reconfiguring a WebGPU canvas destroys its current swap texture. Never do
    // that directly from a DOM/settings callback: Babylon may still have that
    // texture referenced by a command buffer waiting to be submitted. Queue
    // changes and consume them immediately before beginning a new frame.
    let pendingScale: number | null = S.resolutionScale;
    let pendingResize = true;
    const flushResize = (): void => {
        if (!pendingResize) return;
        pendingResize = false;
        if (pendingScale !== null) {
            engine.setHardwareScalingLevel(1 / pendingScale);
            pendingScale = null;
        } else {
            engine.resize();
        }
    };
    onChange("resolutionScale", (v) => {
        pendingScale = v;
        pendingResize = true;
    });
    window.addEventListener("resize", () => {
        pendingResize = true;
    });
    flushResize();

    installDrawCounter(engine);
    // Dawn currently guards timestamp writes behind its `allow_unsafe_apis`
    // toggle on some Chrome/driver combinations. Enabling capture there makes
    // Babylon's whole command buffer invalid, so GPU timing is explicitly
    // opt-in. Normal users still get all CPU/frame statistics in the overlay.
    // Developers running a browser with timestamp queries enabled can use
    // `?gpuTiming=1` to restore the GPU row.
    const gpuTiming = new URLSearchParams(location.search).get("gpuTiming") === "1";
    if (gpuTiming) engine.captureGPUFrameTime(true);
    registerShaders();

    await loading.phase("building scene", 0.12);

    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.02, 0.03, 0.05, 1);
    scene.autoClear = true;
    // Do NOT clear depth between rendering groups. Babylon clears depth before
    // every group by default; here group 1 is the opaque scene and group 2 is
    // the alpha-blended water and spray, which must depth-test against it.
    scene.setRenderingAutoClearDepthStencil(1, false);
    scene.setRenderingAutoClearDepthStencil(2, false);
    // No stock lights: every material here computes its own lighting.
    scene.ambientColor = new Color3(0, 0, 0);

    const rig = new CameraRig(scene, canvas);
    scene.activeCamera = rig.camera;

    // ------------------------------------------------------------------ sky
    await loading.phase("integrating atmosphere", 0.2);
    const sky = new Sky(scene);
    sky.mesh.renderingGroupId = 0;
    await sky.solve();

    // -------------------------------------------------------------- shadows
    const shadows = new ShadowSystem(scene);

    // The camera-space depth prepass. It is a custom render target, and the
    // scene renders those in registration order Р В Р’В Р В РІР‚В Р В Р’В Р Р†Р вЂљРЎв„ўР В Р вЂ Р В РІР‚С™Р РЋРЎС™ so creating it here, after
    // the cascades and before anything that draws, is the whole of the
    // scheduling.
    const depthPass = new DepthPass(scene);

    // -------------------------------------------------------------- terrain
    await loading.phase(exalted ? "loading Exalted terrain" : "baking heightfield", 0.34);
    const terrain = new Terrain(scene, sky, shadows, { exalted });
    terrain.mesh.renderingGroupId = 1;
    await terrain.build();
    onChange("showTerrain", (v) => (terrain.mesh.isVisible = v));
    terrain.registerPrepass(depthPass);
    const worldWater = exalted && terrain.heightfield instanceof ExaltedWorld
        ? new WorldWater(scene, terrain, sky, depthPass)
        : null;
    let desertProps: DesertProps | null = null;
    if (exalted) {
        await loading.phase('loading desert vegetation and rocks', 0.50);
        desertProps = new DesertProps(scene, terrain, sky, shadows, depthPass);
        await desertProps.load();
    }

    await loading.phase("placing character", 0.62);

    const character = new CharacterController(terrain);
    character.position.set(0, 0, 0);
    character.position.y = terrain.heightAt(0, 0);
    if (exalted) {
        character.position.copyFromFloats(EXALTED_SPAWN.x, EXALTED_SPAWN.y, EXALTED_SPAWN.z);
        character.position.y = terrain.heightAt(character.position.x, character.position.z);
        character.facing = Math.PI;
        rig.yaw = Math.PI;
    }

    // The figure: skeleton, garment simulation, shell fur.
    const figure = new Character(scene, terrain, sky, shadows, character);
    onChange("showCharacter", (v) => figure.setVisible(v));
    figure.registerPrepass(depthPass);

    // Airborne snow: footfall kick now, the surf plume and spell spray later.
    const spray = new SprayField(scene, terrain, sky, shadows);
    const flightWind = new FlightWind(scene, character, spray);
    const waterEffects=worldWater ? new WaterEffects(worldWater,terrain,character,spray) : null;

    // Feet and the surf groove write into the terrain state buffer through here.
    const contact = new SnowContact(character, terrain.deform, figure.figure, spray);

    // The breaking wave, its bow crest and the plume it sheds.
    const wake = new SurfWake(scene, sky, shadows, character, spray, terrain);
    onChange("showWake", (v) => wake.setEnabled(v));
    wake.registerPrepass(depthPass);

    // The nine spells, the water body they bend and the ice they leave. Every
    // one of them writes into the same terrain state buffer the feet and the
    // wake do, and lights the snow through the same four-slot pool.
    const spells = new SpellSystem(
        scene, sky, shadows, terrain, character, figure.figure, rig, spray
    );
    // Every surface a spell can light.
    spells.addConsumers(
        ...(desertProps?.materials || []),
        ...terrain.materials, figure.bodyMat, figure.clothMat,
        wake.material, spray.material
    );
    spells.registerPrepass(depthPass);

    // The rig needs ground heights to keep the spring arm above the snow.
    rig.groundAt = (x, z) => Math.max(terrain.heightAt(x, z),terrain.water?.sample(x,z)?.level??-Infinity);
    rig.obstacles = terrain.obstacles ?? null;
    // Initialise the camera at spawn before fitting shadows or warming TAA.
    rig.update(0, character.position, character.velocity, 0, 0);

    const post = new PostChain(scene, rig.camera, depthPass, sky);

    const overlay = new Overlay({ rig, character });
    const screenshotGallery = new ScreenshotGallery(engine, rig.camera);
    initInput(canvas, {
        onToggleOverlay: () => overlay.toggle(),
        onScreenshot: () => void screenshotGallery.capture(),
    });
    installInspectorShortcut(scene);

    // ------------------------------------------------------------- warm-up
    // Everything that can compile, compiles here Р В Р’В Р В РІР‚В Р В Р’В Р Р†Р вЂљРЎв„ўР В Р вЂ Р В РІР‚С™Р РЋРЎС™ behind the loading screen.
    await loading.phase("compiling pipelines", 0.78);
    shadows.update(rig.camera, sky.sunDir);
    sky.render(rig, 0);
    await terrain.warmUp();
    terrain.update(rig.camera.position, character.position, 0);
    desertProps?.update(rig.camera.position, character.position, true);
    await desertProps?.warmUp();
    worldWater?.update(0,rig.camera.position);
    await worldWater?.warmUp();
    figure.update(0);
    figure.sync(rig.camera.position);
    await figure.warmUp();
    spray.update(0, rig.camera.position);
    await spray.warmUp();
    await wake.warmUp();
    await spells.warmUp(
        character.position.x + 3, character.position.y, character.position.z + 3
    );
    await whenReady(sky.material, "sky material", [sky.mesh, false]);
    await depthPass.warmUp();
    post.update(0, 0, rig.distance);
    const passes = post.passes;
    for (let i = 0; i < passes.length; i++) {
        await whenReady(passes[i], "post:" + passes[i].name);
    }

    await loading.phase("warming render targets", 0.92);
    // A few real frames so every render target is allocated and every pipeline
    // has actually been bound at least once.
    for (let i = 0; i < 3; i++) {
        flushResize();
        // These renders happen before `runRenderLoop`, whose wrapper normally
        // owns beginFrame/endFrame. End each warm-up frame explicitly so its
        // command buffers are submitted while the acquired swap texture is
        // still alive; carrying one across requestAnimationFrame invalidates
        // Chromium's D3D shared-image backing.
        engine.beginFrame();
        scene.render();
        engine.endFrame();
        await loading.nextFrame();
    }
    // Only now: the spell meshes had to be standing *through* those frames for
    // their render pipelines to exist. See `WaterBody.warmUp`.
    spells.finishWarmUp();

    // ------------------------------------------------------------- run loop
    let prev = performance.now();
    let time = 0;
    let pendingSpawn: Readonly<SpawnPoint> | null = null;
    const spawnBar = exalted ? new SpawnBar((point) => { pendingSpawn = point; }, (useDesert) => {
        terrain.useDesertTextures = useDesert;
        post.resetHistory();
    }) : null;

    engine.runRenderLoop(() => {
        flushResize();
        const now = performance.now();
        let dtMs = now - prev;
        prev = now;
        if (dtMs > 100) dtMs = 100;
        const dt = S.freezeTime ? 0 : dtMs / 1000;
        time += dt;

        if (pendingSpawn) {
            const point = pendingSpawn;
            pendingSpawn = null;
            resetInput();
            spells.reset();
            terrain.groundProbe?.reset();
            character.teleport(-point.x, -point.y, point.yaw);
            figure.resetPose();
            contact.reset();
            wake.reset();
            spray.reset();
            rig.teleport(character.position, point.yaw);
            post.resetHistory();
            spawnBar?.select(point);
        }

        pollInput();

        // Per-system CPU timing. Babylon's WebGPU timestamp queries are
        // whole-frame, so the GPU row is a total and these are not subdivisions
        // of it Р В Р’В Р В РІР‚В Р В Р’В Р Р†Р вЂљРЎв„ўР В Р вЂ Р В РІР‚С™Р РЋРЎС™ the overlay labels them `cpu` for that reason.
        const tFrame = performance.now();

        character.update(dt, rig);
        // Pose and simulate before the contact pass: the footprints are stamped
        // at the boot's actual planted position, which only exists once the
        // figure has been solved.
        figure.update(dt);
        contact.update(dt);
        const tChar = performance.now();

        _vel.copyFrom(character.velocity);
        rig.update(dt, character.position, _vel, character.lean, character.speed01);

        // Jitters the projection and republishes everything the screen-space
        // passes derive from the camera. Must be after the rig has moved and
        // before anything reads `scene.getTransformMatrix()` Р В Р’В Р В РІР‚В Р В Р’В Р Р†Р вЂљРЎв„ўР В Р вЂ Р В РІР‚С™Р РЋРЎС™ which the depth
        // prepass and the beauty pass both do.
        post.update(dt, character.streak01, rig.distance);
        sky.update();
        sky.render(rig, time);
        shadows.update(rig.camera, sky.sunDir);
        // After the shadow refit, so the water and the ice carry this frame's
        // cascade matrices; before the terrain, so the brushes every spell
        // writes are in the staging array when the simulation pass runs.
        spells.update(dt, rig.camera.position);
        const tSpells = performance.now();
        terrain.update(rig.camera.position, character.position, dt);
        desertProps?.update(rig.camera.position, character.position, false, dt);
        worldWater?.update(dt,rig.camera.position);
        const tTerrain = performance.now();
        // After the shadow refit, so the figure's uniforms carry this frame's
        // cascade matrices rather than last frame's.
        figure.sync(rig.camera.position);
        // Before the spray: the wake decides where its own lip is, and the
        // grains it sheds have to be in the pool before the pool is uploaded.
        wake.update(dt, rig.camera.position);
        flightWind.update(dt);
        waterEffects?.update(dt,rig.camera.position);
        spray.update(dt, rig.camera.position);
        const tVfx = performance.now();

        scene.render();
        post.endFrame();
        terrain.groundProbe?.afterFrame();
        const tRender = performance.now();

        mark("cpu character", tChar - tFrame);
        mark("cpu spells", tSpells - tChar);
        mark("cpu terrain", tTerrain - tSpells);
        mark("cpu wake+spray", tVfx - tTerrain);
        mark("cpu submit", tRender - tVfx);
        mark("cpu total", tRender - tFrame);
        stats.gpuMs = gpuTiming
            ? engine.getGPUFrameTimeCounter().lastSecAverage / 1e6
            : 0;

        endFrameDraws();
        stats.triangles =
            (desertProps?.triangles || 0) + (worldWater?.triangles || 0) +
            (terrain.mesh.metadata ? terrain.mesh.metadata.triangles : 0) +
            (terrain.local?.mesh.metadata.triangles || 0) +
            (S.showCharacter ? figure.triangles : 0) +
            (wake.mesh.isVisible ? wake.mesh.metadata.triangles : 0) +
            spells.triangles +
            spray.liveCount * 2;

        sample(dtMs);
        checkSpike(dtMs);
        overlay.update(dtMs, engine);

        endFrame();
    });

    await loading.done();
    spawnBar?.show();
    setTimeout(() => overlay.resetSpikes(), 800);

    globalThis.EXALTED = {
        engine, scene, rig, character, figure, contact, spray, wake, spells,
        overlay, terrain, sky, shadows, post, depthPass, spawnBar,
        S, input, perfStats: stats,
        desertProps,
        worldWater,
        screenshotGallery,
        };
}

boot().catch((err) => {
    console.error(err);
    const detail = err instanceof Error ? err.message : String(err);
    loading.fail(`Startup failed Р В Р’В Р В РІР‚В Р В Р’В Р Р†Р вЂљРЎв„ўР В Р вЂ Р В РІР‚С™Р РЋРЎС™ ${detail}`);
});
