import { test, expect } from '@playwright/test';

test('desert props preserve placement, use bounded instance LODs, and disappear outside the desert', async ({ page }, info) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('/');
    await page.waitForFunction(() => globalThis.SNOWFLOW, null, { timeout: 120000 });
    await page.waitForTimeout(1100);
    const state = await page.evaluate(() => {
        const { desertProps: p, scene } = SNOWFLOW;
        return {
            batches: p.batches.length, total: p.audit.primitiveInstances,
            error: p.audit.transformError, floating: p.audit.floatingOver20cm,
            visible: p.visibleInstances, triangles: p.triangles,
            near: p.batches.reduce((n,b) => n+b.nearCount,0),
            far: p.batches.reduce((n,b) => n+b.farCount,0),
            lods: p.batches.every(b => b.far.getTotalIndices() < b.mesh.getTotalIndices()),
            ground: scene.meshes.some(m => m.name === 'Ground'),
            meshes: scene.meshes.length,
        };
    });
    expect(state.batches).toBe(23);
    expect(state.total).toBe(15946); // 15,909 placements; 37 have two material primitives.
    expect(state.error).toBeLessThan(1e-5);
    expect(state.floating).toBe(0);
    expect(state.ground).toBe(false);
    expect(state.meshes).toBeLessThan(150);
    expect(state.visible).toBeGreaterThan(100);
    expect(state.triangles).toBeLessThan(500000);
    expect(state.near).toBeGreaterThan(0);
    expect(state.far).toBeGreaterThan(state.near);
    expect(state.near + state.far).toBe(state.visible);
    expect(state.lods).toBe(true);
    await page.screenshot({path:info.outputPath('desert-spawn.png')});

    // Walk into the authored planting behind the road fork, exercising moving buffers.
    await page.locator('#view').focus();
    await page.keyboard.down('KeyS');
    await page.waitForTimeout(6500);
    await page.keyboard.up('KeyS');
    await page.waitForTimeout(300);
    const moved = await page.evaluate(() => ({
        z: SNOWFLOW.character.position.z,
        groundError: Math.abs(SNOWFLOW.character.position.y - SNOWFLOW.terrain.heightAt(SNOWFLOW.character.position.x,SNOWFLOW.character.position.z)),
        finite: SNOWFLOW.desertProps.batches.every(b => b.visible.every(Number.isFinite) && b.farVisible.every(Number.isFinite)),
    }));
    expect(moved.z).toBeGreaterThan(610);
    expect(moved.groundError).toBeLessThan(.15);
    expect(moved.finite).toBe(true);
    await page.screenshot({path:info.outputPath('desert-plants-close.png')});
    await page.locator('[data-spawn="C5"]').click();
    await expect.poll(() => page.evaluate(() => SNOWFLOW.desertProps.visibleInstances)).toBe(0);
    await page.locator('[data-spawn="desert-start"]').click();
    await expect.poll(() => page.evaluate(() => SNOWFLOW.desertProps.visibleInstances)).toBe(state.visible);
    expect(errors).toEqual([]);
});
