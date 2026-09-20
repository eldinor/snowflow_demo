# Stage 1 field audit

Date: 2026-09-20

## Contract

- World extent: exactly 2,000 × 2,000 m.
- Bounds: X and Z from -1,000 through +1,000 m.
- Height samples: 4,000 per axis, or 0.5 m per sample.
- Biome and water samples: 1,000 per axis, or 2 m per sample.
- Placement chunks: 32 m, with a clipped 16 m chunk at each positive far edge.
- Chunk grid: 63 × 63.
- Seed: 482913.
- Generator/package versions: 1/1.

## Fields

- Seeded integer hash, continuous value noise, and normalized fractal noise are
  deterministic and independent of runtime state.
- Temperature combines latitude, elevation cooling, and regional variation.
- Moisture combines regional variation with optional water, drainage, and rain
  shadow inputs reserved for hydrology integration.
- Biome sampling returns eight finite, non-negative weights whose sum is one.
- Biome channels have a stable mapping to two future RGBA textures.
- Structural overrides can dominate the settlement channel while continuously
  suppressing natural biome weights.

## Verification

- `npm run test:generator`: 5 passed.
- `npm test`: 44 passed.
- `npm run typecheck`: application and generator projects passed.
- `git diff --check`: passed; reported only existing line-ending notices.

Stage 1 does not connect generated fields to production rendering, so it changes
no current world visuals.
