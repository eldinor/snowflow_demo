# Forest: retained specification for replacement models

Status: deferred. The existing `forest.html`, `src/forest`, preparation script,
tests and assets are retained as a prototype reference. Do not integrate the
current tree models into the main world. Resume with the replacement assets.

## Scope and integration

- Keep asset preparation, placement, chunking, LOD and collisions independent of
  the demo page so the renderer can be used by the main world.
- Use the Rev B map references for biome placement and naming, including The
  Thornwood. Preserve authored X/Z, rotation and scale; bake the complete GLB
  hierarchy and coordinate conversion before comparing with alpha-map.
- Batch repeated geometry/materials using thin instances in **32 m chunks**.
  Keep visibility bounds local to chunks, not the entire forest.
- Target two geometry LOD levels for the replacement vegetation. The old demo's
  additional distant cards are an optional experiment, not a required third LOD.
  Prefer authored replacement LODs with intact crowns and silhouettes.
- Give grass and bushes shorter visibility distances than trees. Make density
  selection deterministic, and avoid changing collision placement with LOD.
- Trunks use simple cylinders; bushes and grass normally have no collision.
- Root-anchored GPU wind should affect foliage, agree across shadow/depth passes,
  and expose strength, speed, direction and freeze controls.
- Integrate with the world's existing lighting, atmosphere, depth and post
  pipeline; avoid permanently maintaining another lighting implementation.

## Lessons from the prototype

- The old asset contains 20,984 plants in 411 occupied chunks: 3,457 trees,
  2,549 bushes and 14,978 grass placements. These counts are historical only.
- Shared Babylon geometry must not overwrite per-chunk instance matrix bindings.
  Preserve the independent-binding regression test, including a one-instance
  final chunk. Review buffer ownership before sharing GPU vertex buffers.
- Grounding found 3,174 bases differing by more than 20 cm; median delta was
  -0.13 m. Compare authored bases to the actual terrain, retain an authored-height
  diagnostic, and avoid treating every low branch as the trunk base.
- White/grayscale source foliage needed tinting. Current linear RGB reference:
  spruce (0.055, 0.16, 0.085), bushes (0.10, 0.23, 0.065), grass
  (0.11, 0.25, 0.072). Grass should be only slightly lighter than bushes.
  Inspect replacement materials before applying any tint.
- Thinning arbitrary triangles exposed trunk tops and damaged crowns. Preserve
  whole foliage cards and inspect silhouettes at every transition.
- Check card texture Y orientation. Keep shadow projections stable in world
  space by snapping to shadow texels; verify render-target sampling orientation.
  Camera movement must not drag shadows or make shadow silhouettes turn.
- Coincident terrain vertices with different biome colors produced pale seams
  and triangles. The prototype smooths display colors at coincident positions,
  preserving authored biome data used by gameplay.
- Measure draw calls per frame, never the lifetime cumulative engine counter.
  A reported 6.9 ms median / approximately 145 FPS is a historical sample, not
  an acceptance target without the same hardware, camera and resolution.

## Controls and validation when work resumes

Retain tree/bush/grass toggles, density, LOD distances, visibility distances,
nearby shadows and shadow range, render scale, wind controls, trunk collisions,
grounding toggle, free flight and reset view. Offer a ten-second measurement
export recording settings, camera, median/p95 frame time, per-frame draw calls,
visible batches/instances/triangles, shadow batches and update CPU time.

Inspect new GLBs for model identity, materials, UVs, alpha cutouts, transforms,
trunk bases and authored LODs. Replace the old preparation script's assumptions
about four model names with a manifest for the actual assets. Keep its source
provenance and reproducible preparation record.

Acceptance: no floating bases, exposed trunk tops, upside-down cards, camera-
dependent shadows or chunk matrix errors. Compare fixed views at fixed resolution
before and after optimizations. Preserve meaningful CPU regression tests and
perform a manual GPU visual/performance check. Do not use Playwright unless asked.

Implementation reference: [src/forest/README.md](src/forest/README.md).
