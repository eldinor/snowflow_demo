# Desert sand materials

## Active: Gravelly Sand

- Source: https://polyhaven.com/a/gravelly_sand
- Author: Dario Barresi
- License: CC0 1.0 Universal
- Physical scan width: 2.5 m
- Downloaded maps: 2K JPG diffuse, OpenGL normal, and ARM

This less-directional scan replaces Sand 03 in the generated-world preview to
reduce recognizable tiling. The shader combines three rotated samples with soft,
noise-driven weights.

## Retained: Sand 03

- Source: https://polyhaven.com/a/sand_03
- Author: Charlotte Baglioni
- License: CC0 1.0 Universal
- Physical scan width: 2 m
- Downloaded maps: 2K PNG diffuse, OpenGL normal, ARM, and displacement

The ARM source uses R ambient occlusion, G roughness, and B metallic. Desert
rendering currently consumes diffuse, OpenGL normal, AO, and roughness. The
separate displacement map is retained for later height-aware blending.
