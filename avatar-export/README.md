# Exalted avatar authoring package

Import **exalted-avatar.glb** into Blender using metre units.

- Keep the armature and required bone names unchanged.
- Keep object and armature scale at 1,1,1 and apply editing transforms.
- Keep Y up and the avatar facing +Z.
- Limit skinning to four normalized influences per vertex.
- Export normals, UVs and skin weights.
- The single preview material approximates the runtime palette; Exalted restores its custom WGSL material after preparation.
- Cloth and fur objects are bind-pose fitting references. Do not return them as ordinary runtime meshes.

The body currently includes the generated head geometry. Editing that region is supported as an authoring reference; isolated head import begins in Stage 4.
