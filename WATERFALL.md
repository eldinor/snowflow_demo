# Exalted waterfall

## Status

Waterfall work is paused until an authored model is available. The standalone
[`waterfall.html`](waterfall.html) lab remains the visual and performance test
bed. The main app currently has a temporary GPU particle waterfall near the
lake, selected from the imported terrain data.

The final waterfall should not be inferred entirely from `alpha-map.glb`.
Procedural detection can suggest a location, but it cannot provide the shape
control required for the intended AAA presentation.

## What we learned

### Terrain vertex colours

`alpha-map.glb` contains two blue water colours, approximately:

- `(0.159, 0.319, 0.521)`
- `(0.220, 0.418, 0.617)`

They mark broad water regions. There is no dedicated waterfall colour or
separate authored waterfall marker. The current code derives possible falls by
combining the blue mask with steep terrain triangles.

This is not reliable enough for final placement. The coarse triangles have
alternating normal directions, and they do not describe a clear lip, silhouette,
curved sheet, thickness, or impact point.

### Rendering experiments

The waterfall lab tested three GPU layers:

1. Babylon `FluidRenderer` surface reconstruction.
2. A falling GPU particle veil using narrow, vertically stretched particles.
3. GPU impact mist at the basin.

The particle veil and mist produced the clearest waterfall shape. Correct alpha
metadata and standard alpha blending were required to avoid square sprites.

Babylon `FluidRenderer` works in the isolated lab, but it should not currently
be used in the main app. It inserts its compositor at the first camera
postprocess slot, which conflicts with Exalted's ordered SSR, TAA, bloom,
depth-of-field, tone mapping, and sharpening pipeline. It also caused particles
to enter custom R32F shadow targets until particle rendering was explicitly
disabled for those targets.

The main app therefore retains only the GPU veil and impact mist. These effects
are suspended outside a 220-metre viewing radius.

### Existing river geometry

The terrain-derived river mesh followed large source triangles and produced
wide, stepped sheets around steep areas. Its separate downhill-flow material
also looked substantially darker than the lake.

The current implementation:

- uses the lake shader mode for the river;
- removes steep river faces and a surrounding margin from the rendered river;
- keeps those steep blue faces only as temporary placement information;
- selects the qualifying fall nearest the authored river mouth and lake;
- exposes a **Waterfall** destination in the top spawn bar for testing.

This remains provisional and should be replaced by authored geometry.

## Artist delivery

Provide a small GLB package containing:

- a named waterfall surface mesh with the final width, curvature and drop;
- a clearly modeled upper lip connected to the river;
- a clearly identified lower impact position at the lake or plunge pool;
- flow-aligned UVs running from the lip down to the impact area;
- vertex colours or an image mask for edge foam, breakup and thickness;
- a separate river surface that terminates cleanly at the waterfall lip;
- optional surrounding rocks that hide joins and frame the falling sheet.

Textures may be embedded in the GLB. The falling-water material itself can be a
simple placeholder because Babylon will provide the animated runtime material.

Useful naming:

- `waterfall_surface`
- `waterfall_lip`
- `waterfall_impact`
- `river_surface`
- `waterfall_rocks`

`waterfall_lip` and `waterfall_impact` may be small hidden locator meshes or
named nodes if they are easier for the artist to maintain.

## Final Babylon implementation

When the authored model arrives:

1. Load the named surface and locator nodes instead of detecting a fall from
   terrain slope.
2. Apply animated downward flow, normal distortion, refraction, foam masks and
   edge breakup to the authored surface.
3. Emit GPU streaks and droplets from the lip and side edges.
4. Emit GPU mist and ballistic spray from the impact locator.
5. Add lake ripples and local foam around the impact area.
6. Fade expensive layers by distance while keeping the authored surface visible.
7. Keep particles out of Exalted's shadow cascades and camera depth prepass.
8. Integrate with the existing Exalted postprocessing without inserting
   Babylon `FluidRenderer` ahead of the custom chain.

The authored mesh supplies the waterfall's composition. Runtime effects supply
motion, breakup, spray, lighting response and distance scaling.

## Acceptance checks

- The river meets the lip without a visible gap or overlapping stepped sheet.
- Water movement reads downward from every normal viewing angle.
- The impact point stays fixed and aligns with the lake surface.
- Mist has soft edges and no visible square billboards.
- The waterfall respects terrain occlusion but does not enter shadow or depth
  render targets that cannot blend particles.
- Exalted's existing TAA, bloom, exposure and sharpening retain their current
  appearance.
- The effect remains stable when entering through the **Waterfall** spawn point.
