# Height-field bake audit

Date: 2026-09-20

- The authoritative offline bake uses the exact 4,000 × 4,000 contract.
- Samples are Float32 values at 0.5 m texel centres.
- Six deterministic thermal-erosion passes relax slopes before packaging.
- The generated binary is 61.0 MiB and remains under `generator/work/`.
- The current bake spans -16.78 m through 464.35 m.
- SHA-256: `0398abb53da4622f60a6d76666034c4261811dd37720f97ec343997aee6bd6af`.
- The CPU sampler uses clamped bilinear interpolation.
- The dedicated preview loads this field when present and reports its resolution.
- The preview uploads the Float32 field as an R-channel GPU texture and performs
  manual texel-centred bilinear displacement in its WGSL vertex shader.
- GPU normals sample the same height texture with a 4 m baseline to avoid
  magnifying sub-metre noise in the overview mesh.
- Generated inspection details are written to
  `generator/reports/generated/height-field.md` and ignored by Git.

The preview now runs a 16 × 16 GPU probe/readback pass at startup. Its fragment
shader and terrain vertex shader share `heightSampling.wgsl`, so the test covers
the actual world-to-texel transform and bilinear texture sampling used for
displacement. The page reports maximum and mean CPU/GPU error and rejects errors
above 0.2 cm.

Target-device observation on 2026-09-20:

- Maximum CPU/GPU height error: **0.021 cm** (0.21 mm).
- Acceptance threshold: 0.2 cm (2 mm).
- Result: passed with approximately 9.5× margin.
