# Exalted World Editor

## Purpose

Develop a browser-based editor for authoring selected parts of the generated
Exalted world while keeping procedural generation as the authoritative base.
The editor will support direct browser editing and a Blender round trip for
terrain or assets that require external modeling tools.

The core model is:

```text
Procedural base world
        +
Non-destructive authored overrides
        =
Final world package
```

The editor should never require replacing the complete 2 × 2 km terrain with a
single imported mesh. Local overrides preserve clipmap rendering, deterministic
generation, deformation, collision queries, biome placement, and regeneration
outside authored regions.

## Authoring Tiles

Divide the world into persistent 256 × 256 m authoring tiles. Each tile has a
stable ID such as `tile_03_05`, exact world-space bounds, and a context border
used to prevent seams during editing and export.

A tile may contain:

- terrain height deltas;
- biome and material weights;
- road and trail masks;
- water, river, and shoreline masks;
- placement records;
- landmark and spawn markers;
- collision and exclusion volumes;
- references to authored GLB geometry;
- source and generator metadata.

For a 256 m tile sampled at 0.5 m, the height layer is `513 × 513` floats, or
approximately 1 MB before compression. Only nearby tiles need to remain loaded
in memory.

## Data Ownership

Procedural fields remain the base for elevation, climate, biomes, hydrology,
roads, and placement. The editor stores differences and explicit replacements.

```ts
interface AuthoredTileOverride {
    tileId: string;
    bounds: [number, number, number, number];
    baseWorldVersion: string;

    heightDelta: Float32Array;
    biomeWeights?: Uint8Array;
    roadMask?: Uint8Array;
    waterMask?: Uint8Array;
    exclusions?: ExclusionVolume[];
    placements?: AssetPlacement[];
    markers?: WorldMarker[];
}
```

Height editing should store deltas from the procedural base. Biome painting may
store sparse changes or complete tile-local weight maps. Roads and water can use
local replacement or constraint masks where an artist intentionally overrides
procedural routing.

## Browser Editor Features

The editor will live at `/editor/world.html` and use shared TypeScript modules
for world sampling, validation, terrain rendering, and package formats.

### World and tile navigation

- 2D overview map with tile selection;
- ground and orbit camera modes;
- biome, elevation, slope, water, road, exclusion, and authored-change views;
- loaded-tile and dirty-tile indicators;
- named navigation to landmarks and spawn points.

### Terrain tools

- raise and lower;
- smooth;
- flatten to sampled or entered height;
- terrace;
- erosion pass;
- restore procedural base;
- brush radius, strength, falloff, and pressure;
- seam-safe strokes across tile boundaries.

Brushes should update a GPU preview immediately while maintaining
CPU-authoritative edit data for saving, validation, and deterministic export.

### Biome and material tools

- paint individual biome weights;
- normalize all eight biome channels after each stroke;
- smooth and replace modes;
- height, slope, moisture, and temperature constraints;
- preview production ground materials, vegetation eligibility, and deformation
  response.

Generated terrain should continue using world-space material projection rather
than requiring a full terrain UV unwrap. Unique locations may use decals,
authored meshes, or explicit local projection data.

### Roads, water, and shorelines

- edit road and trail control points;
- display grade and maximum earthwork;
- reject or flag unapproved river crossings;
- place explicit bridge markers;
- edit lake boundaries, water levels, river paths, and waterfall markers;
- regenerate local shoreline and water-depth fields;
- validate that roads, water, and terrain agree.

### Asset placement

- import and register GLB prototypes;
- place, rotate, scale, duplicate, and remove individual assets;
- paint deterministic scatter regions;
- control density, spacing, slope, biome, road, water, and landmark constraints;
- preview LODs, cards, wind, shadows, and collisions;
- convert repeated authored objects into placement records and instances.

### Markers, collision, and exclusions

- named spawn and landmark transforms;
- camera and interaction markers;
- boxes, capsules, cylinders, and authored collision meshes;
- vegetation and gameplay exclusion volumes;
- navigation blockers and bridge connections.

### Editing infrastructure

- undo and redo using brush commands or changed-region patches rather than full
  tile copies;
- autosave to browser storage;
- explicit project export;
- dirty-state protection;
- edit history with tool, time, bounds, and affected channels;
- world-version compatibility checks.

## Blender Round Trip

The browser editor should export a selected authoring tile or region as a GLB
plus masks and a manifest. The package provides sufficient context for editing
without turning every procedural feature into editable geometry.

### Exported content

- terrain mesh at a useful editing resolution;
- exact world-space position, scale, orientation, and bounds;
- biome weights as vertex colors or named texture maps;
- road, water, shoreline, and exclusion masks;
- landmark and spawn markers;
- terrain normals;
- metre-based projection or reference grid;
- optional nearby proxy geometry;
- region ID and generator metadata.

### Node roles

Use stable collection or node prefixes:

```text
TERRAIN_RENDER
TERRAIN_HEIGHT_EDIT
COLLISION
ROAD
WATER
BIOME_MASK
PROP_STATIC
PROP_INSTANCE
MARKER
```

### Artist-editable content

- terrain around landmarks;
- roads, paths, bridges, and stairs;
- lake shores and waterfall channels;
- cliffs, caves, and rock formations;
- settlement foundations;
- hand-painted biome transitions;
- prop placement;
- unique material masks and decals.

### Import treatment

| Imported content | World treatment |
| --- | --- |
| Terrain height edits | Resample into tile-local authoritative height deltas |
| Biome/material masks | Merge with or replace generated weights locally |
| Roads and water masks | Constrain or replace procedural routing locally |
| Large rocks and structures | Retain as authored GLB geometry |
| Repeated trees, bushes, and grass | Convert to validated placement records |
| Spawn and landmark markers | Import as named transforms |
| Collision meshes | Retain separately or convert to collision primitives |

### Manifest

The companion manifest should record:

- schema and version;
- coordinate system and handedness;
- metres as the unit scale;
- tile and context bounds;
- generator seed and generator version;
- source field hashes;
- exported file hashes;
- editable node roles;
- mask channel definitions;
- expected terrain resolution;
- asset prototype IDs;
- export time and optional author metadata.

The importer must reject or explicitly migrate stale packages whose base fields
have changed incompatibly. It must never silently overwrite newer world data.

### Round-trip workflow

1. Select a tile or region in the browser editor.
2. Export its GLB, masks, and manifest.
3. Edit the package in Blender without changing its origin, scale, or axes.
4. Export the edited GLB with stable node names.
5. Import it into a separate review state.
6. Validate transforms, bounds, topology, metadata, masks, and asset references.
7. Show before/after height, material, road, water, collision, and placement
   differences.
8. Accept selected changes into the tile override.
9. Regenerate affected seams, navigation, hydrology, roads, and vegetation.
10. Preserve the source GLB as the editable master for unique geometry.

## Project Architecture

```text
editor/
  world.html
  main.ts
  EditorSession.ts
  TileManager.ts
  Selection.ts
  history/
  tools/
  import/
  export/
  review/
  ui/

generator/package/
  shared schemas, serialization, validation, and sampling

generator/fields/
  procedural base fields and local regeneration

src/world/
  runtime consumption of generated data and authored overrides

public/assets/
  registered GLB prototypes, authored geometry, and material assets
```

Page code owns DOM controls and editor composition. Terrain brushes, tile data,
serialization, validation, and import/export must remain independent of the DOM
so they can be tested and reused by generator scripts.

## Validation

Every save or import should validate:

- finite numeric data;
- tile bounds and resolution;
- normalized biome weights;
- matching height edges between neighboring tiles;
- maximum slope and height-delta thresholds;
- road continuity and grade;
- water containment and flow direction;
- bridge requirements at retained crossings;
- valid and registered asset IDs;
- placement transforms and scales;
- collision type and bounds;
- unique marker names;
- source world and schema compatibility.

The review view should visualize changes before they are accepted. Height
differences need signed colors, while masks and placements should distinguish
added, removed, and modified data.

## Implementation Stages

### Stage 1 — Viewer and tile session

- Create `/editor/world.html`.
- Load the generated world and shared renderer.
- Add overview, tile selection, camera modes, debug views, and dirty state.
- Define the tile override schema and browser save/load format.

### Stage 2 — Terrain sculpting

- Add raise, lower, smooth, flatten, and restore brushes.
- Implement GPU preview and CPU-authoritative deltas.
- Add compact undo/redo commands.
- Make cross-tile strokes and edge updates seam-safe.

### Stage 3 — Biome painting

- Paint and normalize biome weights.
- Add constrained brushes and production-material preview.
- Preview vegetation eligibility and surface deformation behavior.

### Stage 4 — Assets and markers

- Register GLB prototypes.
- Place and transform assets and markers.
- Add deterministic scatter painting, exclusions, collisions, and LOD preview.

### Stage 5 — Roads and hydrology

- Edit road and water control data.
- Rebuild local masks, grading, depth, shorelines, and exclusions.
- Add bridge markers and crossing validation.

### Stage 6 — Blender export and import

- Export GLB, masks, and manifest.
- Validate imported packages.
- Convert edited terrain geometry into height deltas.
- Convert repeated props into placement records.

### Stage 7 — Difference review and baking

- Add before/after comparison views.
- Accept changes by category.
- Regenerate affected neighboring data.
- Produce the final runtime world package.

## Main Technical Risks

- preserving seams during cross-tile sculpting;
- keeping GPU previews and CPU-authoritative data identical;
- compact undo history for large brush strokes;
- resampling Blender terrain without losing meaningful shapes;
- handling stale imports after generator changes;
- reconciling authored roads and water with procedural hydrology;
- retaining stable IDs across asset and landmark revisions;
- preventing unique GLB geometry from replacing data that should remain
  streamable fields or instances.

## Recommended Starting Point

Start with tile selection, height sculpting, biome painting, undo/redo, and a
versioned tile-override file. These establish the permanent data model. Asset
placement and Blender exchange should be built after edited tiles can already be
saved, reloaded, validated, and rendered identically.
