# Mixamo Avatars in Exalted

## Assessment

The available avatars, models, and animations are already in GLB format. This
removes the FBX conversion stage and makes initial integration low to moderate
difficulty.

For a character and animations that use the same Mixamo skeleton, integration
should require an adapter and validation rather than changes to Exalted's
movement system. The more difficult work begins later with interchangeable
clothing, faces, body proportions, and animation retargeting between genuinely
different rigs.

## Integration Responsibilities

For each complete avatar:

1. Load the GLB as a reusable character prototype.
2. Find its skinned meshes, skeleton, morph targets, and animation groups.
3. Normalize visual scale, forward direction, and ground offset.
4. Map animation groups to Exalted actions.
5. Disable animation root motion when the Exalted controller owns movement.
6. Map important bones for spells, equipment, effects, and camera targeting.
7. Attach the imported visual root to the existing character controller.
8. Validate grounding, bounds, shadows, visibility, and disposal.

Gameplay movement must remain authoritative. Walking, flight, swimming,
collision, and terrain grounding should drive the imported avatar rather than be
reimplemented for every GLB.

## Architecture

```text
AvatarController
    gameplay movement, collision, flight, swimming, and state
          |
AvatarAdapter
    scale, axes, ground offset, bone map, animation map, attachments
          |
Mixamo GLB
    skeleton, skinned meshes, materials, morphs, and animation groups
```

`AvatarController` should not contain Mixamo bone names. `AvatarAdapter` exposes
the stable Exalted actions and attachment points required by gameplay.

## Humanoid Contract

Use a stable semantic bone map:

```ts
interface HumanoidBoneMap {
    root: string;
    hips: string;
    spine: string;
    chest?: string;
    neck: string;
    head: string;
    leftUpperArm: string;
    leftLowerArm: string;
    leftHand: string;
    rightUpperArm: string;
    rightLowerArm: string;
    rightHand: string;
    leftUpperLeg: string;
    leftLowerLeg: string;
    leftFoot: string;
    rightUpperLeg: string;
    rightLowerLeg: string;
    rightFoot: string;
}
```

Optional semantic bones may cover toes, shoulders, fingers, eyes, jaw, weapon
sockets, cloth helpers, and hair. Gameplay should only require the core map.

## Avatar Manifest

Each avatar should have a versioned manifest rather than character-specific
runtime code.

```json
{
  "schema": "exalted-avatar",
  "version": 1,
  "id": "mixamo-avatar-01",
  "file": "/avatars/mixamo-avatar-01.glb",
  "scale": 1,
  "rotationY": 3.14159,
  "groundOffset": 0,
  "rootMotion": false,
  "bones": {
    "hips": "mixamorig:Hips",
    "head": "mixamorig:Head",
    "leftHand": "mixamorig:LeftHand",
    "rightHand": "mixamorig:RightHand",
    "leftFoot": "mixamorig:LeftFoot",
    "rightFoot": "mixamorig:RightFoot"
  },
  "animations": {
    "idle": "Idle",
    "walk": "Walking",
    "run": "Running",
    "jump": "Jump",
    "fall": "Falling Idle",
    "swim": "Swimming",
    "fly": "Flying",
    "land": "Landing"
  }
}
```

The production manifest should also define:

- visual height and scale;
- source and runtime forward axes;
- ground and foot offsets;
- root-motion policy per animation;
- collision capsule dimensions;
- camera focus and shoulder offsets;
- animation playback rates and blend times;
- head, hands, feet, back, weapon, and spell attachment points;
- optional head, clothing, hair, and equipment slots;
- material overrides;
- expected skeleton signature and source hash.

## Animation Mapping

Map imported animation names to semantic Exalted actions:

- idle;
- walk forward and backward;
- strafe left and right;
- run or sprint;
- jump start;
- airborne or fall;
- land;
- swim idle and swim movement;
- flight idle and directional flight;
- spell cast actions;
- optional emotes and interactions.

The controller selects semantic actions. The adapter resolves those actions to
the actual animation groups contained in the avatar or animation library.

Use configurable cross-fade times. Locomotion speed should control animation
playback rate within restrained limits so feet remain believable without making
the animation visibly accelerated.

## Root Motion

The first integration should disable root motion and let the existing Exalted
controller drive world translation and rotation. Imported animations may retain
hip motion relative to the root, but accumulated horizontal root translation
must not move the gameplay capsule.

Later, selected actions such as attacks or authored interactions may expose
root-motion deltas to the controller. This must be explicit per animation and
validated against collisions.

## Separate Animation GLBs

When animations are stored in separate GLBs:

1. Load the avatar skeleton once.
2. Load each animation GLB in an isolated asset container.
3. Ignore or dispose of its visible demonstration mesh.
4. Normalize bone names and match targets to the avatar skeleton.
5. Clone animation tracks onto the avatar's transform nodes or bones.
6. Correct hip height, scale, and forward-axis differences if required.
7. Store the result in a semantic animation library.
8. Dispose temporary source nodes after transfer.

If all files use the same Mixamo skeleton and rest pose, target-name mapping
should be sufficient. Differences in rest pose, proportions, axes, or bone
hierarchy require retargeting rather than simple track transfer.

The importer should normalize common prefixes such as `mixamorig:` without
modifying the original asset. It must reject ambiguous duplicate target names.

## Skeleton and GPU Handling

- Enable texture storage for bone matrices where supported:
  `skeleton.useTextureToStoreBoneMatrices = true`.
- Validate the maximum bone influences per vertex.
- Check for floating-point joint indices that should have been exported as
  unsigned integer data.
- Preserve inverse bind matrices and rest pose.
- Reject missing, duplicated, or non-finite bone transforms.
- Reuse loaded geometry and materials between avatar instances when practical.

## Grounding and Movement

The imported visual root follows the existing gameplay capsule. Configure
ground offset independently from the skeleton's hip height.

Validate:

- both feet reach the terrain during idle and locomotion;
- slopes do not push the avatar below the surface;
- animation hip motion does not cause visible floating;
- movement direction and avatar forward axis agree;
- walking and running do not visibly slide;
- flight leaning applies to the visual root without rotating the collision
  capsule incorrectly;
- swimming places the body relative to the water surface correctly.

Foot IK can be added after the first avatar works, using the semantic foot and
lower-leg bones from the manifest.

## Attachments and Effects

Resolve gameplay attachments through semantic names:

- head and camera focus;
- left and right hands;
- left and right feet;
- chest and back;
- weapon sockets;
- spell origins;
- flight and landing effects.

Offsets belong in the avatar manifest because body proportions differ between
characters even when bone names match.

## Clothing and Head Replacement

Complete Mixamo characters with their original clothes are the simplest first
target. Clothing built for the existing Exalted avatar will not automatically
fit another body's proportions or skin weights.

Modular clothing requires one of these approaches:

1. author and skin clothing separately for every body;
2. standardize all avatars on one body mesh and skeleton;
3. build a more complex runtime fitting and corrective-shape system.

Head replacement also requires compatible neck geometry, materials, skinning,
proportions, and possibly facial morph targets. Treat it as a later avatar-editor
feature rather than a prerequisite for Mixamo integration.

## Avatar Preview Page

Create a separate `/avatar-preview.html` page before replacing the playable
avatar. It should support:

- selection of an avatar GLB;
- loading one or more animation GLBs;
- skeleton and animation inspection;
- playback, pause, scrubbing, looping, speed, and cross-fade controls;
- semantic action mapping;
- scale, rotation, hip height, and ground-offset adjustment;
- root-motion visualization and toggle;
- bone markers and hierarchy view;
- attachment-point preview;
- collision capsule and camera target display;
- material and morph inspection;
- manifest export;
- validation report.

Report at least:

- missing semantic bones;
- duplicate or unmatched animation targets;
- skeleton signature mismatch;
- unsupported morph targets;
- invalid joint indices or weights;
- mesh, material, texture, bone, and triangle counts;
- character bounds and computed height;
- animation durations and target counts;
- texture-backed bone-matrix status.

## Implementation Stages

### Stage 1 — Inspection and manifest

- Load one avatar GLB on the preview page.
- List its meshes, skeletons, bones, morphs, materials, and animations.
- Build and validate the semantic bone map.
- Export a versioned avatar manifest.

### Stage 2 — Animation library

- Map embedded animation groups.
- Import separate animation GLBs.
- Normalize target names and copy tracks.
- Add playback, cross-fading, and root-motion diagnostics.

### Stage 3 — Existing controller integration

- Attach the visual root to the Exalted controller.
- Drive idle, walk, run, airborne, land, swim, and flight states.
- Tune speed matching, scale, forward axis, and grounding.

### Stage 4 — Attachments and effects

- Connect spell origins, hand and foot effects, camera focus, swimming, and
  flight leaning through semantic attachments.
- Validate bounds, shadows, collisions, and disposal.

### Stage 5 — Multiple avatars

- Load avatars from manifests without character-specific code.
- Share compatible animation libraries.
- Add selection and hot swapping.
- Measure loading time, memory, shader variants, and transition behavior.

### Stage 6 — Modular appearance

- Define supported body standards.
- Add compatible head, hair, clothing, and equipment slots.
- Add validation for skeleton, bind pose, neck seams, materials, and clipping.

## Recommended First Milestone

Integrate one complete Mixamo GLB, with its existing clothes, as a replacement
visual for the current avatar while retaining the existing Exalted controller.
Use embedded animations first. Add separate animation GLBs only after grounding,
movement direction, transitions, swimming, flight, and spell attachments work
correctly.

## Editable Garments and Runtime Cloth

Exalted should use a hybrid garment system. Regular skeletal skinning keeps the
main garment fitted to the avatar, while a small custom Verlet/XPBD simulation
moves only loose sections. This gives visible secondary motion without paying
the cost and instability of simulating every clothing vertex.

Good simulation candidates include:

- capes and cloaks;
- skirts and robe hems;
- scarves and loose sleeves;
- belts, straps, ribbons, and hanging ornaments.

Tight shirts, trousers, boots, and rigid armour should remain skinned. Their
motion is already described well by the avatar skeleton, and cloth simulation
would add collision and clipping problems with little visual benefit.

### Garment data

Store authoring information in a versioned JSON manifest beside each garment
GLB. A garment definition should include at least:

```ts
interface GarmentDefinition {
  id: string;
  mesh: string;
  materialPreset: string;

  simulatedVertices: number[];
  pinnedVertices: Array<{
    vertex: number;
    bone: string;
    offset: [number, number, number];
  }>;

  structuralEdges: Array<[number, number]>;
  bendingEdges: Array<[number, number]>;

  stiffness: number;
  bendStiffness: number;
  damping: number;
  gravityScale: number;
  windResponse: number;
  collisionRadius: number;
}
```

The manifest should also record its garment schema version, compatible avatar
standard, source skeleton signature, mesh scale, forward axis, and optional LOD
settings. This makes an edited garment portable between compatible Mixamo
avatars.

### Solver

Use an XPBD-style Verlet solver instead of unrestricted basic Verlet. XPBD
provides controllable stretch and bend compliance and behaves more consistently
when frame time changes.

The preferred production path is to simulate a reduced control mesh and apply
its movement to the rendered garment through helper bones or interpolated
vertex offsets. The visible garment can therefore retain detailed folds, UVs,
normal maps, and good silhouettes without becoming the physics mesh.

Use a fixed simulation time step, cap accumulated time after long frames, and
interpolate the rendered result. Start with structural and bending constraints;
add area constraints only if garments visibly collapse. Self-collision should
be deferred because it is substantially more expensive.

### Avatar collision

Use simple body proxies rather than collision against the rendered body mesh:

- torso and pelvis capsules;
- left and right thigh capsules;
- optional upper-arm capsules;
- a head sphere for hoods;
- optional shoulder spheres for capes.

Attach these proxies to semantic skeleton bones and update them after skeleton
animation but before cloth simulation. Give garments a small collision margin
and allow per-proxy exclusions where the authored shape would otherwise catch.

### Cloth update order

Each simulation frame should run in this order:

1. Evaluate the avatar animation and cross-fades.
2. Update semantic bone transforms and body collision proxies.
3. Move pinned cloth particles to their bone attachment positions.
4. Integrate gravity, avatar acceleration, and world wind.
5. Solve structural, bending, and body collision constraints.
6. Update helper bones or the garment vertex buffer.
7. Recompute or approximate normals as required by the rendering path.

Avatar velocity should influence loose cloth so that running, sharp turns,
jumping, and fast flight produce convincing lag. Wind should use the same world
wind source as vegetation, with a garment-specific response multiplier.

### Distance quality

Use distance-based cloth quality:

| Avatar distance | Garment behaviour |
| --- | --- |
| 0-15 m | Full control mesh and normal solver iterations |
| 15-40 m | Reduced solver iterations or reduced control mesh |
| 40-80 m | Bone spring secondary motion |
| Beyond 80 m | Skeletal skinning only |

Update quality gradually and add hysteresis so the garment does not switch
modes repeatedly near a boundary. Off-screen avatars can pause the solver and
resume from their current skinned pose.

### Browser garment editor

The avatar editor can provide a garment mode for:

- importing a garment GLB;
- assigning it to the Exalted humanoid skeleton;
- painting simulated, pinned, and excluded vertices;
- generating structural and bending constraints;
- positioning and resizing avatar collision proxies;
- editing stiffness, bend stiffness, damping, gravity, wind, thickness, and
  solver iterations;
- previewing idle, walking, running, jumping, swimming, and flying;
- highlighting stretch, collision penetration, and pinned regions;
- saving and loading the garment manifest;
- exporting the garment to Blender when topology, UV, weighting, or tailoring
  changes are required.

The web editor can handle fitting, physics painting, material choices, and
preview tuning. Blender remains the appropriate tool for cutting new garment
patterns, changing topology, creating UVs, weight painting, and sculpting folds.

### Garment Lab milestone

Build a separate `garment-lab.html` prototype before integrating realtime cloth
with the playable avatar. The first garment should be one cape with:

- a reduced grid of roughly 10-20 simulated control points;
- neck and shoulder pins;
- torso, shoulder, and optional upper-leg collision proxies;
- gravity, wind, stiffness, bend stiffness, damping, collision radius, and
  solver-iteration controls;
- walking, running, turning, jumping, and flying previews;
- wireframe and constraint visualization;
- JSON import and export;
- frame time, simulated particle count, and constraint count measurements.

This prototype should establish the garment manifest and performance envelope.
After it is stable, integrate the same solver as a self-contained avatar module
and test a skirt or robe hem, which exercises more difficult leg collisions.
