# Review of the Blender-to-Babylon Technical Brief

## Scope

The technical brief describes the production pipeline for the **authored Exalted
map**. It does not describe the experimental procedural world under
`generator/`.

The two systems should remain separate:

| Authored Exalted world | Procedural generator |
| --- | --- |
| Geography and terrain are authored in Blender. | Geography begins with generated height, biome, hydrology, road, and placement fields. |
| Uses the dimensions and landmarks defined by the production map brief. | Currently uses its own exact 2 km by 2 km world contract. |
| Terrain is exported as runtime chunks and distant proxies. | Terrain currently uses a GPU height field and clipmap renderer. |
| Important prop placement originates in Blender. | Placement is deterministic and field-driven. |
| This is the production world addressed by the brief. | This is an isolated research and tooling project. |

Generator decisions should not silently change the authored-map contract. Useful
technology may be transferred between the systems only through an explicit
integration decision.

## Overall Assessment

The brief is a strong production and handoff contract. Its central division is
correct: Blender owns authored world assets and placement intent, while Babylon
owns the live, scalable runtime. This avoids delivering one enormous populated
scene that the browser must load and render at once.

The strongest parts are:

- real-world metre scale and a documented coordinate convention;
- reusable asset kits instead of duplicated runtime objects;
- chunked terrain delivery and distant proxies;
- separate collision meshes and gameplay anchors;
- stable naming, pivots, versions, and manifests;
- runtime-controlled LOD distances and quality levels;
- a measured vertical slice before full production;
- validation in the real Babylon application rather than Blender renders alone;
- explicit performance and first-load targets;
- an asset register that includes counts, dependencies, sources, and licenses.

These requirements fit the existing authored Exalted work around `alpha-map`,
desert props, forests, water, spawn locations, terrain collisions, atmosphere,
and runtime interaction.

## Blender and Babylon Responsibilities

The ownership table in the brief should become the working production rule.

Blender should provide:

- authored terrain shape and biome boundaries;
- terrain chunks and their aligned LOD meshes;
- cliffs, spires, overhangs, landmarks, and vista geometry;
- reusable trees, bushes, grass clumps, rocks, and props;
- important authored placements and scatter intent;
- UVs, PBR source textures, masks, and material references;
- simplified collision proxies;
- spawn, Cube, traversal, portal, audio, and camera anchors;
- clean source scenes and deterministic export collections.

Babylon should provide:

- chunk loading, unloading, and predictive streaming;
- LOD selection and device quality tiers;
- thin instances, procedural scatter, culling, and impostors;
- final terrain and prop shaders;
- sun, sky, atmosphere, fog, water, shadows, and post-processing;
- collision activation near the player;
- movement, swimming, flight, spells, triggers, UI, and state;
- selection and spawning of the active Cube at an authored anchor;
- performance instrumentation and runtime validation.

The key handoff principle is useful: authored identity and placement intent begin
in Blender; session-dependent, interactive, or quality-scaled behavior belongs
in Babylon.

## Scale and Coordinate Calibration

The calibration package should be the first production deliverable. It should
contain:

- a two-metre reference figure;
- a ten-metre cube;
- North and East arrows;
- a ground plane at zero elevation;
- one named spawn anchor;
- one representative PBR material;
- one render mesh with a separate collision proxy.

The package must be loaded without corrective rotations or arbitrary scaling in
Babylon. The confirmed mapping should be recorded in the repository before
terrain chunks, anchors, or placement datasets are produced.

The final documentation should explicitly record:

- Blender world up and North direction;
- Babylon world up and North direction;
- handedness conversion;
- forward direction for characters and props;
- whether transforms are baked during export;
- anchor rotation interpretation;
- terrain origin and exact authored-world bounds.

## Chunking Strategy

The proposed 250 m by 250 m terrain cell is a good starting point for Blender
authoring and terrain delivery. It should be validated using the vertical slice
before being fixed for the whole map.

Not every runtime system needs the same cell size. A practical hierarchy is:

| System | Starting granularity |
| --- | ---: |
| Blender terrain authoring and export | 250 m |
| Large landmarks and mountain proxies | Independent world assets |
| Prop and tree placement batches | Approximately 32 m |
| Grass patches | Approximately 8-16 m |
| Nearby collision activation | Player-centred runtime range |
| Whole-world vistas | Low-detail proxy or distant landmark set |

This lets terrain stream in artist-friendly packages while smaller vegetation
and collision systems update without loading or rebuilding an entire 250 m
cell.

Terrain borders require a tested seam policy. Shared border samples are
preferable where possible. Skirts may hide small depth gaps, but they should not
be used to conceal mismatched terrain elevations or materials.

## Terrain and LOD

For the authored world, the brief's terrain LOD requirements are appropriate as
a starting point. The exact triangle percentages should remain guidelines rather
than automatic decimation targets. Silhouette, skyline, saddles, plateaus,
shorelines, and navigational forms matter more than reaching a particular
percentage.

Recommended authored-world hierarchy:

- LOD0 for nearby terrain and hero views;
- LOD1 for mid-distance terrain;
- LOD2 where it produces a useful measured benefit;
- a whole-world or landmark proxy for long-distance silhouettes;
- separate cliff, spire, cave, and overhang assets where terrain topology alone
  cannot produce the required form efficiently.

The runtime should select LOD distances. Blender should keep the origin, bounds,
border vertices, and material boundaries consistent between levels.

## Terrain Materials

The material rules are suitable for production:

- metallic-roughness PBR as the interchange baseline;
- mostly 1K and 2K reusable textures;
- selective 4K textures for measured hero needs;
- base color and emissive stored as sRGB;
- normal, roughness, metallic, AO, height, and masks stored as linear data;
- documented channel packing;
- source textures retained separately from KTX2 runtime output;
- macro variation layered over tiled detail;
- decals and instanced breakup near important routes;
- authored masks for biome transitions, snow accumulation, wet shores, and road
  integration.

The runtime test must establish actual texel density in metres. Texture
resolution alone does not define quality; UV scale, anisotropy, normal strength,
macro variation, and viewing distance determine the result.

The desert-to-grass, snow-to-rock, and water-to-shore transitions should be
treated as production features rather than left until final polish.

## Vegetation and Reusable Assets

The brief correctly rejects exporting the forest as more than 21,000 unique
runtime objects. Blender should provide a small prototype library and authored
placement intent. Babylon should convert repeated vegetation to instances or
thin instances grouped into runtime batches.

The current forest prototype has already demonstrated the value of:

- chunked instance batches;
- tree, bush, and grass separation;
- simplified tree collisions;
- distance LOD;
- distant tree cards;
- runtime wind;
- explicit performance measurements.

The production forest will use different tree models, but this architecture can
inform its integration.

Grass should not be restricted to traditional alpha-blended cards. The grass
lab should compare:

- opaque geometric blades near the player;
- optimized imported grass clumps;
- alpha-clipped cards where they provide a measured advantage;
- procedural low-triangle blades at middle distance;
- terrain material coverage beyond geometric grass range.

Alpha blending should be avoided for mass vegetation where alpha clipping or
opaque geometry works. The final choice should be made from GPU timing,
overdraw, shadow cost, and image quality rather than triangle count alone.

## Collision Strategy

The collision recommendations match the current runtime direction:

| Element | Recommended collision |
| --- | --- |
| Terrain | Simplified chunk collision mesh or dedicated sampled surface |
| Trees | Trunk capsule or small box for reachable trees |
| Large rocks | Low-poly convex proxy |
| Small rocks | No collision unless traversal requires it |
| Shrubs and grass | No collision |
| Mountains and boundaries | Simplified blockers or traversal slope rules |
| Water | Surface and boundary data interpreted by Babylon |
| Hero objects | Dedicated named proxies tested with the player capsule |

Collision assets should load independently from distant visual proxies.
Collision should be validated using the actual Exalted controller, including
walking, jumping, flight, swimming, and landing behavior.

## Anchors and Cube Zones

The Cube system is well separated from terrain. Blender should export possible
discovery anchors; Babylon should choose one valid anchor and spawn a standalone
Cube at runtime.

The proposed fields are useful:

- stable anchor ID;
- position and rotation;
- biome;
- safe radius;
- approach direction;
- intended visibility distance;
- ground normal;
- associated route ID.

The same manifest pattern can support spawn points, safe-return positions,
ability triggers, portals, audio zones, and approved cinematic transforms.

Cube requirements in the brief are product requirements for the authored world.
They should not be inferred as requirements for the procedural generator.

## Runtime Manifest

Each authored terrain chunk or standalone world asset should be discoverable
through a versioned manifest. The proposed fields are sufficient for an initial
schema:

- stable ID and URI;
- world-space bounds;
- biome classification;
- neighboring chunks;
- LOD resources or mesh mappings;
- collision resource;
- instance groups and placement datasets;
- anchors;
- version and cache identity.

The manifest should also eventually include:

- coordinate-system version;
- content hash;
- uncompressed and compressed byte sizes;
- material and texture dependencies;
- licensing or provenance reference;
- minimum supported quality tier;
- optional preload priority;
- validation-tool version.

## Performance Targets

The starting targets are useful engineering budgets:

- 1080p baseline;
- 60 FPS on a gaming desktop;
- 30-45 FPS on a representative ordinary laptop;
- approximately 1-3 million visible triangles;
- approximately 200-500 active draw calls;
- 20-50 MB for the application shell and first playable area;
- streamed content kept out of memory until required;
- short, quality-scaled shadow distances;
- distant vistas supported by aggressive LOD and atmosphere.

Triangle count and draw calls are insufficient by themselves. The production
test harness should also record:

- CPU frame median, p95, and p99;
- GPU frame time where reliable timestamps are available;
- beauty-pass and shadow-pass draws and triangles separately;
- transparent or alpha-tested overdraw;
- texture memory and resident buffer memory;
- allocations and GPU uploads during movement;
- chunk request, decode, preparation, and activation times;
- shader variant count and compilation stalls;
- time until the player can move;
- quality tier, resolution, and render scale.

Measurements should use repeatable camera and traversal routes.

## WebGPU and WebGL2

The brief mentions WebGPU with a tested WebGL2 fallback or reduced mode. The
current Exalted application requires WebGPU and uses WGSL rendering systems.

A WebGL2 fallback would be a separate product commitment involving duplicate or
translated shaders, reduced effects, texture-limit handling, validation, and
ongoing QA. Before production, the team should choose one of these contracts:

1. WebGPU is the required baseline.
2. WebGL2 receives a deliberately reduced viewer.
3. Full gameplay and visual parity are required on both APIs, with appropriate
   schedule and testing budget.

The brief should not imply the third option unless that work is funded and
planned.

## Vertical Slice

The vertical-slice requirement is the most important production recommendation
in the brief. One 250 m by 250 m region should combine several real risks:

- terrain material blending;
- repeated vegetation and rocks;
- a major vista;
- terrain and prop collision;
- a road or shoreline transition;
- at least one gameplay anchor;
- final Exalted camera and controller;
- actual chunk loading;
- quality settings and measurement UI.

Approval should be based on the Babylon result on both target hardware classes.
A Blender render cannot validate browser memory, streaming, shader compilation,
grass overdraw, shadows, collision, or frame pacing.

## Decisions to Lock

Before large-scale Blender production, the following should be made explicit:

1. Exact authored-world dimensions and world origin.
2. Blender-to-Babylon coordinate mapping.
3. Terrain authoring and runtime chunk sizes.
4. Terrain border and LOD seam policy.
5. Final player height, capsule, movement, jump, flight, and swimming rules.
6. Alpha time of day, sun direction, weather, and exposure baseline.
7. Water traversal and shoreline behavior.
8. Required terrain, tree, rock, and grass LOD outputs.
9. Texture channel packing and KTX2 conversion pipeline.
10. Anchor schema and exact glTF custom-property names.
11. WebGPU-only or WebGL2 fallback product policy.
12. Reference laptop and desktop hardware.
13. Initial-download and resident-memory budgets.
14. Asset source and license documentation requirements.

## Recommended Immediate Sequence

1. Approve the authored-world dimensions and coordinate contract.
2. Produce and validate the calibration package.
3. Define the first version of the chunk and asset manifest.
4. Select the 250 m vertical-slice region.
5. Inventory existing terrain, forest, desert, water, and prop assets.
6. Prepare a minimal production asset kit with LOD and collision examples.
7. Load the slice through the real Exalted runtime composition.
8. Measure it on the reference laptop and desktop.
9. Revise chunk sizes, LODs, materials, and budgets from evidence.
10. Lock the pipeline before producing the remaining world.

## Document Maintenance

The Markdown export embeds large images as base64 data. For repository use,
images should be stored as separate files and referenced with relative paths.
This keeps reviews, diffs, and source history manageable.

The next brief revision should also state clearly near the title that it applies
to the authored Exalted map and excludes the procedural generator. That single
scope note will prevent production requirements from being applied to the wrong
world system.
