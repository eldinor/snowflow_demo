# Exalted terrain source

`alpha-map.glb` is copied unchanged from:

`C:\Users\Fiolent23\newrepos\Exalted\Exalted_World_Handoff_2026-09-09\2026-09-09\glb\alpha-map.glb`

The handoff identifies this as generated geometry with no third-party assets or
restrictions. It contains the full-world visual terrain (`vis_ground`): 173,156
vertices and 328,536 triangles, with biome colour in `COLOR_0`.

The September 9 handoff documents the import conventions; the September 10 Rev B
places register supplies the spawn coordinates. No scale correction is applied.
The user authorised using this visual mesh for grounding because a dedicated
collision mesh is not available.

`exalted_desert.glb` is copied unchanged from the same handoff's `glb` folder.
SHA-256: `DA3C4B75898EA9AC721C9194A08D8E36E1F56242720311CFC989782D1337BBAE`.
The handoff identifies its desert assets as Poly Haven CC0 or in-house.
It contains 15,909 placed props and a separate regional ground. The runtime
excludes that ground, retains authored prop transforms, and makes distant LODs
with meshoptimizer (MIT). The actual file uses shared mesh references rather than
the `EXT_mesh_gpu_instancing` extension claimed in the handoff.
