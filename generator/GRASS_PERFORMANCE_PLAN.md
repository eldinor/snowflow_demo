# Grass Performance Page Plan

## Purpose

Create an isolated `/generator/grass-performance.html` page for developing and
measuring dense grass before it is integrated into the playable Exalted world.
The page must use the generated world's authoritative height and biome fields,
the same coordinate system, and rendering conventions that can later be moved
into the main application without rewriting the grass system.

The visual target is dense, responsive grass with an AAA feeling at walking
distance. The performance target is stable frame pacing on the project's
WebGPU baseline rather than the largest possible instance count.

## Reference

The initial design is informed by Barthélémy Paléologue's MIT-licensed
[AssetScattering](https://github.com/BarthPaleologue/AssetScattering) project:

- procedurally generated blade meshes;
- thin-instance patches;
- uniform barycentric scattering over terrain triangles;
- random rotation and scale;
- optional alignment to terrain normals;
- root-pinned wind bending and player interaction;
- patch-level LOD selection.

Retain the AssetScattering copyright and MIT notice for any adapted code. Do not
assume its bundled demonstration models have suitable provenance or production
quality; Exalted grass should use our own procedural geometry and materials.

## Scope of the First Page

The benchmark will render only terrain, grass, sky, lighting, shadows, fog, and
a simple camera/player interaction proxy. Trees, bushes, gameplay, water,
deformation, and the avatar are outside the first benchmark. Their exclusion
keeps grass cost and visual behavior measurable.

The page will offer two camera modes:

1. Ground camera for judging density, silhouettes, lighting, wind, and LOD
   transitions at player height.
2. Free overview camera for inspecting patch coverage, biome boundaries,
   exclusions, and streaming behavior.

## Portable Architecture

Keep the implementation under `generator/grass/` with no dependency on page DOM
elements. The page entry point owns controls and statistics; the grass system
owns placement, patch streaming, geometry, materials, and disposal.

Suggested files:

```text
generator/
  grass-performance.html
  grass/
    main.ts
    GrassSystem.ts
    GrassPatch.ts
    GrassPlacement.ts
    GrassGeometry.ts
    GrassMaterial.ts
    grass.vertex.wgsl
    grass.fragment.wgsl
    grassTypes.ts
    README.md
```

`GrassSystem` should accept the scene, cameras, height sampler, biome sampler,
world seed, and lighting data through typed interfaces. It must not import the
benchmark UI. This makes later integration into `src/main.ts` mechanical.

## Placement

Use deterministic world-space cells, not random generation tied to patch load
order. A cell's seed must produce the same position, rotation, size, stiffness,
and color whenever its patch is rebuilt.

Candidate density is controlled by:

- grassland biome weight;
- forest and wetland secondary weights;
- terrain slope;
- elevation and moisture;
- road clearance;
- lake, river, and shoreline masks;
- landmark clearance;
- a configurable density multiplier.

Sample the authoritative baked height for every accepted candidate. Estimate its
normal from the same height field so rendered blade roots remain attached to the
terrain at every terrain LOD.

Start with 16 m grass patches nested inside the existing 32 m world chunks.
Keep patch size configurable at 8, 16, and 32 m for comparison.

The first implementation should generate deterministic placement buffers on the
CPU. This matches the generator package, is simple to validate, and avoids GPU
readback. Add direct GPU generation only if measurements show placement or patch
creation is a material bottleneck.

## Blade Geometry

Create three representations from shared procedural parameters:

| Level | Range | Geometry | Purpose |
| --- | ---: | --- | --- |
| Near | 0–22 m | 4 curved sections, tapered tip | Silhouette and interaction |
| Mid | 22–55 m | One tapered triangle | Dense low-cost coverage |
| Far | 55–100 m | Small crossed clump/card | Preserve field mass |
| Ground | Beyond 100 m | Terrain material only | No grass geometry |

Expose ranges in the benchmark. Apply hysteresis or a short dithered transition
band so camera motion does not repeatedly swap patches or reveal a hard ring.

Generate at least four blade/clump variants. Variation should include height,
width, initial lean, hue, dry-tip amount, stiffness, and orientation. Keep these
as compact per-instance attributes or deterministically reconstruct them from an
instance seed in the shader.

## Rendering and Material

Use one thin-instanced draw per visible patch and grass representation. Keep
near, mid, and far prototypes resident; changing LOD should switch visibility or
instance counts without cloning geometry or reallocating buffers each frame.

The grass shader should support:

- two-sided lighting without making back faces uniformly bright;
- root darkening to approximate dense self-occlusion;
- green-to-dry tip variation;
- Exalted sun direction and radiance;
- Exalted sky illumination;
- terrain shadows;
- fog and aerial perspective;
- distance-aware alpha/dither treatment for far cards;
- optional shadow casting for near grass only.

Avoid alpha-tested photo cards for individual near blades. Geometry supplies a
cleaner silhouette and avoids alpha overdraw. Far clumps may use cards after the
near and mid versions are measured.

## Wind and Interaction

Use the project's existing wind direction, strength, speed, gust scale, and
turbulence concepts. Wind displacement is pinned at the root and increases
toward the blade tip.

Build wind from three bands:

1. broad traveling gusts shared across the landscape;
2. medium directional variation per patch;
3. small tip flutter with per-instance phase and stiffness.

Fade tip flutter by screen-space footprint so it cannot create distant shimmer
or moiré. Do not sample high-frequency motion for far cards.

Support a small interaction array for the benchmark proxy. The nearest blades
bend away from its position with a soft radius and recover over time. This API
should later accept avatar feet, landing impulses, and spell effects.

## Streaming and LOD

Maintain a camera-centered active patch set. Patch operations use a bounded work
queue with a configurable creation budget per frame. Reuse patch objects and
typed arrays through pools.

Frustum-cull patches before submitting grass. Distance culling should use patch
bounds, while terrain and biome rejection happens during placement generation.
Changing density should preserve a nested deterministic subset so grass does not
jump to unrelated positions.

Do not copy AssetScattering's LOD behavior that clones and recreates instance
meshes during camera movement. Its own documentation notes possible frame drops
for large thin-instance patches. Exalted should keep prototype meshes and patch
buffers stable.

## Benchmark UI

Use a compact HTML panel with:

- grass enabled;
- patch size;
- density multiplier;
- near, mid, and far distances;
- near blade sections;
- blade height and width;
- terrain-normal alignment;
- wind strength, speed, gust scale, and flutter;
- interaction enabled and radius;
- grass shadows and shadow distance;
- freeze streaming;
- freeze wind;
- visualization mode: final, patches, LOD, biome weight, exclusions, overdraw;
- reset camera;
- record ten-second measurement;
- download latest measurement.

## Live Measurements

Display and record:

- frame median and p95;
- approximate FPS;
- CPU grass update time;
- patch generation time and queue length;
- active, visible, and pooled patches;
- instances by near, mid, and far representation;
- visible grass triangles;
- grass draw calls, including shadow passes;
- placement rejection counts by biome, slope, road, water, and landmark;
- GPU timing when Babylon and the adapter expose reliable timestamps;
- camera position, resolution, render scale, and selected settings.

Measurements must label CPU-only and GPU-inclusive values accurately. Record the
same camera path and resolution when comparing configurations.

## Stages

### Stage 1 — Isolated page and authoritative terrain

- Add the page, cameras, basic UI, and measurements.
- Load the generated height and biome fields.
- Reuse the generated terrain renderer and Grass 1 as the default camera target.
- Add patch and biome debug views.

### Stage 2 — Deterministic placement

- Implement 16 m patches and world-cell seeds.
- Ground candidates on the baked height field.
- Apply grassland, slope, road, water, shoreline, and landmark rules.
- Verify stable placement across reloads and patch unload/reload cycles.

### Stage 3 — Near and mid grass

- Generate four-section and single-triangle blades.
- Add thin-instance buffers and stable patch reuse.
- Add distance LOD with hysteresis or dithering.
- Establish baseline density and performance measurements.

### Stage 4 — Exalted material and wind

- Integrate sun, sky, shadows, fog, and aerial perspective.
- Add root occlusion, color variation, gusts, and tip flutter.
- Add screen-space wind filtering to prevent shimmer.

### Stage 5 — Far coverage and interaction

- Add far clumps/cards if they outperform mid blades at useful quality.
- Add interaction proxy bending and recovery.
- Tune transitions so no circular LOD boundary is visible.

### Stage 6 — Performance pass

- Profile draw calls, vertex cost, fragment overdraw, buffer memory, streaming,
  and shadow cost.
- Compare 8, 16, and 32 m patches.
- Determine default density and quality presets.
- Capture repeatable ten-second benchmark records.

### Stage 7 — Main-world integration

- Move `GrassSystem` unchanged into the runtime composition root.
- Connect avatar interaction and world wind settings.
- Connect biome and exclusion data through the same typed interfaces.
- Stream grass with other 32 m world content.
- Keep the performance page as a regression benchmark.

## Acceptance Criteria

- Grass is dense and clearly three-dimensional at walking distance.
- No visible square patch borders or circular LOD ring during normal movement.
- No floating roots, grass in water, or grass through roads and landmarks.
- Wind remains spatially coherent without synchronized blade motion.
- Fine motion and geometry do not shimmer or produce moiré at distance.
- Placement is deterministic across reloads and streaming cycles.
- Camera movement does not cause allocation spikes or noticeable frame hitches.
- The system holds the agreed median and p95 frame budget at the reference
  resolution and camera route.
- Integration into the main world requires composition and data wiring rather
  than rewriting placement or rendering logic.

## Recommended First Implementation

Begin with Stage 1 through Stage 3 using CPU-authored deterministic placement,
16 m patches, four-section near blades, single-triangle mid blades, and no far
cards. This is the smallest implementation that can answer the important
questions about density, LOD transitions, grounding, draw calls, and frame
pacing before shader polish increases complexity.
