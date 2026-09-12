import { test, expect } from '@playwright/test';

test('sand and snow deform locally with raised rims, grounded readback and hard-surface masks', async ({ page }, info) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('/');
    await page.waitForFunction(() => globalThis.SNOWFLOW, null, { timeout: 120000 });
    await page.waitForTimeout(1100);
    const depths = [];
    for (const id of ['desert-start', 'C5']) {
        await page.locator(`[data-spawn="${id}"]`).click();
        await page.waitForTimeout(250);
        const point = await page.evaluate((id) => {
            const t = SNOWFLOW.terrain, ch = SNOWFLOW.character;
            // Desert Start is on the authored road fork. Test loose sand beside it.
            const x = ch.position.x + (id === 'desert-start' ? -5 : 2), z = ch.position.z;
            t.deform.brush(x, z, 0.7, 0.32, 0.16, 0.9, 0, 0, 1, 0);
            return { x, z, weights: [...t.heightfield.weightsAt(x, z)], native: t.heightfield.heightAt(x, z) };
        }, id);
        await expect.poll(() => page.evaluate(({ x, z }) => SNOWFLOW.terrain.groundProbe.heightAt(x, z), point)).toBeLessThan(-0.05);
        const result = await page.evaluate(({ x, z }) => {
            const t = SNOWFLOW.terrain;
            let rim = 0;
            for (let r = 0.65; r <= 1; r += 0.025) rim = Math.max(rim, t.groundProbe.heightAt(x + r, z));
            return {
                depth: t.groundProbe.heightAt(x, z), rim, height: t.heightAt(x, z),
                probeError: t.groundProbe.error,
                source: t.heightfield.data.indices.length / 3,
                partition: t.mesh.getTotalIndices() / 3 + t.local.triangleCount,
                detailTriangles: t.local.mesh.metadata.triangles,
            };
        }, point);
        expect(result.rim).toBeGreaterThan(0.015);
        expect(result.partition).toBe(result.source);
        expect(result.detailTriangles).toBeGreaterThan(1000);
        expect(result.height).toBeCloseTo(point.native + result.depth, 3);
        expect(result.probeError).toBeUndefined();
        expect(point.weights[id === 'C5' ? 0 : 1]).toBeGreaterThan(0.9);
        depths.push(result.depth);
        await page.locator('#view').focus();
        const key = id === 'desert-start' ? 'KeyS' : 'KeyW';
        await page.keyboard.down(key);
        await page.waitForTimeout(3000);
        await page.keyboard.up(key);
        await page.waitForTimeout(400);
        await page.screenshot({ path: info.outputPath(`${id}-footprints.png`) });
    }
    expect(Math.abs(depths[0])).toBeLessThan(Math.abs(depths[1]) * 0.75);
    await page.locator('[data-spawn="C3"]').click();
    await page.waitForTimeout(250);
    const hard = await page.evaluate(() => {
        const t = SNOWFLOW.terrain, p = SNOWFLOW.character.position;
        t.deform.brush(p.x, p.z, 1, 0.4, 0.2, 1, 0, 0, 1, 0);
        return { weights: [...t.heightfield.weightsAt(p.x, p.z)], brushes: t.deform._brushCount };
    });
    expect(hard.weights[0] + hard.weights[1]).toBeLessThan(0.01);
    expect(hard.brushes).toBe(0);
    expect(errors).toEqual([]);
});
