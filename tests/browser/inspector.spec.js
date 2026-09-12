import { test, expect } from '@playwright/test';

test('Inspector loads on demand and toggles on the right', async ({ page }, testInfo) => {
    const errors = [];
    const requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push(request.url()));
    await page.goto('/');
    await page.waitForFunction(() => globalThis.EXALTED, null, { timeout: 120_000 });
    const canvas = await page.locator('#view').boundingBox();
    expect(requests.some(url => /babylonjs_inspector|@babylonjs\/inspector/.test(url))).toBe(false);
    await page.keyboard.press('Control+i');
    const host = page.locator('#inspector-host');
    await expect(host.locator('#babylon-inspector-container')).toBeVisible({ timeout: 90_000 });
    await expect(host).toContainText('Scene Explorer', { timeout: 30_000 });
    const box = await host.boundingBox();
    expect(box.x + box.width).toBe(1280);
    expect(box.width).toBeLessThanOrEqual(460);
    expect(await page.locator('#view').boundingBox()).toEqual(canvas);
    await page.screenshot({ path: testInfo.outputPath('inspector.png') });
    await page.keyboard.press('Control+i');
    await expect(host).toBeHidden();
    await page.keyboard.press('Control+i');
    await expect(host.locator('#babylon-inspector-container')).toBeVisible();
    await expect(host.locator('#babylon-inspector-container')).toHaveCount(1);
    expect(errors).toEqual([]);
});
