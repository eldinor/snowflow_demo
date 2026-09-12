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
on target hardware and include authored desert props with instancing/culling.
