# Avatar export and exchange plan

See [AVATAR.md](AVATAR.md) for the current avatar implementation and customization
constraints.
See [Initial_Editor.md](Initial_Editor.md) for the proposed browser-based fitting
and preview editor.

## Goal

Create a reliable round trip:

```text
Exalted procedural avatar
        ↓ export
Standard authoring GLB
        ↓ edit in Blender
Edited GLB
        ↓ validate and prepare
Exalted runtime avatar asset
```

The exchange pipeline must preserve the existing movement controller, procedural
posing, planted-foot IK, surfing, swimming, flight, shadows, depth prepass, and
post-processing integration.

The first production milestone is deliberately narrow: export the current avatar,
edit or replace its head in Blender, and import the result without changing
locomotion or cloth.

## Why a conversion pipeline is required

The runtime avatar is not a conventional GLB character:

- It uses a custom 18-bone rig and procedural animation.
- Body geometry stores custom `boneIdx` and `boneWt` attributes.
- Bone matrices and simulated cloth nodes share a custom GPU texture.
- Cloth mesh positions encode panel coordinates rather than final vertices.
- Fur is expanded and alpha-tested in custom shaders.
- Materials use palette indices and custom WGSL.

A normal Babylon scene export would therefore lose or misrepresent important
runtime data. The authoring GLB will be a standard editable representation, while
an importer converts approved edits back to the runtime representation.

## Scope

### Initial scope

- Export the current bind-pose skeleton and skinned body.
- Provide stable part, bone, and material names.
- Export baked cloth and simplified fur as editing references.
- Import a replacement head or rigid accessory.
- Import ordinary skinned body parts using the existing skeleton.
- Validate scale, axes, skeleton, weights, material slots, and mesh bounds.
- Restore Exalted materials, depth rendering, and shadows after import.

### Deferred scope

- Arbitrary cloth topology.
- Imported animation clips.
- Runtime skeleton replacement.
- Major body-proportion changes.
- Facial animation and lip synchronization.
- Fully equivalent Blender previews of procedural fabric and fur.

## Proposed file layout

```text
src/character/
  avatarRig.ts             shared bone and bind-pose definition
  avatarAsset.ts           runtime prepared-asset loader
  avatarValidation.ts      reusable validation contracts
  character.ts             runtime owner and material integration

scripts/avatar/
  export-avatar.mts        creates the editable authoring package
  prepare-avatar.mts       validates and converts an edited GLB
  inspect-avatar.mts       emits a human-readable asset report

public/assets/avatar/
  default/
    avatar.runtime.glb
    avatar.manifest.json

avatar-export/              generated and ignored from source control
  exalted-avatar.glb
  avatar-manifest.json
  README.md

reports/
  avatar-validation.json
```

Suggested commands:

```bash
npm run avatar:export
npm run avatar:inspect -- path/to/edited-avatar.glb
npm run avatar:prepare -- path/to/edited-avatar.glb
```

## Coordinate and unit contract

The authoring contract must be written into both the generated README and manifest:

- Units: metres.
- Up axis: positive Y.
- Character forward: positive Z.
- Bind pose: current Exalted bind pose.
- Character height: approximately 1.79 m.
- Object and armature scale: `1, 1, 1`.
- Required transforms must be applied before Blender export.
- Maximum influences per vertex: four.
- Skin weights must be finite, non-negative, and normalized.

The converter owns any glTF coordinate-system conversion. Artists should not add
manual mirror or 90-degree correction transforms.

## Shared rig contract

Move the bind-pose table and rig identity out of `figure.ts` into
`avatarRig.ts`. Both the runtime pose solver and exporter must consume the same
data.

The shared definition should contain:

```ts
interface AvatarBoneDefinition {
    index: number;
    name: AvatarBoneName;
    parent: AvatarBoneName | null;
    joint: readonly [number, number, number];
    direction: readonly [number, number, number];
    forward: readonly [number, number, number];
}
```

Required stable names:

| Index | Bone |
| ---: | --- |
| 0 | `root` |
| 1 | `spine` |
| 2 | `chest` |
| 3 | `neck` |
| 4 | `head` |
| 5 | `hood` |
| 6 | `upper_arm.L` |
| 7 | `forearm.L` |
| 8 | `hand.L` |
| 9 | `upper_arm.R` |
| 10 | `forearm.R` |
| 11 | `hand.R` |
| 12 | `thigh.L` |
| 13 | `shin.L` |
| 14 | `foot.L` |
| 15 | `thigh.R` |
| 16 | `shin.R` |
| 17 | `foot.R` |

Before implementation, explicitly confirm the parent hierarchy against the
current world-space matrix solver. Do not infer and freeze a hierarchy only from
the order of the constants.

The runtime must retain numeric indices for its packed texture. Names provide the
stable authoring and validation interface.

## Part contract

Every exchangeable object needs a stable part identifier, independent of Blender
object names chosen during editing.

Initial parts:

| Part ID | Mode | Required attachment |
| --- | --- | --- |
| `body` | Skinned | Full rig |
| `head` | Rigid or skinned | `head` |
| `hood` | Rigid or skinned | `hood` / head chain |
| `glove.L` | Skinned | Left arm chain |
| `glove.R` | Skinned | Right arm chain |
| `boot.L` | Skinned | Left leg chain |
| `boot.R` | Skinned | Right leg chain |
| `accessory.*` | Rigid | Declared bone |
| `cloth.*` | Reference initially | Cloth manifest |
| `fur.*` | Generated | Declared source surface |

Rigid parts should use an explicit bone attachment rather than a one-vertex skin
workaround.

## Material contract

The authoring GLB should expose ordinary preview materials using stable names:

| Runtime slot | Authoring material |
| ---: | --- |
| 0 | `exalted_robe` |
| 1 | `exalted_mantle` |
| 2 | `exalted_tunic` |
| 3 | `exalted_leather` |
| 4 | `exalted_skin` |
| 5 | `exalted_trim` |
| 6 | `exalted_fur` |

During initial import, these names map back to current palette slots. Preview
material values are for Blender readability and are not authoritative runtime
shading.

Texture-painted avatars require a later shader extension with:

- Base-colour texture.
- Normal texture.
- Roughness or ORM texture.
- Stable UV set.
- Texture bindings in the character beauty material.
- Matching alpha behavior in depth and shadow materials where necessary.

## Authoring manifest

The generated package should include a versioned manifest:

```json
{
  "schema": "exalted-avatar-exchange",
  "version": 1,
  "units": "meters",
  "upAxis": "+Y",
  "forwardAxis": "+Z",
  "rig": "exalted-humanoid-v1",
  "parts": {
    "head": {
      "node": "part:head",
      "mode": "rigid",
      "bone": "head"
    },
    "body": {
      "node": "part:body",
      "mode": "skinned"
    }
  },
  "cloth": {
    "editable": false,
    "topology": "exalted-cloth-v1"
  }
}
```

The prepared runtime manifest should additionally record:

- Source filename and content hash.
- Preparation tool version.
- Validation results.
- Bounds and triangle counts per part.
- Joint remapping table.
- Material remapping table.
- Optional texture paths.

## Exporter design

Use the installed `@babylonjs/serializers` package rather than writing GLB binary
packing manually.

The exporter should:

1. Start a Babylon `NullEngine` scene.
2. Build the current body through the existing procedural builder.
3. Read positions, normals, UVs, indices, material IDs, `boneIdx`, and
   `boneWt`.
4. Create a temporary standard Babylon skeleton from `avatarRig.ts`.
5. Convert custom bone data to standard matrices-indices and matrices-weights
   vertex buffers.
6. Split material IDs into exporter-compatible primitives or submeshes.
7. Bake cloth control grids into bind-pose reference geometry.
8. Create simplified fur reference geometry or omit it with a clear manifest
   entry.
9. Add stable node, part, bone, and material names.
10. Export GLB and the companion manifest.
11. Re-open and inspect the generated GLB before reporting success.

The exporter is an offline development tool and may allocate freely.

## Blender editing rules

The generated package README should tell artists to:

- Preserve required bones and their names.
- Preserve bind-pose armature transforms.
- Keep metre scale and apply object transforms.
- Keep the avatar facing positive Z.
- Keep no more than four influences per vertex.
- Avoid negative scale and unapplied mirror modifiers on export.
- Triangulate deterministically during preparation.
- Export normals, UVs, skin weights, and requested morph targets.
- Keep required part identifiers or matching custom properties.
- Use one armature for exchangeable skinned parts.
- Treat baked cloth and fur as references until their exchange stages are enabled.

The importer must enforce the contract rather than trusting these instructions.

## Inspector and validation report

`avatar:inspect` must not mutate the source file. It should report:

- Scene nodes, meshes, primitives, materials, skins, joints, and morph targets.
- Units and transforms.
- Bounding boxes and character height.
- Vertex and triangle counts.
- UV and normal availability.
- Weight influence distribution.
- Missing, additional, and duplicated bones.
- Non-normalized or invalid weights.
- Vertices influenced by unknown joints.
- Material and part mapping.
- Texture formats, dimensions, and colour-space expectations.
- Cloth and fur objects accidentally presented as ordinary runtime body parts.

Machine-readable results go to `reports/avatar-validation.json`. The terminal
summary should identify errors, warnings, and accepted deviations.

## Preparation and import

`avatar:prepare` should:

1. Run the full inspection and stop on contract errors.
2. Bake allowed object transforms.
3. Triangulate and normalize geometry.
4. Normalize and limit weights to four influences.
5. Remap GLB joint indices to Exalted numeric bone indices.
6. Convert material names to runtime material IDs.
7. Preserve or generate normals and validated UVs.
8. Remove authoring-only reference meshes.
9. Optimize vertex and index buffers without merging semantic part boundaries.
10. Write the runtime asset and manifest.
11. Load the written asset again and verify counts, bounds, mappings, and hashes.

The runtime loader should convert prepared GLB data into the existing custom
buffers. It must not replace the procedural pose solver or introduce Babylon
animation playback.

Loaded parts must register with:

- Character beauty rendering.
- Depth prepass.
- Character shadow cascades where applicable.
- Spell-light consumers.
- Visibility controls.
- Character disposal.

## Cloth exchange

Cloth is a separate later milestone. A baked cloth surface is useful for fitting
other parts but cannot restore simulation.

Editable cloth should be exported as named control cages:

```text
cloth:robe.front
cloth:robe.back
cloth:sleeve.L
cloth:sleeve.R
```

Each manifest entry must record:

- Fixed row and column counts.
- Vertex ordering.
- Attachment nodes and bones.
- Distance and bending constraint profiles.
- Shape-memory strength.
- Collision profile.
- Runtime material slot.
- Surface reconstruction parameters.

For a given topology version, the importer must require exact cage dimensions and
ordering. A topology change creates a new cloth version and explicit runtime
configuration.

## Fur exchange

Fur should remain generated at runtime. The edited asset can supply named trim
curves, rings, or source surfaces. Preparation converts these to the compact data
needed by the current shell renderer.

Do not export every fur shell as editable geometry; it would obscure the source
shape and produce a much heavier asset.

## Facial work

The current head is featureless and has no face rig. Implement face work after the
basic head round trip:

1. Import a detailed neutral head.
2. Add texture support to the character shader.
3. Support named morph targets such as blink and basic expressions.
4. Add a small expression controller.
5. Extend beauty, depth, and shadow behavior for any alpha-tested features.

Do not add facial bones to the base rig until morph targets prove insufficient.
Changing the required rig would affect every prepared avatar.

## Staged implementation

Current status: Stages 1 through 3 are complete. The authoring package contains the
standard 18-joint skinned body, baked bind-pose cloth and fur references, manifest,
and Blender instructions. The exporter verifies the written GLB structure, and
the read-only inspector emits a detailed validation report and failing exit code.

### Stage 1 — Freeze the exchange contract

Deliverables:

- Shared `avatarRig.ts`.
- Confirmed parent hierarchy and inverse bind matrices.
- Stable bone, part, material, axis, and unit conventions.
- Versioned TypeScript manifest types.

Acceptance:

- Existing avatar movement and rendering remain visually unchanged.
- Runtime and exporter consume the same rig definition.
- Current character tests and type checking pass.

### Stage 2 — Export a Blender reference

Deliverables:

- `avatar:export` command.
- Standard skinned body and armature in GLB.
- Baked cloth and fur references.
- Authoring manifest and generated README.

Acceptance:

- Blender imports the avatar upright, at the expected height and facing direction.
- The armature deforms the body correctly in a simple manual pose.
- Material and part names are recognizable.
- Repeated exports are structurally deterministic.

### Stage 3 — Read-only inspection

Deliverables:

- `avatar:inspect` command.
- JSON validation report.
- Required-bone, transform, material, UV, bounds, and weight checks.

Acceptance:

- The untouched exported GLB passes.
- Deliberately renamed bones, invalid weights, wrong scale, and missing UVs produce
  specific actionable errors.

### Stage 4 — Head and accessory round trip

Deliverables:

- Prepared rigid-part representation.
- Runtime part loader.
- Head and arbitrary bone-accessory slots.
- Shadow, depth, material, visibility, and disposal integration.

Acceptance:

- An edited head from Blender appears in the correct location and orientation.
- Walking, IK, surfing, swimming, and flight remain unchanged.
- Teleport and reset do not detach or duplicate parts.
- No additional per-frame allocation is introduced.

### Stage 5 — Skinned body-part round trip

Deliverables:

- Joint and weight remapping.
- Prepared skinned mesh import.
- Body, boots, gloves, and fitted-outfit slots.

Acceptance:

- Imported parts follow all procedural poses.
- Feet and hands remain aligned through extreme poses.
- Invalid or missing required weights fail during preparation.
- Imported geometry renders consistently in beauty, depth, and shadows.

### Stage 6 — Texture-based materials

Deliverables:

- Optional texture fields in the manifest.
- Runtime base-colour, normal, and roughness/ORM bindings.
- Fallback to existing palette materials.

Acceptance:

- Textured and palette-only parts can coexist.
- Colour spaces are correct.
- Alpha-tested content agrees across beauty, depth, and shadow passes.

### Stage 7 — Cloth cages

Deliverables:

- Versioned cloth-cage export.
- Exact-topology validator.
- Constraint and attachment reconstruction.

Acceptance:

- An edited cage retains attachments and stable simulation.
- Existing collision, wind, flight lift, and ground contact continue to work.
- Invalid topology is rejected before runtime.

### Stage 8 — Face morphs

Deliverables:

- Named morph-target preparation.
- Runtime morph buffers and expression controller.
- Blink and basic expression support.

Acceptance:

- Morphs work while all procedural body animation runs.
- Missing optional morphs degrade cleanly.
- Morph processing remains bounded and allocation-free during frames.

## Tests

Add focused automated tests for:

- Stable bone-name-to-index mapping.
- Bind and inverse-bind matrix identity.
- Joint remapping.
- Weight normalization and influence limiting.
- Missing and duplicated bone rejection.
- Axis, scale, and bounds validation.
- Material and part mapping.
- Deterministic manifest generation.
- Cloth topology validation when Stage 7 begins.

Do not test Babylon or glTF parsing behavior already owned by dependencies. Test
the Exalted contracts and conversions around it.

Manual checks should cover:

- Bind pose in Blender.
- A small set of extreme arm and leg poses.
- Head, hand, and foot alignment.
- Silhouette and clipping with the current cloth.
- Beauty, depth, and shadow agreement.
- Walking, surfing, swimming, flight, and spell-casting poses.
- Fixed-view performance before and after runtime asset loading.

## Risks and controls

| Risk | Control |
| --- | --- |
| Blender and runtime axes disagree | Manifest contract plus bounds/orientation validation |
| Rig drifts between exporter and runtime | One shared `avatarRig.ts` definition |
| Edited weights break IK silhouettes | Required-chain checks and extreme-pose manual validation |
| Arbitrary GLBs reach runtime | Mandatory preparation step and versioned manifest |
| Cloth is mistaken for normal skinned mesh | Reference-only flag until cage exchange is implemented |
| Material appearance changes | Restore runtime palette first; add textures as a separate stage |
| Export becomes nondeterministic | Stable ordering and structural export comparison |
| New parts miss shadows or depth | Central runtime part registration and integration tests |
| Major proportion edits break collisions | Keep rig dimensions fixed initially; version later changes |

## First milestone checklist

- [x] Extract and document the shared 18-bone rig.
- [x] Create standard Babylon skeleton and inverse-bind data offline.
- [x] Convert the procedural body into a standard skinned export mesh.
- [x] Export GLB, manifest, and Blender instructions.
- [x] Inspect the exported GLB after writing it.
- [ ] Edit or replace only the head in Blender.
- [ ] Validate and prepare the edited file.
- [ ] Load the prepared head as a rigid `head` attachment.
- [ ] Register it for beauty, depth, shadows, visibility, and disposal.
- [ ] Verify every movement mode manually.

Completing this milestone proves the exchange format and toolchain with minimal
risk. Full body, textures, cloth, fur sources, and expressions can then build on
the same versioned contract.
