# Stage 4 material foundation

Date: 2026-09-20

The generated terrain composite now evaluates biome-specific material colour at
macro, local, and micro scales. Desert receives directional ripples, grassland
and forest receive irregular plant and litter variation, snow receives wind
lines and slope darkening, rock receives elevation-like strata, and wetland and
shore use darker saturated palettes. The baked eight-channel weights blend these
materials continuously.

The material also blends approximate biome roughness into its direct-light
response. Individual biome debug modes continue to show unmodified weight masks
so visual inspection is not obscured by material detail.

`BIOME_SURFACE_RESPONSE` defines compression depth, berm ratio, relaxation time,
and hardness for every biome. Snow supports the deepest compression, loose desert
sand produces stronger berms, wet terrain has shallow response, and rock and
settlement surfaces remain firm. The CPU blend uses the same biome weights as
rendering and placement.

Interactive deformation is now active through a 512² moving local patch with
0.5 m texels. A target-device click successfully detected a grassland-dominant
blend and applied a 7.8 cm response. The reported value is blended from all
eight biome weights at the contact rather than selected from only the dominant
biome.

Matching depth and shadow displacement remains required before Stage 4 can be
closed.
