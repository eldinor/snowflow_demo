# Initial avatar web editor

## Purpose

Create a separate browser editor for fitting externally created heads and rigid
accessories to the procedural Exalted avatar.

The editor handles integration tasks:

- Importing a GLB.
- Selecting its avatar role.
- Attaching it to a procedural bone.
- Positioning, rotating, and scaling it.
- Previewing it through actual Exalted poses and rendering.
- Validating the asset.
- Exporting a runtime package and fitting manifest.

It is not intended to replace Blender for sculpting, retopology, UV unwrapping,
weight painting, or creating facial morph targets.

Related documents:

- [Avatar_Guide.md](Avatar_Guide.md) — artist export and Blender workflow.
- [Avatar_Exchange.md](Avatar_Exchange.md) — full exchange implementation plan.
- [AVATAR.md](AVATAR.md) — current procedural avatar architecture.
- [ARCHITECTURE.md](ARCHITECTURE.md) — application architecture.

## Initial page

Create:

```text
avatar_editor.html
src/avatarEditor/
  main.ts
  editor.ts
  importedPart.ts
  validation.ts
  exportPackage.ts
  editor.css
```

The page remains separate from the world application. Reusable loading,
validation, material, and attachment code must live outside the page coordinator
so the main runtime can consume the same prepared assets.

## Initial scope

The first editor supports rigid replacement heads, masks, helmets, hair, glasses,
horns, earrings, and similar single-bone accessories.

The first version does not support sculpting, retopology, UV editing, weight
painting, flowing garments, arbitrary skinned body replacement, facial animation,
or imported animation clips.

## Required avatar refactor

The generated head is currently part of the combined body mesh. The editor and
runtime need to hide the original head without hiding hands or other skin.

Split generated rendering into:

```text
charBody
charHead
charCloth
charFur
```

`charBody` and `charHead` continue using the same transform texture, pose
solver, character surface shader, palette, atmosphere, depth, and shadow passes.

The character owner should expose:

```ts
setDefaultHeadVisible(visible: boolean): void;
loadPart(slot: AvatarPartSlot, asset: PreparedAvatarPart): Promise<void>;
removePart(slot: AvatarPartSlot): void;
```

A separate head mesh is preferred over shader discard because it gives clear
bounds, export identity, visibility, shadow registration, and disposal ownership.

## Editor layout

```text
┌────────────────────────────────────────────────────────────┐
│ Import Head  Save Package  Reset  Animation: Walking       │
├──────────────────────────────────────┬─────────────────────┤
│                                      │ Head                 │
│                                      │ Position X Y Z       │
│          3D preview                  │ Rotation X Y Z       │
│                                      │ Scale                │
│                                      │                      │
│                                      │ Attachment: head     │
│                                      │ Original head [ ]    │
│                                      │ Hood [x]             │
│                                      │ Cloth [x]            │
│                                      │ Fur [x]              │
│                                      │                      │
│                                      │ Validation           │
│                                      │ ✓ normals            │
│                                      │ ✓ UV                 │
│                                      │ ✓ applied transform  │
└──────────────────────────────────────┴─────────────────────┘
```

Main controls:

- Import GLB and export package.
- Reset fitting transform.
- Pose preset and attachment bone.
- Position, rotation, and scale values.
- Translation, rotation, and scale gizmo mode.
- Default-head, hood, cloth, and fur visibility.
- Wireframe and bounds.
- Imported and Exalted material preview.
- Validation results.

## Camera and interaction

Use an orbit camera centred on the upper torso. Provide orbit, zoom, pan, frame
selected, camera reset, and front, side, back, and three-quarter presets.

Use Babylon gizmos for translation, rotation, and scale. Numeric controls and
gizmos update the same fitting-transform state. Camera controls must pause while
a gizmo or numeric control is active.

## Input asset contract

The simplest accepted GLB contains one mesh node:

```text
part:head
```

For the initial rigid workflow it does not require a skeleton, skin weights,
animation clips, or cloth metadata.

It requires positions, normals, finite geometry, applied or explicitly handled
transforms, a sensible scale, and preferably UVs.

The imported mesh attaches to the runtime `head` bone. The editor fitting
transform adjusts it relative to that bone.

## Fitting transform

Store fitting values separately from source mesh transforms:

```ts
interface AvatarPartTransform {
    position: readonly [number, number, number];
    rotation: readonly [number, number, number];
    scale: readonly [number, number, number];
}
```

Shared transform order:

```text
procedural bone matrix
    × fitting translation/rotation/scale
    × prepared source transform
    × vertex position
```

Do not re-export geometry merely to store fitting values. Keeping them in the
manifest makes iteration quick and preserves the artist's original GLB.

## Pose preview

Reuse the real `Figure` solver with a controlled preview movement state. Provide
bind, idle, walk, run, left/right surf lean, swimming, flight hover, fast flight,
head-look, and representative spell-casting presets.

Allow pose animation to pause at any frame. A moving preview reveals collisions
with the hood, scarf, shoulders, and cloth that a static head rotation misses.

## World rendering preview

Reuse character WGSL materials, analytic sky and sun, atmospheric colour, character
depth and shadows, spell-light bindings, tonemapping, and relevant post-processing.

Provide a neutral studio setting in addition to the Exalted sky. The Exalted
setting is authoritative for final colour and silhouette review. Avoid loading the
full terrain and desert props in the initial editor.

## Material modes

### Exalted skin

Ignore imported material shading and use the current Exalted skin palette and
fabric lighting. This is the safest initial mode.

### Imported base colour

Read the GLB base-colour texture while retaining Exalted lighting and atmosphere.
Later support can add normal, roughness/ORM, alpha, subsurface, and hair parameters.
Alpha behavior must match across beauty, depth, and shadow passes.

## Validation

Validate immediately after import and before export.

Errors:

- Missing positions or unusable normals.
- Non-finite positions, normals, or transforms.
- Empty geometry, invalid indices, or unsupported primitive mode.
- Degenerate or extreme bounds.
- Negative or zero scale.
- Unsafe source transforms.

Warnings:

- Missing UVs or materials.
- Very high triangle count.
- Unusually large or small head bounds.
- Pivot far from the skull region.
- Oversized embedded textures.
- Geometry intersecting the neck or hood in tested poses.

Export is blocked by errors and allowed with warnings. Reuse shared contracts from
`avatarValidation.ts`; move CLI checks into environment-neutral modules rather
than duplicating them in the browser.

## Output package

```text
custom-head/
  head.glb
  head.manifest.json
```

Example:

```json
{
  "schema": "exalted-avatar-part",
  "version": 1,
  "part": "head",
  "mode": "rigid",
  "bone": "head",
  "source": "head.glb",
  "position": [0, 0.03, 0.01],
  "rotation": [0, 0, 0],
  "scale": [1, 1, 1],
  "hideDefaultHead": true,
  "material": { "mode": "exalted-skin" }
}
```

The manifest also records the source hash, bounds, triangle count, material mode,
texture references, and editor version. Separate GLB and manifest downloads are
sufficient initially; ZIP packaging can follow.

## Runtime attachment

The rigid-head path:

1. Loads prepared geometry under character ownership.
2. Reads the procedural head matrix.
3. Applies the fitting transform.
4. Uses the imported-part character material.
5. Registers spell lighting, depth, and shadows.
6. Follows character visibility.
7. Hides the generated head when requested.
8. Disposes all owned meshes, materials, and textures.

A rigid head does not need a Babylon skeleton. It follows one existing procedural
bone matrix.

## Resource ownership

An `AvatarPart` owns its mesh, fitting transform, beauty/depth/shadow materials,
textures, slot, bone mapping, and visibility. `Character` owns active part slots
and disposes them. Replacement occurs only after the new part is ready.

## Performance constraints

- No allocation in the normal preview animation loop.
- A rigid head adds one beauty draw and required depth and nearby shadow draws.
- Reuse existing transform storage; do not create a skeleton per rigid part.
- Do not rebuild geometry when fitting values change.
- Dispose object URLs after loading.
- Warn about excessive textures before allocating large GPU resources.

## Browser limitations

Keep sculpting, retopology, UV unwrapping, detailed weight painting, complex mesh
repair, facial morph creation, and garment design in Blender.

The web editor owns attachment, final placement, material selection, pose and
lighting preview, validation, and package export.

## Implementation stages

### Stage 1 — Separate generated head

Deliver a separate procedural head mesh with independent visibility and matching
beauty, depth, shadow, triangle accounting, and disposal. The default avatar must
remain visually unchanged.

### Stage 2 — Runtime rigid-part slot

Add versioned part manifests, an `AvatarPart` owner, head slot, bone lookup, and
render/lifecycle integration. A test head must follow every procedural pose and
survive teleport and reset without leaking resources.

### Stage 3 — Editor shell

Create `avatar_editor.html`, orbit camera, Exalted preview, sidebar, pose presets,
and visibility controls. It must load independently from the main world.

### Stage 4 — GLB import and fitting

Add file picker, drag and drop, object URL cleanup, mesh extraction, bone
attachment, Babylon gizmos, numeric controls, reset, and frame-selected actions.

### Stage 5 — Validation

Extract shared validation, build the results panel, and block malformed exports.
CLI and browser checks must agree.

### Stage 6 — Package export

Download GLB plus manifest with source hash and report data. Reloading the package
must reproduce the editor preview.

### Stage 7 — Imported textures

Add base-colour textures, colour-space handling, size warnings, and matching alpha
behavior. Preserve texture-free Exalted skin mode.

### Stage 8 — Additional rigid slots

Add masks, helmets, hair, glasses, horns, and generic accessories without creating
duplicate bone systems.

## Initial acceptance checklist

- [ ] Default head is a separately controllable mesh.
- [ ] Default avatar appearance is unchanged.
- [ ] Runtime can load and remove one rigid head part.
- [ ] Imported head follows the procedural `head` matrix.
- [ ] Imported head renders in beauty, depth, and shadows.
- [ ] Imported head receives atmosphere and spell lighting.
- [ ] Editor page loads the real procedural avatar.
- [ ] GLB upload and object URL cleanup work.
- [ ] Transform gizmos and numeric inputs stay synchronized.
- [ ] Pose presets expose hood, neck, and shoulder intersections.
- [ ] Validation blocks malformed assets.
- [ ] GLB and manifest export reproduce the editor preview.

## Recommended first milestone

Implement Stages 1 through 4 with Exalted skin material only:

1. Separate the default head.
2. Add one rigid runtime head slot.
3. Create the editor page.
4. Load a local `part:head` GLB.
5. Fit it using gizmos.
6. Preview it through walking, flight, and casting poses.

This proves the difficult integration points before textures, packaging, or more
accessory types.
