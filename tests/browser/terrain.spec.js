import { test, expect } from "@playwright/test";

test("Exalted GLB renders, grounds the avatar, and preserves the snow reference", async ({ page }, testInfo) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto("/");
    await page.waitForFunction(() => globalThis.SNOWFLOW || document.querySelector("#nogpu.show"), null, { timeout: 120_000 });
    expect(await page.locator("#nogpu").isVisible()).toBe(false);
    const state = await page.evaluate(async () => {
        const { terrain, character, rig, S } = SNOWFLOW;
        const { Ray } = await import("/node_modules/@babylonjs/core/Culling/ray.js");
        const { Vector3 } = await import("/node_modules/@babylonjs/core/Maths/math.vector.js");
        const { Mesh } = await import('/node_modules/@babylonjs/core/Meshes/mesh.js');
        const reference = new Mesh('groundingReference', SNOWFLOW.scene);
        terrain.heightfield.data.applyToMesh(reference);
        reference.isVisible = false;
        reference.computeWorldMatrix(true);
        let maxError = 0;
        // Independent Babylon ray/triangle intersections, including asymmetric
        // authored locations, check the runtime spatial index and coordinate frame.
        const probes = [[-65, 604], [218, -251], [-515, -380], [742, 40], [0, 0]];
        for (let n = 0; n < 250; n++) probes.push([-930 + ((n * 379) % 1860), -696 + ((n * 233) % 1392)]);
        for (const [x, z] of probes) {
            const hit = reference.intersects(new Ray(new Vector3(x, 600, z), new Vector3(0, -1, 0)), false);
            if (!hit.hit) throw new Error(`Ray missed terrain at ${x},${z}`);
            maxError = Math.max(maxError, Math.abs(hit.pickedPoint.y - terrain.heightAt(x, z)));
        }
        reference.dispose();
        return {
            source: terrain.mesh.metadata.source,
            triangles: terrain.heightfield.data.indices.length / 3,
            min: terrain.mesh.getBoundingInfo().boundingBox.minimum.asArray(),
            max: terrain.mesh.getBoundingInfo().boundingBox.maximum.asArray(),
            position: character.position.asArray(),
            groundY: terrain.heightAt(character.position.x, character.position.z),
            yaw: rig.yaw, mountains: S.showMountains, maxError,
            sideOrientation: terrain.mesh.sideOrientation,
            sand: terrain.heightfield.weightsAt(character.position.x, character.position.z)[1],
        };
    });
    expect(state.source).toContain("alpha-map.glb");
    expect(state.triangles).toBe(328536);
    expect(state.min[0]).toBeCloseTo(-936);
    expect(state.max[0]).toBeCloseTo(936);
    expect(state.min[2]).toBeCloseTo(-702);
    expect(state.max[2]).toBeCloseTo(702);
    expect(state.position[0]).toBeCloseTo(-65);
    expect(state.position[2]).toBeCloseTo(616);
    expect(state.groundY).toBeCloseTo(5.17, 1);
    expect(state.position[1]).toBeCloseTo(state.groundY, 2);
    expect(state.yaw).toBeCloseTo(Math.PI);
    expect(state.mountains).toBe(false);
    expect(state.sideOrientation).toBe(0);
    expect(state.sand).toBe(1);
    expect(state.maxError).toBeLessThan(0.001);
    await page.screenshot({ path: testInfo.outputPath("exalted-spawn.png") });
    await page.keyboard.down("KeyW");
    await page.waitForFunction(() => SNOWFLOW.character.position.z < 615);
    await page.keyboard.up("KeyW");
    await page.getByRole("button", { name: "The Palecrown, Snow", exact: true }).click();
    await expect.poll(() => page.evaluate(() => Math.abs(SNOWFLOW.rig.pivot.z + 251))).toBeLessThan(1);
    await page.screenshot({ path: testInfo.outputPath("exalted-snow.png") });
    expect(errors).toEqual([]);
});

test("original Snowflow remains available as a visual reference", async ({ page }) => {
    await page.goto("/?terrain=snowflow");
    await page.waitForFunction(() => globalThis.SNOWFLOW || document.querySelector("#nogpu.show"), null, { timeout: 120_000 });
    expect(await page.locator("#nogpu").isVisible()).toBe(false);
    expect(await page.evaluate(() => SNOWFLOW.terrain.exalted)).toBe(false);
    await expect(page.getByRole("navigation", { name: "Spawn locations" })).toBeHidden();
});

test("spawn bar switches named biomes, resets motion and supports keyboard and small screens", async ({ page }, testInfo) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto("/");
    await page.waitForFunction(() => globalThis.SNOWFLOW, null, { timeout: 120_000 });
    const points = [
        ["Desert Start, Desert", -65, 616],
        ["The Palecrown, Snow", 218, -251],
        ["The Long Green, Grassland", -310, 0],
        ["The Thornwood, Forest", -767, 104],
        ["The Ironspine, Mountains", -515, -380],
        ["Lakeside Overlook, Lake", 334, -41],
        ["Stone Gate, Pass", -65, -325],
    ];
    await expect(page.getByRole("button", { name: points[0][0], exact: true })).toHaveAttribute("aria-pressed", "true");
    for (const [name, x, z] of points) {
        // Teleports must work while effects/momentum are live and time is paused.
        await page.evaluate(() => {
            SNOWFLOW.S.freezeTime = true;
            SNOWFLOW.character.velocity.set(10, 0, 12);
            SNOWFLOW.character.surf = 1;
            SNOWFLOW.wake._count = 10;
        });
        const button = page.getByRole("button", { name, exact: true });
        await button.click();
        await expect(button).toHaveAttribute("aria-pressed", "true");
        await expect.poll(() => page.evaluate(([x, z]) => Math.hypot(SNOWFLOW.character.position.x - x, SNOWFLOW.character.position.z - z), [x, z])).toBeLessThan(0.01);
        const state = await page.evaluate(() => {
            const { character: ch, figure, terrain, rig, wake, spray } = SNOWFLOW;
            let clothDistance = 0;
            for (const panel of figure.panels) for (let i = 0; i < panel.pos.length; i += 3) {
                clothDistance = Math.max(clothDistance, Math.hypot(panel.pos[i] - ch.position.x, panel.pos[i + 1] - ch.position.y, panel.pos[i + 2] - ch.position.z));
            }
            return {
                heightError: ch.position.y - terrain.heightAt(ch.position.x, ch.position.z),
                speed: ch.velocity.length(), surf: ch.surf,
                cameraDistance: Math.hypot(rig.pivot.x - ch.position.x, rig.pivot.z - ch.position.z),
                cameraClearance: rig.camera.position.y - terrain.heightAt(rig.camera.position.x, rig.camera.position.z),
                clothDistance, wake: wake._count, particles: spray.liveCount,
                finite: [...ch.acceleration.asArray(), ...figure.figure.skin].every(Number.isFinite),
            };
        });
        expect(state.heightError).toBeCloseTo(0, 3);
        expect(state.speed).toBe(0);
        expect(state.surf).toBe(0);
        expect(state.cameraDistance).toBeLessThan(0.01);
        expect(state.cameraClearance).toBeGreaterThan(0);
        expect(state.clothDistance).toBeLessThan(4);
        expect(state.wake).toBe(0);
        expect(state.particles).toBe(0);
        expect(state.finite).toBe(true);
    }
    const desert = page.getByRole("button", { name: points[0][0], exact: true });
    await desert.focus();
    await page.keyboard.press("Enter");
    await expect(desert).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Digit3");
    expect(await page.evaluate(() => SNOWFLOW.spells.activeCount)).toBe(0);
    await page.evaluate(() => { SNOWFLOW.S.freezeTime = false; });
    await page.screenshot({ path: testInfo.outputPath("spawn-bar-desktop.png") });
    await page.setViewportSize({ width: 600, height: 800 });
    const gate = page.getByRole("button", { name: "Stone Gate, Pass", exact: true });
    await gate.scrollIntoViewIfNeeded();
    await gate.click();
    await expect(gate).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("spawn-bar-small.png") });
    expect(errors).toEqual([]);
});
