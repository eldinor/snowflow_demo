# Stage 6 — generated landmarks

The first landmark bake uses generic generated names only. It does not import
names or coordinates from the Exalted reference map.

Current locations are Desert 1, Forest 1, Grass 1, Grass 2, Snow 1, Rock 1, and
Lakeside 1. Candidates are sampled every 10 m and ranked by requested biome
weight and flatness. Water cells are forbidden, ordinary spawns require slope
at most 0.22, Rock 1 allows 0.35, and every selected point is at least 220 m
from the others.

`landmarks.json` is deterministic and the generated-world sidebar can move the
overview or ground camera to every location. These are placement inputs for the
next terrain-clearance and road-routing pass.

`landmark-clearance.f32` adds an 18 m inner pad and a smooth blend to 32 m.
Cut/fill is capped at ±4 m to avoid artificial mountain platforms; the current
bake affects 5,684 cells and ranges from -3.72 m to +4.00 m. The clearance layer
is separate from the authoritative height bake and is sampled by terrain
geometry and self-shadowing.

The initial road graph has four dry corridors, all centered on Grass 1:
Desert 1, Grass 2, Forest 1, and Lakeside 1. Snow 1 and Rock 1 remain remote.
Routes use deterministic 10 m A* nodes, forbid water, and penalize grade. The
current ungraded routes are 1.20–2.25 km long and still contain raw-terrain
grades up to 44.6%; they are routing inputs, not finished roads. The next pass
must grade a separate road displacement layer before these routes satisfy the
road-slope acceptance requirement.
