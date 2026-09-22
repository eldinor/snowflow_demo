# Exalted Grass System

`GrassSystem.ts` is independent of the benchmark DOM. Its constructor accepts
height, biome-weight, and exclusion samplers, so the same class can later be
connected to the generated-world runtime.

The current lab implements the first benchmark slice:

- deterministic 16 m patches around the generated `Grass 1` location;
- authoritative height and biome sampling;
- road and water rejection;
- four-section near blades and triangle mid blades;
- thin-instance buffers grouped by patch;
- distance LOD, procedural wind, and camera interaction;
- live CPU, patch, instance, triangle, draw-call, median, and p95 counters.
- procedural, imported-GLB, and hybrid geometry comparison modes;
- selected normalized LOD2 prototypes from `grass_medium_01_1k.glb`;
- imported variant and per-prototype triangle reporting.

The imported mode deliberately ignores the duplicated `geonodes` meshes and
the source GLB's 1x1 texture. It keeps selected regular LOD2 silhouettes while
using Exalted's common placement, wind, lighting, fog, and color shader. Hybrid
mode uses an imported near prototype and the two-triangle procedural mid blade.

Open `/generator/grass-performance.html` through the Vite development server.
The ground camera uses WASD and mouse look; the overview camera uses orbit
controls.

The next visual pass should add terrain-normal alignment, multiple blade
profiles, coherent gust bands, dry-tip variation, shadow casting for near
patches, and a dithered near/mid transition. The next performance pass should
pool unloaded patches and move generation to a bounded streaming queue before
expanding coverage beyond this fixed test area.
