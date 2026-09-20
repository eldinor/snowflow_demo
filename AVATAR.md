# Avatar customization and asset workflow

The staged implementation plan is maintained in
[Avatar_Exchange.md](Avatar_Exchange.md).
The artist workflow is documented in [Avatar_Guide.md](Avatar_Guide.md).

## Current implementation

The avatar is generated in code rather than loaded from a rigged model. It uses
a custom 18-bone rig, procedural posing and foot-placement IK. Walking, surfing,
flight and swimming poses are driven by the movement controller.

- `src/character/figure.js`: bind pose, bone transforms and procedural animation.
- `src/character/build.js`: generated body, head, hood, boots, gloves, fur and cloth render meshes.
- `src/character/cloth.js`: garment shapes, control grids and Verlet cloth simulation.
- `src/character/character.js`: rendering, material palettes and GPU transform texture.
- `src/shaders/char.vertex.wgsl` and related shaders: custom skinning and rendering passes.

The head is currently featureless beneath its hood and scarf. There are no eyes,
mouth, facial bones or expression morph targets.

Body geometry stores custom `boneIdx` and `boneWt` attributes. A small GPU texture
carries bone matrices and simulated cloth nodes. The cloth render mesh stores
`(u, v, panelIndex)` in its position attribute; the shader reconstructs the actual
surface from the simulation grid. Fur is also shader-based.

## Customization difficulty

| Change | Difficulty | Work involved |
| --- | --- | --- |
| Clothing colours, skin tone, fabric finish | Easy | Change material palettes and parameters |
| Robe length, sleeve shape, hood proportions | Moderate | Adjust generated geometry and cloth settings |
| Hats, masks, glasses, rigid armour | Low–moderate | Attach meshes to appropriate bones |
| Detailed replacement head | Moderate | Import geometry, attach to the head bone, adjust hood/scarf |
| Entirely different outfits | Moderate–high | Fit and skin garments; prevent body clipping |
| Blinking, expressions, talking | Higher | Add facial morph targets and animation controls |

An arbitrary rigged GLB outfit will not automatically work with the custom rig.
The cloth solver also expects specific garment grids, rather than arbitrary
imported clothing. Limb lengths and cloth collisions assume the current body
proportions, so major proportion changes require additional work.

## Proposed export → edit → import workflow

This is a proposed workflow, not an implemented exporter or importer. A normal
scene export alone will not preserve the custom skinning, simulated garments
and procedural materials correctly.

### 1. Export an editable GLB

- Export in the original bind pose, at metre scale.
- Convert the 18-bone rig, bind transforms and skin weights to standard GLB skinning.
- Separate named parts: head, hood, torso, gloves, boots and garments.
- Convert material IDs into editable material assignments.
- Include ordinary preview materials approximating the current colours and finish.
- Preserve part identifiers and the rig mapping needed for import.

### 2. Edit in Blender

- Change geometry, UVs and materials as needed.
- Preserve bone names, bind pose and scale for a straightforward round trip.
- Weight a replacement rigid head to the head bone.
- Fit new clothing to the exported body and transfer or paint skin weights.
- Preserve cloth control-cage topology when editing garments intended to reuse
  the existing simulation.

### 3. Import through an avatar-part loader

- Validate part identifiers, rig mapping, scale and skin weights.
- Map imported bones and weights back to the procedural rig.
- Replace the selected part and restore its runtime material configuration.
- Register the replacement with the existing rendering, shadow and depth passes.
- Keep the movement controller and procedural posing system in place.

## Handling different parts

| Part | Round-trip approach |
| --- | --- |
| Head, hood, boots, gloves | Standard geometry and skin weights |
| Fitted clothing or armour | Standard skinning; cloth simulation is optional |
| Existing flowing robe and sleeves | Export editable control cages; preserve topology and panel mapping to reconstruct the simulation |
| Entirely new flowing garments | Define simulation constraints, attachment points and body collisions |
| Fur | Edit its underlying shape and regenerate runtime fur |

The visible cloth surface must be reconstructed into real positions for a useful
preview export. A static snapshot can serve as an editing reference, but it does
not by itself retain the information needed to restore cloth simulation.

Procedural fabric and fur shaders will not automatically become equivalent
Blender materials. Preview materials can approximate them; runtime shaders can
be restored on import. Texture-painted faces or garments need corresponding
texture support in the runtime material path.

## Recommended implementation order

1. Establish an export/import round trip for the head and rigid clothing parts.
2. Document the rig, bind pose, scale and part naming convention.
3. Add appearance presets and interchangeable head, hood, accessory and outfit slots.
4. Support fitted garments using the same rig.
5. Add editable cloth control cages and simulation reconstruction.
6. Consider facial animation and major body-proportion changes separately.

Start with a detailed interchangeable head and variations of the current outfit.
The intent is to retain the existing locomotion, surfing, flight and swimming
behavior while making appearance editable outside the application.
