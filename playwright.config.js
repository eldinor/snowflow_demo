import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/browser",
    timeout: 180_000,
    workers: 1,
    use: {
        channel: process.env.PLAYWRIGHT_CHANNEL,
        baseURL: "http://127.0.0.1:5173",
        viewport: { width: 1280, height: 800 },
        launchOptions: { args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"] },
    },
    webServer: {
        command: "npm run dev -- --host 127.0.0.1",
        url: "http://127.0.0.1:5173",
        reuseExistingServer: true,
    },
});
