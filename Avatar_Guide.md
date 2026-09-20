# Exalted avatar exchange guide

This guide explains how to export the Exalted avatar, edit it in Blender, validate
the edited GLB, and return it to the application.

The export and inspection commands are implemented. Automated preparation and
runtime replacement are the next implementation stage. Until that stage is
complete, an edited GLB can be validated but cannot yet replace the in-game
avatar.

For implementation details and milestones, see
[Avatar_Exchange.md](Avatar_Exchange.md). For a description of the existing
procedural avatar, see [AVATAR.md](AVATAR.md).
The proposed browser fitting tool is specified in
[Initial_Editor.md](Initial_Editor.md).

## Requirements

- Install the project dependencies with `npm install`.
- Use a Blender version with glTF 2.0 import and export support.
- Run commands from the project root.
- Keep an untouched copy of the generated authoring package.

The avatar exchange contract uses:

- Metres for units.
- Positive Y as up.
- Positive Z as avatar forward.
- A standard 18-joint skin.
- No more than four influences per vertex.

## 1. Export the authoring package

Run:

```bash
npm run avatar:export
```

The command creates:

```text
avatar-export/
  exalted-avatar.glb
  avatar-manifest.json
  README.md
```

The exporter builds a standard glTF skeleton from the same bind-pose definition
used by the runtime pose solver. It converts Exalted's custom skin attributes to
standard `JOINTS_0` and `WEIGHTS_0`, writes the GLB, and verifies its structure.

The generated GLB contains:

| Object | Purpose |
| --- | --- |
| `part:body` | Editable skinned body, including the current generated head |
| `reference:cloth` | Baked robe, mantle, and sleeve surfaces for fitting |
| `reference:fur` | Generated hood and cuff fur for visual reference |
| `joint:*` | The standard authoring armature |

The cloth and fur objects are reference objects. Editing them does not currently
replace the runtime cloth simulation or generated fur.

Current reference export measurements:

- Body: 1,613 vertices.
- Cloth reference: 788 vertices.
- Fur reference: 5,310 vertices.
- Body height: approximately 1.804 m.

## 2. Import into Blender

Start a new Blender file and remove the default cube if desired.

Choose:

```text
File → Import → glTF 2.0 (.glb/.gltf)
```

Select:

```text
avatar-export/exalted-avatar.glb
```

After import, verify:

- The avatar stands upright.
- The feet are near ground level.
- The avatar faces positive Z.
- The armature has 18 bones.
- The body has an Armature modifier.
- Object and armature scales are `1, 1, 1`.
- The body is approximately 1.8 m tall.

Do not apply corrective 90-degree rotations or axis mirrors just because Blender
displays its own conventional front view differently. The exchange contract uses
positive Z as avatar forward.

## 3. Preserve the skeleton contract

Required bones:

```text
root
spine
chest
neck
head
hood
upper_arm.L
forearm.L
hand.L
upper_arm.R
forearm.R
hand.R
thigh.L
shin.L
foot.L
thigh.R
shin.R
foot.R
```

Do not:

- Rename a required bone.
- Delete a required bone.
- Insert an additional bone into a required chain.
- Change the rest pose.
- Change the armature scale.
- Add another root bone.
- reorder the required vertex groups through a different exported skin.

The application uses numeric bone indices internally. The preparation step maps
the stable names back to those indices and rejects a changed order.

## 4. Edit the avatar

### Replace or reshape the head

The current generated head is part of `part:body`. For an initial replacement:

1. Keep the original body as a fitting reference.
2. Model or import a neutral replacement head.
3. Position it around the `head` joint.
4. Keep its object transform applied.
5. Name the replacement object `part:head`.
6. Keep the head separate from reference cloth and fur.

The first runtime importer will treat `part:head` as a rigid attachment to the
`head` bone. It does not need a complete facial rig.

If the head includes a neck transition that must deform, skin that section to
`head`, `neck`, and optionally `chest`, while keeping four or fewer influences
per vertex.

### Add a rigid accessory

Examples include a mask, helmet, glasses, pendant, or weapon.

1. Create the accessory as a separate object.
2. Apply its transforms.
3. Give it a stable name beginning with `part:accessory.`.
4. Record its target bone in the exchange manifest.

Example:

```json
{
  "part:accessory.mask": {
    "node": "part:accessory.mask",
    "mode": "rigid",
    "bone": "head"
  }
}
```

### Edit fitted body parts

Boots, gloves, fitted clothing, and armour can use the existing armature.

- Transfer weights from the nearby original body as a starting point.
- Inspect elbow, knee, shoulder, wrist, and ankle deformation.
- Normalize all vertex weights.
- Limit influences to four.
- Avoid major limb-length or shoulder-width changes in the first exchange format.

The procedural IK and cloth collision geometry assume the current proportions.

### Use cloth and fur references

`reference:cloth` shows the bind-pose shape of the runtime cloth. Use it to:

- Check space around the torso and arms.
- Prevent armour from intersecting the robe.
- Fit belts, clasps, shoulder pieces, and other rigid parts.

`reference:fur` shows the generated hood and cuff volume. Use it to check the
silhouette and clearance.

Do not include edited versions of these references as ordinary replacement meshes.
The preparation tool will remove reference-only objects. Editable cloth cages and
fur source surfaces are later exchange stages.

## 5. Materials and textures

The authoring GLB contains preview materials:

```text
exalted_robe
exalted_cloth_reference
exalted_fur_reference
```

They approximate the application colours and exist to make editing readable.
They are not exact copies of the custom runtime WGSL materials.

The current preparation contract maps known materials back to runtime palette
slots. Full imported base-colour, normal, and roughness textures require the
texture-material stage of the exchange plan.

You may create textures while authoring, but retain the source files separately
until texture import is implemented.

## 6. Apply and inspect Blender transforms

Before export:

1. Select edited mesh objects.
2. Use `Ctrl+A → Rotation & Scale`.
3. Confirm scale is `1, 1, 1`.
4. Confirm there is no negative scale.
5. Confirm the armature rest pose is unchanged.
6. Normalize weights.
7. Check for unweighted vertices.
8. Check that modifiers needed for final geometry are applied or exported.

Do not apply the armature modifier. Skinning must remain present in the exported
GLB.

## 7. Export from Blender

Choose:

```text
File → Export → glTF 2.0
```

Use:

| Setting | Value |
| --- | --- |
| Format | glTF Binary (`.glb`) |
| Include | Selected Objects, if you selected the full exchange set |
| Transform | +Y Up |
| Geometry | Apply Modifiers as appropriate |
| Geometry | UVs enabled |
| Geometry | Normals enabled |
| Geometry | Tangents when normal maps are used |
| Armature | Skinning enabled |
| Animation | Disabled for the current workflow |
| Materials | Export |

Export to a new file rather than overwriting the generated reference:

```text
avatar-work/edited-avatar.glb
```

Keep the armature, `part:body`, and any new `part:*` objects in the exported
selection. Reference cloth and fur may remain for validation and will later be
removed during preparation.

## 8. Validate the edited GLB

Run:

```bash
npm run avatar:inspect -- avatar-work/edited-avatar.glb
```

The inspector is read-only. It does not modify the GLB.

It writes:

```text
reports/avatar-validation.json
```

The report includes:

- GLB size and generator.
- Node, mesh, material, and skin counts.
- Required, missing, additional, and duplicated bones.
- Joint order.
- Mesh attributes.
- Bounds, vertex counts, and triangle counts.
- Body height.
- Weight normalization.
- Maximum active influences.
- Unknown joint references.
- Unapplied object transforms.
- Required part and reference objects.

A valid file prints:

```text
PASS edited-avatar.glb: ... meshes, 18 joints, ... weighted vertices
```

A contract error prints `FAIL`, lists the problems, and returns a nonzero exit
code.

### Common validation errors

#### Missing bone

```text
ERROR rig.missing: Missing bones: head.
```

Restore the original bone name and hierarchy.

#### Unknown bone

```text
ERROR rig.additional: Unknown bones: ...
```

Remove the unintended deforming bone or wait for a versioned rig extension.

#### Invalid joint order

Export the original armature and ensure the required skin was not rebuilt with a
different bone order.

#### Unapplied transform

Apply rotation and scale to the reported mesh object in Blender, then export
again.

#### Invalid weights

Normalize the vertex groups and remove negative, non-finite, or zero-total weight
sets.

#### Too many influences

Use Blender's limit-total operation with a maximum of four influences, then
normalize weights.

## 9. Prepare for runtime

This command is defined by the exchange plan but is not implemented yet:

```bash
npm run avatar:prepare -- avatar-work/edited-avatar.glb
```

When implemented, it will:

1. Run the same validation.
2. Bake permitted transforms.
3. Normalize and limit skin weights.
4. Remap glTF joints to Exalted numeric bone indices.
5. Map known materials to runtime material slots.
6. Remove `reference:cloth` and `reference:fur`.
7. Preserve exchangeable `part:*` objects.
8. Write an optimized runtime GLB and manifest.
9. Reload and verify the generated runtime asset.

Planned output:

```text
public/assets/avatar/custom/
  avatar.runtime.glb
  avatar.manifest.json
```

Do not manually copy an unprepared Blender GLB into the runtime asset folder.

## 10. Import into Exalted

Runtime import is also part of the next implementation stage.

The initial importer will:

- Load a prepared `part:head`.
- Attach it rigidly to the procedural `head` bone.
- Apply Exalted character materials.
- Register it with the depth prepass.
- Register it with character shadows.
- Include it in visibility and disposal.
- Keep all procedural movement and pose systems unchanged.

Later stages will add:

- Skinned body-part replacement.
- Fitted outfit slots.
- Imported texture maps.
- Editable cloth cages.
- Fur source surfaces.
- Facial morph targets.

## 11. Test the imported avatar

After runtime import becomes available, manually inspect:

- Idle and walking.
- Running and planted feet.
- Surfing and extreme body lean.
- Swimming strokes.
- Flight rise, hover, movement, and landing.
- Every spell-casting arm pose.
- Head rotation and hood lag.
- Camera-near views.
- Sunlit and shadowed views.
- Depth of field and other post effects.
- Character visibility toggle.
- Teleport and spawn switching.

Look for:

- Detached or drifting parts.
- Incorrect scale or orientation.
- Elbow, knee, neck, wrist, and ankle collapse.
- Body and cloth intersections.
- Missing shadows.
- Incorrect depth occlusion.
- Parts that remain after avatar disposal or reload.

## Current workflow summary

```text
npm run avatar:export
        ↓
Import avatar-export/exalted-avatar.glb into Blender
        ↓
Edit while preserving the rig and exchange contract
        ↓
Export avatar-work/edited-avatar.glb
        ↓
npm run avatar:inspect -- avatar-work/edited-avatar.glb
        ↓
Review reports/avatar-validation.json
```

The following continuation becomes available after Stage 4 implementation:

```text
npm run avatar:prepare -- avatar-work/edited-avatar.glb
        ↓
Load prepared parts in Exalted
        ↓
Validate all movement, render, shadow, and lifecycle paths
```
