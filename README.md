# EXALTED

World website: [exaltedgaming.gg](https://exaltedgaming.gg/).

The default scene now uses Exalted's **`alpha-map.glb`** from the
9 September 2026 world handoff, bundled at `public/assets/exalted/alpha-map.glb`.
Its imported geometry and biome vertex colours define the world; Exalted's
procedural avatar, lighting and snow material remain the visual reference.
Open `/?terrain=procedural` to compare against the original procedural demo
described below.

Use the top bar to switch between **Desert Start** (the default), **The Palecrown**
(snow), **The Long Green** (grassland), **The Thornwood** (forest), **The Ironspine**
(mountains), **Lakeside Overlook** (lake viewpoint), and **Stone Gate** (pass).
Press **Esc** to release the mouse and choose a place; click the scene to resume
looking and moving. Destinations use the Rev B register coordinates with elevation
sampled from the terrain. Switching resets movement, cloth, effects and the camera.
The compact top bar is flush with the top edge. Its left sidebar switches between
**Use desert textures** and **Use procedural textures**; one checkbox is selected
at a time. This changes appearance while retaining terrain deformation.

The Exalted map stays at scale 1 (one unit per metre), with bounds
1,872 × 1,404 m. Spawn is chart `(65, -616)`, or Babylon `(-65, height, 616)`,
facing north. The loader's complete coordinate transform is baked once into the
mesh, including normals and triangle winding. The procedural sky mountains are
disabled for this scene so they do not change Exalted's skyline.

Grounding samples the imported triangles through a spatial index, as requested
because the separate collision mesh and analytic height function are unavailable.
This follows the visible mesh, not the finer original world surface. The known
road wall near Stone Gate remains part of the supplied terrain. This is terrain
grounding, not a general obstacle or slope-limit physics system.

Snow and loose desert sand now deform around the avatar. Nearby soft source
triangles are replaced with subdivisions at approximately 17 cm spacing;
the rest of `alpha-map.glb` retains its original geometry. Beauty, shadow and
depth passes use the same displacement. The detail fades between 12 and 16 m
from the avatar, joining the original triangle planes without a second ground
layer. Tracks remain temporary in the existing moving GPU simulation window.

Painted terrain colours identify snow and sand; roads, trails, grass, forest
and rock stay firm. Sand uses 55% of snow's brush depth, smaller raised rims,
three-times-faster refill, and warm dust/wake shading. Desert Start is on
loose sand, 12 m south of the authored road fork, so walking immediately leaves footprints.
Choose The Palecrown to compare snow tracks. Footsteps, sliding and deformation
brushes from spells share this surface system; reflective spell ice still needs
its Exalted reflection-mask integration.

Desert sand now uses the embedded `DesertGround` material from
`exalted_desert.glb`: the 2K red laterite soil/stones colour and normal textures,
authored normal strength and roughness 0.95. Its planar UV projection is fitted
and checked against all regional ground vertices, then reused in world space
with the GLB texture transforms on both terrain detail levels. Texture sampling
uses mip gradients, and compression/rims still modify the textured surface.
This changes the sand to the supplied reddish soil appearance. The regional
ground mesh remains excluded; snow and firm road materials are unchanged.
Deformation shading follows the selected material: textured soil retains its
colour and stones in impressions, uses modest relative darkening/brightening,
and stays rough when compressed. Procedural sand has a separate pale-sand
response. Snow's blue trench tint is restricted to snow. Dust and sliding wakes
sample the desert ground texture in textured mode and use warm sand colours in
procedural mode. Switching modes preserves impression depths and displaced mass.

Feet and camera add a small GPU displacement readback to the original triangle
height. A 128-square probe covers 16 m and updates at most ten times per second;
grounding therefore follows recent deformation with asynchronous latency.
This is suitable for these shallow tracks, not a synchronous collision solver.
The desert's plants and rocks now load from `exalted_desert.glb`, preserving
authored placement. Its separate ground is excluded. Twenty-three shared
geometry/material groups use GPU thin instances, each with original and simplified
distant geometry. Small stones fade at 28–35 m, shrubs at 48–60 m, and larger
props at longer size-based ranges up to 180 m. Instance selections update after
3 m of movement; original detail is retained within 16 m (30 m for larger props).
The materials use authored base-colour, normal and roughness textures with
Exalted lighting, spell lights and aerial perspective. Vegetation uses alpha
cutouts consistently in beauty, shadows and depth, including source materials
exported as alpha blending. Boulders, larger rocks, tree trunks and large cacti
now block the avatar and camera. Bushes, leaves and small stones remain passable.
The grounded avatar sweeps a 32 cm body radius with a 1.8 m vertical overlap span
against simple static cylinders, sliding along their sides. Trunk widths come
from lower mesh vertices rather than the canopy. A 16 m spatial grid queries the
whole movement path, including fast sliding; collision is independent of render
distance and LOD. The camera retracts immediately with 25 cm clearance and eases
back out. These are approximate obstacles, not mesh-exact physics: climbing onto
rocks, step-up, movable props and branch-level collision are not implemented.

At Desert Start, the final selection contains 365 primitive instances and
365,594 prop triangles. See `reports/desert-placement.json` for placement checks
and `reports/terrain-with-desert-props.json` for all seven spawn measurements.
Run `node scripts/inspect-desert.mjs` against the dev server to repeat the audit
and save a spawn screenshot. Original source transforms remain unchanged:
the audit flags 15 nearby rocks with deeply buried bases for review.

Validation: `npm test` checks surface queries; `npm run test:browser` checks the
WebGPU scene, movement, imported bounds, and grounding against independent Babylon
ray intersections, soft-surface depth/rims, and spawn switching. Install Chromium with `npx playwright install chromium`, or set
`PLAYWRIGHT_CHANNEL=chrome` to use an installed Chrome browser.

With the dev server running, `node scripts/benchmark.mjs report-name` records
all seven destinations in `reports/report-name.json`. These are headless Chrome
presentation timings at 1280 × 800, not GPU timestamps or a hardware-independent
frame-rate guarantee. Before/after deformation captures are included in `reports/`.

---

The following documentation describes the original procedural demo.

A real-time snow rendering tech demo. WebGPU, Babylon.js, hand-written WGSL.
Everything you see is generated on the GPU at load time — there are no textures,
no meshes, no HDRIs and no animation data in this repository.

**▶ [exaltedgaming.gg](https://exaltedgaming.gg/)**

> Requires a WebGPU-capable desktop browser (Chrome/Edge 113+, Firefox 141+,
> Safari 26+) and a discrete or recent integrated GPU. There is no WebGL
> fallback by design — if `navigator.gpu` is missing the page says so and stops.

---

## Controls

| | |
|---|---|
| Click | capture the pointer |
| `Ctrl+I` | toggle Babylon Inspector on the right (loaded on first use; version 9.18.0, matching Babylon) |
| `W` `A` `S` `D` | move, relative to the camera |
| Mouse | look · **Wheel** zoom |
| `Shift` | sprint |
| **Right mouse (hold)** | snow-surf — carve across the field and throw a wake |
| `1` – `9` | the nine spells (`2` and `7` are held casts) |
| `F1` or `` ` `` | settings and performance overlay |

The overlay exposes every art parameter as a live slider — sun angle, wind
bearing, subsurface radius, deformation depth, tonemap curve, exposure — plus a
frame-time graph with median / 95th / 1% low, draw calls, triangles and a
per-system CPU breakdown. Every system can be toggled off individually, and
there are debug views for normals, depth, cascade coverage, the deformation
buffer and the raw shadow map.

---

## What it does

### Terrain

A nested-ring geometry clipmap: 8 rings, 8.5 cm inner spacing, ~870 m radius,
333k triangles — **one static mesh, one draw call**. Vertices carry only
`(gridIndex, ringLevel)`; world placement, CDLOD morphing and displacement all
happen in the vertex shader, so there is no CPU rebuild and no per-frame upload.

The heightfield underneath it is layered gradient noise with analytic
derivatives, anisotropic about a single prevailing wind: broad transverse dune
ridges, a long low swell, medium drifts sheared along the wind for lee-face
asymmetry, and sparse rock outcrops. It bakes once into a 4096² RG32F texture
and is mirrored back to the CPU, so character grounding samples exactly the
surface that is drawn rather than a re-implementation of it.

### Snow shading

Multi-scale normals — baked macro slope, analytic sastrugi and ripples, three
tiled detail scales, triplanar on steep faces — over wrapped diffuse, a
back-scatter subsurface term with depth-dependent blue tint, GGX specular, SH
ambient with a solved snow bounce, and procedural view-dependent glints gated on
grazing angle. Compression, wetness and ice are surface state channels the
material reads rather than separate materials.

Shadows are three hand-rolled cascades with world-space PCSS — blocker search,
penumbra estimate, rotated Poisson filter — texel-snapped in world space and
stabilised against a rotation-invariant bounding sphere. Babylon's own cascade
generator can't be used here: the terrain has no CPU geometry matching what is
drawn, so every caster registers the vertex program it is actually rendered
with.

### Deformation

A persistent, additive terrain state buffer: two 2048² RGBA16F targets covering
80 m (3.9 cm texels), ping-ponged by a single full-screen pass per frame that
scrolls, relaxes and splats in one dispatch. Addressing is toroidal — a texel's
UV is `fract(worldXZ / size)` — so the window follows the player without ever
copying the buffer, and newly exposed texels are detected and zeroed by the same
pass.

Channels are depression depth, displaced mass, compression and ice. That second
channel is what separates a trail with raised berms from a flat footprint decal.
Refill is anisotropic diffusion (loose berms slump three times faster than a
packed trench floor) plus berm-into-depression slump, wind-driven infill from
upwind, and slow exponential decay: **~71% of trail depth survives a minute**,
visibly spreading and softening as it goes.

The displacement is real geometry in the beauty pass *and* in all three shadow
cascades through one shared include, so trails self-shadow and berms break the
silhouette. Feet, the surf wake and all nine spells write through one `brush()`
call into the same buffer.

### The character

Fully procedural — no rig file, no animation clips, no authored mesh. An 18-bone
skeleton whose bind pose is a table of numbers, geometry lofted from that table
at load (cowl, torso, arms, trousers, boots, belt), and locomotion solved from
the motion state rather than played back.

Feet plant. A distance-driven stance/swing machine writes a foot's world
position exactly once, on touchdown, and holds it absolutely fixed while
two-bone IK reaches for it — a planted foot cannot slide because nothing in the
code is able to move it. Gait phase advances with ground travelled, so stride
length and ground speed are the same number by construction.

The garments are Verlet cloth on four panels with distance, bending and
shape-memory constraints, nine body collision capsules, and a hem that rides the
snow surface. Folds live in the rest shape rather than in a normal map. The
36×12 solve renders as a 72×32 surface through Catmull-Rom reconstruction in the
vertex shader, so tessellation and simulation cost are fully decoupled. Shell
fur at the hood rim and cuffs is a partial torus emitted 22 times and
alpha-tested against a hashed strand field.

One small texture carries everything to the GPU: rows 0–3 are bone matrices,
rows 4+ are simulated cloth nodes. One upload per frame, no allocation.

### Snow-surf

The wake is a **swept mesh, not a particle effect**. Its spine is the path the
board has taken, resampled every 30 cm into a 96×3 data texture; the mesh itself
is a static lattice of `(column, row, side)` and every vertex is placed in the
vertex shader, so a 19-metre wake and a 2-metre one cost the same buffer and the
same 4.6 KB upload.

The cross-section is a breaking wave integrated from a turning tangent — the
tangent sweeps from just below horizontal at the base to 284° at the tip, so one
`curl` parameter runs continuously from a low heaped bank to a lip that hangs
back across its own face. Amplitude and curl resolve per side from the carve, so
the outside of a turn takes nearly all the snow. Peak wall is 2.4 m at a
full-speed carve and collapses 0.88 s after it is laid, which makes wake length
`life × speed` with no second constant. Normals are differenced out of the same
`wakePoint` the geometry uses, so they cannot disagree with it.

Two spray populations come off the same spine — a dense slow curtain hugging the
crest and ballistic grains flung clear — emitted at *fractional* positions along
it, plus screen-space speed streaks and camera shake on a loaded edge.

### The nine spells

One water material, one mesh, one draw, eight strands. Six of the nine move a
coherent body of water and are structurally the same object: a swept surface
along a spine with a radius, a parallel-transported frame and a foam channel —
the same construction as the surf wake. A strand that is not in use is switched
off by zeroing its rows, so the draw count does not depend on how many spells
are up.

1. **Sweep** — a crescent of slush rises out of the ground and runs outward,
   ploughing a channel and throwing berms.
2. **Ribbon** — a held stream tracking the hand and camera aim, drawing
   precessing figure-eights and scoring thin curved lines into any snow it
   skims. Released, the head steers onto the aim and accelerates, so the water
   arcs onto the target with the bend it had at release still travelling out
   along the tail.
3. **Bloom** — a targeted eruption: a crater with a raised rim, a waisted column
   that rises and withdraws down its own axis, and four seconds of fallout
   curtain lit from below.
4. **Crystallise** — hexagonal prisms grown along a golden-angle spiral,
   alpha-blended *and* depth-writing, so you see the snow through the ice but
   never one prism through another. Facet normals come from screen-space
   derivatives, so every facet is exactly flat and every edge exactly hard.
5. **Vortex** — three helices of lifted snow winding around the player, with the
   airborne mass emitted along those same helices at their own tangential
   velocity. The only system here that writes a *negative* depression.
6. **Rift** — a branching fissure races away along the aim direction, cutting a
   narrow glazed trench into the real terrain, piling broken lips on either side
   and throwing snow from a cold light travelling inside the crack.
7. **Aegis** — a held cast growing a bowed wall of interlocking ice teeth from
   its centre outward. Release leaves the built section standing; press `7`
   again to shatter it into ice and snow spray.
8. **Avalanche** — a broad slab fractures ahead of the caster and accelerates
   across the sampled terrain, dragging a breaking snow face, dense powder and
   ballistic clods over a wide compressed track with displaced edge berms.
9. **Thaw** — a targeted warm pulse expands through persistent terrain state,
   filling trenches, collapsing berms, loosening packed snow and melting glaze.
   Nearby crystal formations sublimate while a short, snow-covered slush seam
   finds a downhill path through the mist.

Refraction needs no scene copy and no second opaque pass: the sky LUT already
stores the solved snow bounce below the horizon, so one lookup along the
refracted ray is a physically-derived estimate of what is behind the water in
any direction. Three lookups at three indices of refraction give the chromatic
dispersion, and absorption over the path length gives the tint.

Four pooled dynamic lights are declared per frame, and every one of them runs
the identical `snowSubsurface` the sun runs — so a spell lights the snow
*through* a berm crest rather than putting a bright patch on the near face of
it. The snow, the robe, the wake, the airborne spray, the water and the ice all
read the same pool out of one include.

### Sky and atmosphere

A Nishita single-scattering integration with a multiple-scattering
approximation and an iteratively-solved snow bounce, baked into an
equirectangular LUT plus SH irradiance and mip-based specular. Analytic rather
than a captured HDRI because the whole look hangs on a sun 10–15° up: with a
model, the elevation slider correctly drags the horizon warmth, the zenith
gradient, the ambient tint and the direct sun colour along with it.

The far range is a heightfield raymarched on the skybox — no geometry, behind
everything by construction, with analytic normals, ridges occluding ridges, and
a second short march toward the sun for its own cast shadows. It is lit by the
snow field's own material logic and hazed by the same single atmosphere, so the
two meet at one colour instead of two.

### Post-processing

A camera-space depth prepass (linear view depth carried as a varying, plus a
specular mask) feeds the whole chain:

- **TAA** — Halton(2,3) jitter written straight into the projection and frozen
  for the frame, so the prepass and the beauty pass agree to the subpixel.
  Depth-based reprojection, variance clipping, and a five-tap Catmull-Rom
  history fetch.
- **Bloom** — three levels, thresholded in *exposed* units so only the sun disc,
  the glints and lit spray reach it. Karis-averaged on the prefilter.
- **Volumetric light shafts** — integrating sky visibility out of the prepass
  along the ray to the sun. They fade themselves out entirely at a high sun.
- **Depth of field** — deliberately slight, focal plane tracking the spring
  arm's own length, weighted by each tap's own circle of confusion.
- **Screen-space reflections** — on ice only, gated on the prepass mask, so the
  pass is a fetch and a branch on any frame where nobody has cast Crystallise.
- **AgX / ACES tonemapping**, contrast-adaptive sharpen, grain, vignette.

---

## Performance

Measured with WebGPU timestamp queries at 2560×1440 on Chrome / Windows 11 /
RTX 5070 Ti, with every system running:

| | |
|---|---|
| GPU frame | **3.22 ms** |
| — base scene (clipmap, snow, 3 cascades, sky, character, deformation, prepass) | 1.64 ms |
| — post chain | ~1.1 ms |
| — far range | ~1.2 ms |
| — character (skeleton, cloth, fur, spray) | < 0.02 ms |
| Draw calls | 15–19 |
| Triangles | ~353,000 |
| Headroom against a 90 FPS budget | **7.9 ms** |

Nothing allocates in the render loop. Every buffer is sized at construction,
every per-frame write goes into a pre-allocated typed array, and every material,
procedural texture and render pipeline is explicitly `isReady()`-gated and
exercised with real geometry behind the loading screen — so the first cast of a
spell does not compile a pipeline mid-frame.

VRAM is roughly 350 MB: a 4096² height texture, two 2048² deformation targets,
three 2048² shadow cascades, and the sky and detail LUTs.

---

## Running locally

```bash
npm install
npm run dev      # vite dev server on :5173
npm run build    # production build into dist/
npm run preview  # serve the production build
```

## Layout

```
src/
  main.js            entry point and frame orchestration
  core/              settings, input, camera rig, perf, loading, GPU helpers
  terrain/           heightfield, clipmap mesh, deformation state buffer
  render/            sky + IBL, shadow cascades, depth prepass
  character/         skeleton, procedural geometry, cloth solver, snow contact
  vfx/               pooled particles, the snow-surf wake
  spells/            the nine spells, the shared water body, the light pool
  post/              the post-processing chain
  ui/                settings and performance overlay
  shaders/           all WGSL — lib/ holds the shared includes
```

## Assets and licences

There are no third-party assets. Every texture, environment map and piece of
geometry in the running demo is generated at load time on the GPU: the sky is an
atmosphere integral, the snow grain and terrain are noise, the character is
lofted from a table of numbers, and the fabric weave and fur strands are
evaluated in the fragment shader.

Runtime dependencies are `@babylonjs/core` and `@babylonjs/materials`
(Apache-2.0). The only build dependency is Vite (MIT), which does not ship in
the output.

This project is released under the [MIT licence](LICENSE).
