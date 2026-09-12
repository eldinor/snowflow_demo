import { defineConfig } from "vite";

export default defineConfig({
    // Prepare the lazy Inspector before serving so its first use does not
    // invalidate Babylon's already loaded development chunks.
    optimizeDeps: { include: ['@babylonjs/inspector'] },
    server: {
        port: 5173,
        strictPort: true,
    },
    build: {
        target: "esnext",
        sourcemap: true,
    },
    // .wgsl imported via ?raw
    assetsInclude: ["**/*.hdr", "**/*.env"],
});
