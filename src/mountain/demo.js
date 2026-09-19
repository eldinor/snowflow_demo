/** Shared mountain/forest-road inspection with the world's lighting and post pipeline. */
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import '@babylonjs/core/Engines/WebGPU/Extensions/index';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector2, Vector3, Matrix } from '@babylonjs/core/Maths/math.vector';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders/glTF';
import { registerShaders } from '../shaders/registry.ts';
import { S } from '../core/settings.ts';
import { whenReady } from '../core/gpuUtil.ts';
import { Sky } from '../render/sky.ts';
import { ShadowSystem } from '../render/shadows.ts';
import { DepthPass } from '../render/depthPass.ts';
import { PostChain } from '../post/postChain.ts';
import { DesertProps } from '../world/desertProps.ts';
import { flyMovement } from './flyMovement.js';

const canvas = document.getElementById('view');
const status = document.getElementById('status');
const forestRoad = document.body.dataset.viewer === 'forest-road';
const cameraHome = { position: new Vector3(620, 310, -650), target: new Vector3(0, 65, 0), speed: 80 };

/** Bake the complete imported hierarchy before fitting the normalized asset to world units. */
async function loadMountain(scene, materials, shadows, depth, use4k = false) {
    const file = use4k ? 'snowy_mountain_-_terrain_4k.glb' : 'snowy_mountain_-_terrain.glb';
    const container = await LoadAssetContainerAsync(`${import.meta.env.BASE_URL}assets/exalted/${file}`, scene);
    const parts = container.meshes.filter(mesh => mesh.getTotalVertices() && mesh.material).map(source => {
        const data = VertexData.ExtractFromMesh(source, true, true);
        data.transform(source.computeWorldMatrix(true));
        return { source, data };
    });
    if (!parts.length) throw new Error('Mountain GLB contains no renderable terrain.');
    const min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const { data } of parts) for (let i = 0; i < data.positions.length; i += 3) {
        min.x = Math.min(min.x, data.positions[i]); max.x = Math.max(max.x, data.positions[i]);
        min.y = Math.min(min.y, data.positions[i + 1]); max.y = Math.max(max.y, data.positions[i + 1]);
        min.z = Math.min(min.z, data.positions[i + 2]); max.z = Math.max(max.z, data.positions[i + 2]);
    }
    const scale = 1000 / Math.max(max.x - min.x, max.z - min.z);
    const fit = Matrix.Translation(-(min.x + max.x) / 2, -min.y, -(min.z + max.z) / 2)
        .multiply(Matrix.Scaling(scale, scale, scale));
    let triangles = 0;
    const meshes = [];
    for (const { source, data } of parts) {
        data.transform(fit);
        const mesh = new Mesh(`mountain:${source.name}`, scene);
        // The current variant remains visible until this one has compiled.
        mesh.setEnabled(false);
        meshes.push(mesh);
        data.applyToMesh(mesh);
        mesh.renderingGroupId = 1;
        mesh.isPickable = false;
        mesh.sideOrientation = source.sideOrientation;
        const batch = { mesh, sourceMaterial: source.material, distance: 1000000,
            windEnabled: false, windBounds: new Vector2(0, 1), instanced: false };
        mesh.material = materials.makeMaterial(batch);
        const shadowMaterials = Array.from({ length: 3 }, () => materials.makeMaterial(batch, 'PROP_SHADOW'));
        shadows.registerCaster(mesh, index => shadowMaterials[index]);
        depth.registerCaster(mesh, materials.makeMaterial(batch, 'PROP_PREPASS'));
        triangles += mesh.getTotalIndices() / 3;
    }
    return { triangles, meshes, container, height: (max.y - min.y) * scale };
}

/** Create an unconstrained fly camera; movement is time based and mouse look requires pointer lock. */
function installControls(camera, onReset) {
    const keys = new Set();
    let speed = cameraHome.speed;
    const reset = () => {
        keys.clear();
        camera.position.copyFrom(cameraHome.position);
        camera.setTarget(cameraHome.target);
        onReset();
    };
    reset();
    document.getElementById('reset').addEventListener('click', reset);
    document.getElementById('speed').addEventListener('input', event => {
        speed = Number(event.target.value);
        document.getElementById('speed-value').textContent = String(speed);
    });
    canvas.addEventListener('click', () => {
        canvas.focus();
        canvas.requestPointerLock()?.catch(error => { status.textContent = error.message; });
    });
    document.addEventListener('pointerlockchange', () => keys.clear());
    window.addEventListener('blur', () => keys.clear());
    window.addEventListener('keydown', event => {
        if (document.pointerLockElement !== canvas) return;
        if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
            event.preventDefault(); keys.add(event.code);
        }
    });
    window.addEventListener('keyup', event => keys.delete(event.code));
    document.addEventListener('mousemove', event => {
        if (document.pointerLockElement !== canvas) return;
        camera.rotation.y += event.movementX * .002;
        camera.rotation.x = Math.max(-1.5, Math.min(1.5, camera.rotation.x + event.movementY * .002));
    });
    const move = dt => {
        const [x, y, z] = flyMovement(keys, speed, dt);
        camera.position.addInPlace(camera.getDirection(Vector3.Right()).scale(x));
        camera.position.addInPlace(camera.getDirection(Vector3.Forward()).scale(z));
        camera.position.y += y;
    };
    move.reset = reset;
    move.setSpeed = value => { speed = value; };
    return move;
}

/** Initialize shared rendering in dependency order and update the camera before temporal jitter. */
async function boot() {
    if (!navigator.gpu) throw new Error('This page requires a browser with WebGPU support.');
    S.showMountains = false;
    S.dof = false;
    if (forestRoad) {
        // The forest's darker albedo needs more exposure than the snow viewer.
        // Adjust scene exposure so foliage keeps its authored colors and shading.
        const exposure = document.getElementById('exposure');
        S.exposure = Number(exposure.value);
        exposure.addEventListener('input', () => {
            S.exposure = Number(exposure.value);
            document.getElementById('exposure-value').textContent = S.exposure.toFixed(3);
        });
    }
    const engine = new WebGPUEngine(canvas, { antialias: false, stencil: false, powerPreference: 'high-performance' });
    await engine.initAsync();
    engine.setHardwareScalingLevel(1 / S.resolutionScale);
    registerShaders();
    const scene = new Scene(engine);
    scene.clearColor = new Color4(.02, .03, .05, 1);
    scene.setRenderingAutoClearDepthStencil(1, false);
    scene.setRenderingAutoClearDepthStencil(2, false);
    const camera = new FreeCamera('mountain-camera', Vector3.Zero(), scene);
    camera.inputs.clear();
    camera.minZ = .2; camera.maxZ = 4000;
    scene.activeCamera = camera;
    let post;
    const move = installControls(camera, () => post?.resetHistory());
    const sky = new Sky(scene);
    sky.mesh.renderingGroupId = 0;
    await sky.solve();
    const shadows = new ShadowSystem(scene);
    const depth = new DepthPass(scene);
    // Reuse the world's GLB material adapter, without loading desert props or their LOD batches.
    const materials = new DesertProps(scene, {}, sky, shadows, depth);
    status.textContent = forestRoad ? 'Loading forest geometry and texturesР Р†Р вЂљР’В¦' : 'Loading mountain geometry and textureР Р†Р вЂљР’В¦';
    let mountain = forestRoad
        ? await (await import('./forestRoadModel.js')).loadForestRoad(scene, materials, shadows, depth)
        : await loadMountain(scene, materials, shadows, depth);
    if (forestRoad) {
        cameraHome.position.copyFrom(mountain.cameraPosition);
        cameraHome.target.copyFrom(mountain.cameraTarget);
        camera.maxZ = mountain.far;
        move.reset();
        const speed = document.getElementById('speed');
        speed.min = '0.5'; speed.max = String(Math.max(20, mountain.speed * 5)); speed.step = '0.5';
        speed.value = String(Math.round(mountain.speed * 2) / 2);
        move.setSpeed(Number(speed.value));
        document.getElementById('speed-value').textContent = speed.value;
    }
    const variants = new Map([[false, mountain]]);
    let active4k = false;
    shadows.setHeightBounds(mountain.minHeight ?? 0, mountain.height);
    for (const mesh of mountain.meshes) mesh.setEnabled(true);
    post = new PostChain(scene, camera, depth, sky);
    const effectKeys = ['taa', 'ssr', 'bloom', 'showLightShafts', 'grain', 'sharpen'];
    const worldEffects = Object.fromEntries(effectKeys.map(key => [key, S[key]]));
    document.getElementById('post-effect').addEventListener('change', event => {
        const selected = event.target.value;
        // Keep the target layout fixed while isolating effect contributions.
        // Tone mapping and atmosphere stay unchanged for a useful visual comparison.
        for (const key of effectKeys) S[key] = selected === 'full' ? worldEffects[key] : key === selected;
        document.getElementById('taa').checked = S.taa;
        scene.postProcessesEnabled = true;
        document.getElementById('post-processing').checked = true;
        document.getElementById('taa').disabled = false;
        post.resetHistory();
    });
    // Bypass the entire chain for diagnosis. Effect-specific toggles still run
    // its render targets and therefore cannot rule out a compositing problem.
    document.getElementById('post-processing').addEventListener('change', event => {
        scene.postProcessesEnabled = event.target.checked;
        camera.unfreezeProjectionMatrix();
        post.resetHistory();
        document.getElementById('taa').disabled = !scene.postProcessesEnabled;
    });
    document.getElementById('sky-visible').addEventListener('change', event => {
        sky.mesh.setEnabled(event.target.checked);
        post.resetHistory();
    });
    let shadowsEnabled = true;
    const shadowSplits = shadows.splits.slice();
    document.getElementById('shadows').addEventListener('change', event => {
        shadowsEnabled = event.target.checked;
        post.resetHistory();
    });
    document.getElementById('taa').addEventListener('change', event => {
        S.taa = event.target.checked;
        post.resetHistory();
    });
    status.textContent = 'Compiling world shadersР Р†Р вЂљР’В¦';
    shadows.update(camera, sky.sunDir);
    sky.render({ camera }, 0);
    materials.update(camera.position, camera.position, true);
    await materials.warmUp();
    await whenReady(sky.material, 'mountain sky', [sky.mesh, false]);
    // materials.warmUp already compiles depth variants with the correct instance flag.
    post.update(0, 0, 500);
    for (const pass of post.passes) await whenReady(pass, `mountain:${pass.name}`);
    let resizePending = true, time = 0;
    window.addEventListener('resize', () => { resizePending = true; });
    engine.runRenderLoop(() => {
        if (resizePending) { engine.resize(); resizePending = false; }
        const dt = Math.min(engine.getDeltaTime() / 1000, .05);
        time += dt;
        move(dt);
        // Fit shadows to the real camera, not TAA's changing subpixel projection.
        // Otherwise temporal jitter can move a cascade across its texel snap boundary.
        camera.unfreezeProjectionMatrix();
        camera.getViewMatrix(true);
        camera.getProjectionMatrix(true);
        shadows.update(camera, sky.sunDir);
        shadows.splits.set(shadowsEnabled ? shadowSplits : [0, 0, 0, 0]);
        if (scene.postProcessesEnabled) post.update(dt, 0, 500);
        sky.render({ camera }, time);
        materials.update(camera.position, camera.position, false, dt);
        scene.render();
        // Raw frames neither fill history nor advance its validity. The bypass
        // also leaves the camera unjittered for a clean geometry-only comparison.
        if (scene.postProcessesEnabled) post.endFrame();
    });
    const showReady = () => {
        status.textContent = `Ready Р вЂ™Р’В· ${forestRoad ? 'Forest road' : active4k ? '4K' : 'Original'} Р вЂ™Р’В· ${mountain.triangles.toLocaleString()} triangles`;
    };
    showReady();
    const modelToggle = document.getElementById('mountain-4k');
    if (modelToggle) modelToggle.disabled = false;
    modelToggle?.addEventListener('change', async () => {
        const use4k = modelToggle.checked;
        modelToggle.disabled = true;
        status.textContent = `Loading ${use4k ? '4K' : 'original'} mountainР Р†Р вЂљР’В¦`;
        try {
            let next = variants.get(use4k);
            if (!next) {
                next = await loadMountain(scene, materials, shadows, depth, use4k);
                materials.update(camera.position, camera.position, true);
                await materials.warmUp();
                // Cache both variants for instant comparisons; disabled meshes
                // are skipped by beauty, shadow and depth render lists alike.
                variants.set(use4k, next);
            }
            for (const mesh of mountain.meshes) mesh.setEnabled(false);
            for (const mesh of next.meshes) mesh.setEnabled(true);
            mountain = next;
            active4k = use4k;
            shadows.setHeightBounds(0, mountain.height);
            post.resetHistory();
            showReady();
        } catch (error) {
            modelToggle.checked = active4k;
            status.textContent = `Model switch failed: ${error.message}`;
            console.error('[exalted mountain]', error);
        } finally {
            modelToggle.disabled = false;
        }
    });
    window.addEventListener('pagehide', () => engine.stopRenderLoop(), { once: true });
}

boot().catch(error => {
    console.error('[exalted mountain]', error);
    status.textContent = `Unable to start: ${error.message}`;
});
