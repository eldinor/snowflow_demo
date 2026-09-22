# Improve the Generated World

## Why Generated Sand Looks Worse Than the Main World

The generated-world page currently reproduces the desert surface category, but
it does not yet reproduce the main page's complete terrain rendering pipeline.
The visual difference is caused by material sourcing, filtering, lighting,
geometry, deformation, and post-processing working together.

### Different source material

The main page uses the albedo, normal map, UV orientation, scale, tint, and
roughness authored in `exalted_desert.glb`. The generator uses Poly Haven's
Gravelly Sand material. The scan may be technically detailed, but its grain,
color, and surface character differ from the authored Exalted desert.

### Three-way blending softens detail

The generator combines three rotated samples to hide recognizable repetition.
This reduces obvious tiles, but it also averages fine albedo and normal-map
features. The main page uses one authored projection and consequently retains a
sharper response.

### The atlas compromises texture filtering

Desert and grass currently occupy opposite halves of shared atlases. The shader
uses `fract()` to repeat each half. This interrupts the natural UV derivatives
used for mip selection, particularly at tile boundaries and grazing camera
angles.

The main terrain shader passes explicit world-space gradients to
`textureSampleGrad`. This provides stable mip selection and anisotropic
filtering without changing detail as the camera angle changes.

### Lossy material maps

The generator's normal and ARM atlases are JPEG files. JPEG compression creates
small blocks and channel errors in normal vectors, ambient occlusion, and
roughness. Directional lighting can expose these errors even when they are hard
to see in the source images.

Normal and packed material maps should remain lossless PNG during development,
then move to KTX2 using compression formats appropriate for linear material
data. Color and linear-data textures must use separate color-space settings.

### Simpler lighting

The generated-world terrain currently uses a hemispheric approximation and a
basic diffuse/specular model. The main terrain uses:

- atmosphere-derived sun direction and radiance;
- sky spherical-harmonic illumination;
- sky reflection data;
- a microfacet rough-surface response;
- cool ambient light in shadow;
- cascaded filtered terrain shadows;
- height-aware aerial perspective.

These systems reveal sand shape, preserve color relationships, and produce a
more convincing grazing-angle response.

### Missing post-processing parity

The main world uses temporal anti-aliasing, AgX tone mapping, controlled
exposure, contrast, sharpening, bloom, atmospheric effects, and optional depth
of field. The generator presents its material output much more directly.

TAA and restrained sharpening are particularly useful for preserving small sand
detail while controlling shimmer in motion.

### Less geometric surface detail

The main world combines imported terrain geometry, a camera-centered local
detail patch, analytic surface relief, detail normals, and geometric
deformation. The generator primarily uses its height clipmap and material
normal maps. Near the ground, the broader polygons can therefore remain visibly
smoother and flatter.

### Simpler deformation response

The main terrain's footprints and displaced material affect surface gradients,
lighting normals, compression color, cavity response, and roughness. The
generator deformation tool currently demonstrates biome response but does not
yet reproduce the same displaced-sand material behavior.

## Prioritized Improvement Sequence

### 1. Replace the temporary atlas path

Move terrain materials to GPU texture arrays with one layer per biome. Texture
arrays preserve independent wrapping and mip chains while consuming only one
sampler per material channel.

Use at least these arrays:

- sRGB albedo;
- linear OpenGL normal;
- linear AO, roughness, height, and material mask.

All layers must have identical dimensions, mip counts, formats, and physical
metadata. Keep the terrain-material catalog as the authoritative layer order.

### 2. Correct sampling and filtering

- Derive UV gradients from world position once per fragment.
- Use `textureSampleGrad` for rotated and projected samples.
- Preserve anisotropic filtering at grazing angles.
- Fade fine material detail by pixel footprint before it aliases.
- Avoid `fract()`-based atlas addressing in production terrain shaders.
- Compare stochastic blending against authored macro variation so detail is not
  softened merely to conceal repetition.

### 3. Port the main terrain lighting model

Share the main world's sun, sky LUT, spherical harmonics, shadow lookup, BRDF,
and aerial perspective with the generator renderer. Extract reusable lighting
includes rather than maintaining a second approximation.

Generated terrain must receive the same:

- sun radiance and color temperature;
- ambient sky illumination;
- rough dielectric reflection;
- cascade shadow filtering;
- fog and aerial perspective.

### 4. Add post-processing parity

Connect the generated-world camera to the shared post chain or a reusable subset
with equivalent settings:

- TAA;
- AgX tone mapping;
- exposure and contrast;
- restrained sharpening;
- bloom and atmosphere where applicable.

The generator should retain switches that isolate raw material output from the
post-processed result for debugging.

### 5. Add near-camera terrain detail

Use the world height field as the authoritative source while rendering an
additional camera-centered detail patch. It should increase vertex density only
near the camera and join the clipmap without cracks or a visible resolution
ring.

The local patch must use the same height, normal, deformation, biome, road, and
water data as the main clipmap.

### 6. Reach deformation parity

Extend generated deformation so sand displacement affects:

- geometric height and berm mass;
- surface gradients and normals;
- compressed color and cavity response;
- roughness;
- shadows and depth passes;
- gameplay height queries.

Keep snow and sand parameters separate even if they share the same deformation
storage and update system.

### 7. Establish the intended desert identity

Compare two explicit art directions:

1. reuse the main GLB's desert material and projection so both worlds match;
2. retain a generated-world desert material but tune it to the same color,
   roughness, lighting, and physical scale.

Make this an intentional content decision after rendering parity is achieved.
Changing scans repeatedly cannot compensate for different lighting and
filtering pipelines.

## Validation Views

Add comparable camera positions and debug modes to both renderers:

- raw albedo;
- geometric normal;
- final shading normal;
- roughness;
- ambient occlusion;
- texture mip or pixel footprint;
- direct light only;
- sky light only;
- shadow factor;
- deformation height and gradient;
- raw linear output;
- final post-processed output.

Capture comparisons at the same resolution, field of view, time of day, sun
direction, exposure, and ground-level camera height. This will separate material
problems from lighting, geometry, and post-processing differences.

## Immediate Recommendation

Implement texture arrays and explicit-gradient sampling first, then port the
main terrain lighting and post-processing. The current atlas and simplified
lighting are the two largest limitations. Additional biome textures should use
the final array pipeline rather than extending the temporary atlas.
