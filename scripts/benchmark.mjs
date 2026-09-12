import fs from 'node:fs/promises';
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto('http://127.0.0.1:5173/');
    await page.waitForFunction(() => globalThis.EXALTED, null, { timeout: 120000 });
    const results = [];
    for (const id of ['desert-start', 'C5', 'C3', 'C2', 'C6', 'lakeside-overlook', 'stone-gate']) {
        await page.locator(`[data-spawn="${id}"]`).click();
        await page.waitForTimeout(700);
        results.push(await page.evaluate(async (id) => {
            const times = [], draws = [];
            let prev = performance.now();
            while (times.length < 120) {
                await new Promise(requestAnimationFrame);
                const now = performance.now(); times.push(now - prev); prev = now;
                draws.push(EXALTED.perfStats.drawCalls);
            }
            times.sort((a, b) => a - b);
            return { id, medianMs: times[60], p95Ms: times[114], drawCalls: Math.max(...draws), triangles: EXALTED.perfStats.triangles };
        }, id));
    }
    const report = { recorded: new Date().toISOString(), resolution: '1280x800', environment: 'Headless Chrome, WebGPU; presentation frame timing, not GPU timestamps', results };
    await fs.mkdir('reports', { recursive: true });
    await fs.writeFile(`reports/${process.argv[2] || 'terrain-benchmark'}.json`, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
} finally { await browser.close(); }
