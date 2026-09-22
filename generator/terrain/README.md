# Terrain texture inputs

Each terrain layer uses three tileable 2048 × 2048 images with identical dimensions:

- `albedo`: RGBA, sRGB colour space, with no baked directional light or AO.
- `normal`: RGBA linear OpenGL normal map (`+Y`/green points upward).
- `ormHeight`: RGBA linear data: R ambient occlusion, G roughness, B normalized height, A optional material mask.

Layer order must remain identical to `BIOME_NAMES`: desert, grassland, forest, snow,
rock, wetland, shore, settlement. Production packaging will combine each channel
family into one GPU texture array and transcode it to KTX2. All layers must use a
physical tile scale from `config/terrainMaterials.ts`; source-image pixel density
does not define world scale.

Until all three files are assigned for a layer, the renderer uses its procedural
colour, roughness, and micro-normal fallback. This keeps incomplete layer imports
obvious and avoids silently mixing incompatible channels.
