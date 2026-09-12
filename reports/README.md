# Terrain deformation measurement

Captured in headless Chrome/WebGPU at 1280 × 800, 120 presentation intervals per
destination after a 700 ms settle. These are single-run observations, not isolated
GPU timings. Background activity and frame scheduling affect the numbers. Both
captures exclude desert props. Run `node scripts/benchmark.mjs report-name` with
the development server on port 5173 to repeat.

| Destination | Before median / p95, ms | After median / p95, ms | Draw calls before → after | Visible triangles after |
| --- | ---: | ---: | ---: | ---: |
| Desert Start | 31.7 / 40.2 | 35.5 / 44.8 | 25 → 31 | 409,285 |
| The Palecrown | 33.1 / 35.1 | 44.9 / 47.3 | 25 → 31 | 488,060 |
| The Long Green | 31.3 / 33.4 | 32.3 / 35.3 | 25 → 25 | 348,910 |
| The Thornwood | 29.2 / 31.5 | 30.2 / 40.7 | 25 → 25 | 348,910 |
| The Ironspine | 29.0 / 30.8 | 30.7 / 33.3 | 25 → 25 | 348,910 |
| Lakeside Overlook | 31.6 / 33.9 | 32.6 / 55.6 | 25 → 25 | 348,910 |
| Stone Gate | 30.1 / 32.1 | 33.3 / 52.4 | 25 → 31 | 393,760 |

The final patch uses 24 subdivisions per source edge (approximately 17 cm),
instead of the initial 32 (12.5 cm): 44% fewer detail triangles. The reusable
template is bounded to 512 source triangles and updates source selection every
8 m. Detailed displacement fades at 12–16 m; no full-world subdivision occurs.
Hard-only patches skip the grounding readback pass. Triangle counts describe
visible scene geometry, not the sum of repeated shadow/depth work.

Deformation adds a measurable cost, especially in snow; this change does not
establish a 60 fps budget. The next performance work should measure GPU pass times
on target hardware.

## Authored desert props

`terrain-with-desert-props.json` repeats the same seven-spawn capture after adding
plants and rocks. Desert Start measured **41.1 ms median / 47.6 ms p95**, with
**126 total draw calls** and **774,879 scene triangles**. The earlier terrain-only
capture was 35.5 / 44.8 ms, 31 calls and 409,285 triangles. These captures were
made at different times and are indicative, not an isolated GPU-cost measurement.

The final prop selection adds **365 primitive instances / 365,594 triangles**.
There are 23 geometry/material groups, each split into near and distant meshes;
19 meshes are active at spawn. Each active mesh participates in beauty, depth
and three shadow passes, accounting for 95 extra calls. Materials and authored
transforms are shared; they are not 365 separate scene objects.

Distant LODs target 15% of original triangles with a 2.5% relative geometry-error
limit; actual reductions vary with topology. Originals remain close to the
avatar. Small stones and shrubs use shorter visibility ranges than trees and
boulders. The initial broad-range, full-detail pass submitted 5,936,484 prop
triangles at spawn; the final selection reduces that by approximately 94%.

The load/batching/LOD audit took about 2.5 seconds in its capture, excluding later
shader warm-up. The source GLB remains about 31.7 MB. `desert-placement.json`
records individual seating checks, instance counts, LOD errors and distances.
All six other navigation destinations had zero active desert props in the
measurement; their draw counts match the terrain-only scene.
