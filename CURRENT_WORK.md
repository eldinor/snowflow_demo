# Exalted Current Work

## Product Direction

The playable **Exalted application** remains the main product under development.
It contains the authored world, avatar, movement, spells, terrain interaction,
water, atmosphere, props, collisions, UI, and other player-facing systems.

Work should be evaluated by how it supports the quality, performance, and
maintainability of this main application.

## Main Application

The main Exalted application includes:

- the authored Exalted world based on the supplied map and world assets;
- the main avatar and animation system;
- walking, running, flying, swimming, and terrain grounding;
- snow, sand, and other biome-specific ground deformation;
- spells and environmental interaction;
- water, waterfall, wind, sky, lighting, shadows, and post-processing;
- biome props, collisions, spawn locations, and world navigation;
- production UI and performance controls.

The authored world and its Blender-to-Babylon asset pipeline are the production
priority.

## Supporting Utilities

The following are side utilities and research environments. They are useful for
developing and validating individual systems, but they are not replacements for
the main Exalted application.

### Procedural world generator

The files under `generator/` explore procedural elevation, biomes, hydrology,
roads, landmarks, placement, terrain rendering, and deformation for a separate
generated world.

The generated world's dimensions, terrain representation, materials, and
content rules do not define the authored Exalted map. Technology may be moved
from the generator into the main application only through an explicit
integration decision.

### Grass Lab

The Grass Lab compares procedural, imported, and hybrid grass blades using
deterministic placement, wind, interaction, LOD, and performance measurements.
Its purpose is to select and tune a grass solution that can later be integrated
into the authored Exalted world.

### World editor

The planned browser world editor supports regional inspection, placement,
anchors, masks, metadata, and Blender round trips. It is an authoring utility;
the playable Exalted application remains the authority for final runtime
behavior and validation.

### Avatar and garment editors

Avatar utilities support inspection, export, editing, reimport, skeleton and
animation validation, modular appearance, and garment experiments. A future
Garment Lab may test skinned clothing and Verlet or XPBD secondary motion.

These utilities produce assets and manifests for the main avatar system. They
are not separate player applications.

### Performance and asset demos

Forest, mountain, forest-road, and similar pages are isolated demonstrations.
They may remain in JavaScript where appropriate and do not need to follow every
main-application migration decision. Their results should be documented before
production techniques are moved into Exalted.

## Blender-to-Babylon Technical Brief

The current Blender-to-Babylon technical brief will be revised. After approval,
the revised brief will become the base production contract between Blender
artists and Babylon developers for the authored Exalted world.

The revised brief should define:

- the exact scope of the authored map;
- world dimensions, origin, scale, axes, and North direction;
- Blender and Babylon ownership;
- terrain, biome, prop, placement, collision, and anchor delivery;
- material-mask and embedded-texture conventions;
- reusable asset, pivot, naming, and LOD requirements;
- runtime manifests and versioning;
- validation and performance budgets;
- the representative-biome approval process;
- asset provenance and licensing.

The brief does not govern the procedural generator unless a requirement is
explicitly shared between both projects.

## Current Terrain Direction

For the authored map, the current working decision is:

- use one optimized terrain geometry level;
- do not create routine terrain LOD meshes;
- use streaming or chunking only when loading, culling, editing, masks, or
  measured performance requires it;
- allow separate distant mountain or skyline proxies where useful;
- apply LOD primarily to trees, rocks, bushes, grass, and other props;
- use image-based masks for smooth terrain material blending independent of
  mesh density;
- keep terrain collision separate when the visual mesh is unsuitable.

The existing `alpha-map.glb` is approximately 329,000 triangles and is a
reasonable starting point for a single-level terrain, subject to validation on
the target laptop and desktop hardware.

## Representative Biome Delivery

The first artist validation package should be one complete biome. Desert is a
suitable first biome because it tests terrain blending, roads, rocks, sparse
vegetation, placement, collision, sand deformation, lighting, and long-distance
readability.

The proposed minimum delivery for that biome is:

```text
biome_desert/
├── desert.glb
├── desert_material_mask.png
└── README.md
```

- `desert.glb` contains the optimized terrain or biome geometry, reusable props,
  authored placements, UVs, materials, and embedded PBR textures.
- `desert_material_mask.png` is a non-color RGBA image that controls the blend
  between surfaces such as sand, dirt, rock, and path.
- `README.md` records scale, axes, mask-channel meanings, texture tiling scale,
  Blender version, and export settings.

The desert GLB is a useful reference for reusable props and authored placement.
Its existing terrain material arrangement is not automatically the final
material pipeline.

## Working Principles

1. Develop player-facing systems in the main Exalted application.
2. Use separate labs for uncertain or performance-sensitive techniques.
3. Keep lab code portable, but integrate it only after visual and performance
   validation.
4. Treat Blender-authored assets and Babylon runtime behavior as a documented
   contract.
5. Avoid allowing generator assumptions to redefine the authored world.
6. Validate production assets with the real Exalted camera, controller,
   lighting, materials, and target hardware.
7. Preserve editable source files, runtime exports, manifests, versions, and
   license information.

## Near-Term Priorities

1. Revise and approve the Blender-to-Babylon technical brief.
2. Lock the authored-world coordinate and scale contract.
3. Define and validate the first complete biome delivery.
4. Use the desert as the initial representative biome unless another biome is
   selected during brief revision.
5. Test its terrain masks, embedded materials, reusable props, collisions,
   authored placement data, and sand deformation in the main Exalted
   application.
6. Continue grass, forest, avatar, and editor research in isolated utilities.
7. Move successful utility systems into the main application through measured,
   reviewable integration stages.
