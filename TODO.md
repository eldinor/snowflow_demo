# Exalted world integration

## Agreed direction

- Use Exalted's map and descriptions for world layout, biome placement and scale.
- Use the original procedural demo as the avatar and snow-biome visual reference.
- Begin biome work at the main avatar's desert spawn, using the existing desert props and their authored placement.
- Keep `alpha-map.glb` as the terrain. The user explicitly authorised using its visible triangles for grounding because the separate collision mesh is unavailable.

## Source files

The external Exalted directory is readable directly; copying the entire project is unnecessary. Bundle assets in this repository when the app needs them.

- World handoff: `C:\Users\Fiolent23\newrepos\Exalted\Exalted_World_Handoff_2026-09-09\2026-09-09\`
  - `glb\alpha-map.glb`: full-world visual terrain.
  - `glb\exalted_desert.glb`: textured regional ground plus placed desert vegetation and rocks.
  - `README.md`: import conventions, asset provenance and known limitations.
  - `proof\`: reference renders, including spawn and road views.
- Map reference: `C:\Users\Fiolent23\newrepos\Exalted\Exalted_Map_Reference_RevB_2026-09-10\2026-09-10_map-reference\`
  - `Exalted_Map_Reference.html`: interactive map, measurements, biome coverage and scale notes.
  - `places_register.md` / `places_register.json`: 46 named features, positions, dimensions and change dependencies.
  - `README.md`: map conventions and known issues.

## Completed

- [x] Read the Exalted avatar/rendering code and Exalted handoff and map reference.
- [x] Bundle an unchanged copy of `alpha-map.glb` at `public/assets/exalted/alpha-map.glb`; source and bundled SHA-256 hashes match.
- [x] Make Exalted the default terrain, preserving imported geometry, normals, biome colours and metre scale.
- [x] Use the imported triangles for avatar/camera grounding and clamp movement to the rectangular map.
- [x] Place the Exalted avatar at the authored desert spawn, facing north.
- [x] Add an HTML top bar for switching player inspection points: Desert Start (default), The Palecrown, The Long Green, The Thornwood, The Ironspine, Lakeside Overlook and Stone Gate.
- [x] Reset movement, planted feet, cloth, camera history, wake and transient effects when changing spawn. Sample elevation from the imported terrain at every destination.
- [x] Integrate terrain lighting, shadows and depth passes; preserve the loader's front-face convention.
- [x] Apply Exalted snow shading to the near-white snow biome and disable the procedural background mountains in Exalted mode.
- [x] Keep the original procedural demo accessible at `?terrain=procedural`.
- [x] Verify production build, four surface-query/material tests and four browser tests, including grounding comparisons against independent Babylon ray intersections.

## Sand and snow deformation milestone

- [x] Capture frame timings, draw calls and visible triangle counts at all seven spawn points before adding deformation.
- [x] Record the final comparison in `reports/README.md` and paired JSON captures; reduce the detail template from 32 to 24 subdivisions per edge and skip grounding readbacks on hard-only patches.
- [x] Classify soft snow/sand from the actual GLB vertex colours; keep roads, trails and other biomes firm.
- [x] Replace nearby soft source triangles with reusable fine geometry, preserving their original planes and removing those triangles from the coarse mesh to avoid overlap.
- [x] Share GPU displacement across beauty, shadow and depth passes; fade detail from 12 to 16 m around the avatar.
- [x] Reuse Exalted footprint, sliding and spell brushes; sand receives 55% depth, 65% berm height and three-times-faster refill.
- [x] Add warm sand particles and wake shading while retaining Exalted's snow appearance.
- [x] Sample GPU displacement asynchronously for avatar/foot/camera grounding; clear the cached probe on spawn changes.
- [x] Verify negative track depth, positive rims, shallower sand tracks, hard-surface rejection and exact coarse/detail source-triangle partitioning in WebGPU.
- [x] Inspect screenshots of footprints in Desert Start's adjacent sand and The Palecrown's snow.
- [ ] Integrate reflective spell-ice masks into the Exalted reflection prepass.
- [ ] Add persistent track storage if marks must survive leaving the moving simulation window.
- [ ] Profile on target hardware with the actual desert props before choosing final detail and shadow budgets.

Implementation limits: detail uses a 32 × 32 m square around the avatar with a 12–16 m fade; the source patch changes every 8 m. The 128 × 128 grounding probe covers 16 m and reads at most 10 times per second, so new impressions have asynchronous grounding latency. Biome classification follows supplied colours, not missing analytic biome data. Desert Start is now 12 m south of the authored road fork, at chart (65, -616), on loose sand for immediate footprints.

## Map findings

- World dimensions: **1,872 × 1,404 m**, centred on the origin; one unit is one metre, import scale 1.0.
- Chart coordinates: x is east, y is north. Metadata converts to Babylon as **`(-x, height, -y)`**. Imported GLB geometry already receives the loader's coordinate conversion; do not apply the metadata conversion a second time.
- Main spawn: chart **`(65, -604)`**, grid **E0 S6**; Babylon **`(-65, groundHeight, 604)`**, facing north (`-z`). The imported surface is approximately 4.85 m high there.
- Southern desert leads north along the main road into central grassland and toward Stone Gate.
- Forest lies to the east; lake and island to the west; snow occupies the northwestern range and plateau; rocky mountains lie northeast; ocean is beyond the northern ranges.
- Snow plateau / **C5, The Palecrown**: chart **`(-218, 251)`**, approximately **210 × 130 m**, centre elevation about **138 m**.
- Stone Gate: chart **`(65, 325)`**, 929 m horizontally north of spawn.
- C1–C6 are **Cube locations**, not designated player spawn points.
- Main road is 22 m wide, trails 10 m wide, and the snow river 14 m wide. Preserve these authored dimensions unless a change is requested.
- Reference avatar height is 1.8 m, with feet at the origin. Model scale should follow this reference, not movement speed.
- Exalted's documented movement values differ from the current procedural controller: walk 7 m/s, Earth surge 22 m/s and Water flow 24 m/s. These have not been adopted automatically.
- Reference view requirement: the northern ocean should remain hidden from the main spawn.

## Desert GLB findings

- `exalted_desert.glb` is approximately **31.7 MB** and contains **23 mesh definitions, 17 materials and 15,910 nodes**.
- It includes one ground mesh (`Ground_v2`, node `Ground`) and **15,909 placed prop nodes**.
- Existing props include small sand rocks, larger rocks/boulders, scrub and succulent plants, quiver trees and eight saguaro cactus objects.
- Approximately **344 prop origins lie within 55 m of the main spawn**, including small rocks and shrubs close to the starting position. This is an origin-distance count, not a visibility or clearance measurement.
- Placement includes position, rotation and scale. Reuse those authored transforms rather than generating a replacement scatter.
- **The actual file differs from the handoff's instancing description:** inspected `extensionsUsed` lists `KHR_texture_transform` and `KHR_materials_sheen`, not `EXT_mesh_gpu_instancing`. Many nodes reference shared mesh definitions. Verify runtime instancing and draw calls instead of assuming the handoff's stated 23 batches.
- The handoff identifies desert assets as commercially usable: Poly Haven CC0 or in-house assets.
- The regional ground and full-world terrain are separate exports. Prop seating must be checked against the retained `alpha-map.glb`; the handoff also flags historical floating-prop issues on steep slopes.

## Main desert spawn dressing

- [x] Bundle `exalted_desert.glb` and preserve its source/provenance information; SHA-256 matches the external source.
- [x] Import its vegetation and rocks with their materials and authored transforms.
- [x] Exclude its separate ground mesh from rendering and grounding to avoid overlapping terrain; retain `alpha-map.glb` as the ground source.
- [x] Check coordinate alignment and plant/rock seating around spawn against the actual retained terrain and handoff proof images.
- [x] Preserve the existing placement; identify any floating or buried props before making seating adjustments.
- [x] Make the imported materials work with Exalted's lighting and post-processing, including vegetation transparency, shadows and depth passes.
- [x] Measure loading cost, draw calls and frame time. Use shared geometry, instancing and distance culling as appropriate for the actual file structure.
- [x] Review spawn clearance, the north-facing road/mountain-gap view, and movement through the dressed arrival area.
- [ ] Review the 15 nearby rocks whose lowest vertices are buried by more than 0.5 m; the audit does not establish whether that embedding is intentional. No placement adjustments were made.
- [x] Add static collision for boulders/larger rocks, tree trunks and large cacti; keep bushes, leaves and small stones passable.
- [x] Use a spatial grid independent of render culling, continuous movement sweeps and sliding contact; retract the camera at solid props.
- [x] Test high-speed crossings, glancing slides, overlap recovery, exact-contact escape, height separation and camera sweeps; verify actual authored rocks/trunks in WebGPU.
- [x] Verify the collision implementation with ten unit tests, six WebGPU browser tests and the production build.
- [ ] Refine approximate cylinder shapes where needed; add rock step-up/climbing or branch-level collision only if gameplay requires it.

Runtime findings: 23 geometry/material groups represent 15,946 primitive instances (15,909 authored props, with 37 two-material plants). Each group has two geometry detail levels. The spawn selection is 365 primitive instances and 365,594 triangles, compared with 5.9 million prop triangles in the first unrefined distance selection. Imported nodes are disposed after batching. A source-to-instance transformed-vertex comparison found zero error. The seating audit covers 346 nearby material primitives and found no lowest vertices more than 20 cm above ground. Details are in `reports/desert-placement.json`.

Validation: production build, four unit tests and five WebGPU browser tests pass. The new test checks instance/LOD counts, source-transform agreement, ground exclusion, moving instance buffers, continued terrain grounding and desert-prop removal/restoration across biome switches. Screenshots of spawn and nearby planting were inspected.

## Subsequent biome work

- [ ] Refine the desert's ground materials and transitions using the supplied references.
- [x] Apply the regional GLB's `DesertGround` colour/normal textures and roughness to sand on `alpha-map.glb`, retaining deformation and the original UV projection/texture transforms without rendering a second ground mesh.
- [x] Verify planar UV recovery, shared texture bindings on coarse/detail geometry, footprint deformation and snow/reference-mode compatibility. The source texture is red laterite soil with stones; roads keep their existing firm-surface appearance.
- [x] Tune deformation shading separately for textured soil and procedural sand: texture-relative trench/rim colours, rough compacted soil, softened normal detail and snow-only blue cavity tint. Dust and sliding wakes inherit the selected ground appearance.
- [x] Verify texture switching preserves an existing impression's depth and updates both effect materials; inspect sliding screenshots in both modes.
- [x] Integrate Exalted's geometric deformation into Exalted's snow and loose desert sand; preserve the original `?terrain=procedural` reference mode.
- [ ] Develop grassland ground cover, forest vegetation/floor, rocky mountain surfaces, and lake/river/ocean surfaces according to the map.
- [ ] Verify current permission to redistribute forest/mountain assets before bundling them; the September 9 handoff records pending vegetation licence approval.
- [x] Add biome navigation shortcuts using reference place names. These are player inspection destinations; C2/C3/C5/C6 retain their authored meaning as Cube locations.

## Known limitations to retain in planning

- The supplied visual terrain has approximately 4 m spacing and 328,536 triangles. Grounding now follows that visible surface, not the unavailable finer collision/analytic surface.
- Terrain grounding and static prop collision are separate. Props use approximate vertical cylinders with a swept avatar footprint; swimming, slope limits, rock-top grounding and dynamic rigid bodies are not implemented.
- The map documents a **77 m climb over roughly 31 m near E0 N2**, before Stone Gate. Importing props does not fix that road obstruction.
- Map heights can understate sharp peaks by up to 24 m; authored region boundaries can shift by up to 44 m through domain warp. Use the visible terrain and painted biome edges when checking placement.
- Map source edits are normally made in `alpha-map.world.json` and followed by regeneration. That source and its height-function code are not available here; no authored layout changes have been requested.
