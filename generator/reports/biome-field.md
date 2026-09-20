# Biome-field bake audit

Date: 2026-09-20

- Two 1,000 × 1,000 RGBA8 maps store eight blended biome weights.
- Each texel represents 2 × 2 m of the exact generated world.
- Largest-remainder quantization keeps every eight-channel texel total at 255.
- The CPU sampler bilinearly interpolates and renormalizes weights.
- The GPU terrain material samples both maps for its composite and individual
  biome debug views.
- Map 0 SHA-256: `c6d1b5c45dfb30e70abc6ac0e2fe420a7562b886e4595dd838fc62aac035b5f3`.
- Map 1 SHA-256: `77707145604cd463623626fb87bf7b6b586ef849b2883da9880e3c4b7e2ce0fd`.

Biome textures remain intermediate RGBA8 files under `generator/work/`. KTX2
packaging belongs to the final packaging stage.

Target-device GPU probe observation on 2026-09-20:

- Maximum CPU/GPU biome-weight error: **0.0008 percentage points**.
- Acceptance threshold: 0.2 percentage points.
- Result: passed with 250× margin.
- Probe coverage: both RGBA maps and all eight biome channels at 256 fixed world
  positions.
