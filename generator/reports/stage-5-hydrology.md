# Stage 5 hydrology — drainage foundation

The first hydrology bake is intentionally non-destructive. It samples the
authoritative height field at the configured 1000² water resolution, selects a
strictly downhill D8 neighbour for every draining cell, and accumulates upstream
cell area with an O(n) topological pass.

Artifacts in `generator/work/generated-world/`:

- `flow-direction.u8`: zero for sinks, otherwise D8 direction index plus one.
- `flow-accumulation.f32`: contributing cell count, including the cell itself.
- `hydrology.json`: dimensions, world mapping, checksums, sink count, and maximum.

The priority-flood pass routes filled cells toward deterministic edge outlets
and classifies connected flooded regions deeper than 0.25 m with at least eight
cells. It emits `lake-mask.u8` and `lake-surface.f32` alongside the rebaked flow
fields.

The open-water budget retains the six largest basins. Smaller filled
depressions remain available for wetland classification and do not become lake
surfaces.

Current bake: 132 raw sinks, 6 classified lakes, a largest basin of 194,115
cells, and maximum accumulation of 516,723 cells. The largest basin is visually
significant and must be reviewed in **Lake basins** before river carving; if it
is too broad, the terrain needs a deliberate spillway or lake-size constraint.

The generated-world preview exposes **Flow direction** and **Water
accumulation** modes. These fields are diagnostic inputs, not final water masks.

Visible river selection is deliberately capped at one primary river and two
small rivers. The current routes are 789, 282, and 305 cells long at 2 m cell
spacing. Their masks use separate widths and values so later carving and water
rendering can distinguish the primary channel from the smaller channels. All
other accumulated drainage remains invisible.

Riverbeds are a separate `river-carve.f32` displacement layer, leaving the
authoritative base height bake unchanged. The primary river is carved to 2.4 m
with a 12-cell diameter influence; small rivers use 0.9 m and a 6-cell
diameter. The current retained routes produce three separated waterfall sites
with 6.8 m, 6.2 m, and 5.9 m drops over 10 m. `waterfall-mask.u8` supports the
debug view, while exact world positions and drops are stored in hydrology JSON
for later spray and audio emitters.

`water-mask.u8` and `water-surface.f32` combine retained lakes and rivers into a
single runtime contract. Lakes use their priority-flood level. Rivers place the
surface one quarter of the carve displacement below the original terrain,
leaving water above the channel bed and below its banks. A separate continuous
4 m water grid renders this surface with animated normals, transparency, and a
view-angle Fresnel response. Dry grid vertices retain terrain elevation and the
mask is evaluated per pixel, preventing shoreline triangles from stretching to
zero height. Water elevations are padded three hidden 2 m cells beyond the
visible mask, so the 4 m render grid stays level across the clipped shoreline
instead of producing downward skirts. Terrain and water data remain
independently tunable.

Runtime contact artifacts include `water-depth.f32`, `shoreline-mask.u8`, and
`swimmable-mask.u8`; swimming begins at 1.2 m depth. River surface correction
operates only on derived water and carve layers and guarantees monotonic flow
into receiving lakes. The current validation reports zero uphill segments. The
preview exposes water visibility and opacity without rebaking data.

Final validation: zero uphill river segments, zero neighbouring lake-level
delta, 5,283 shoreline cells, and 196,980 swimmable cells (about 0.79 km²).
Dedicated **Water depth / swimming** and **Shorelines** debug views expose these
runtime masks directly.
