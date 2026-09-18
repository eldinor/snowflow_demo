# Forest performance demo

Open `/forest.html` using the normal Vite dev server. The main page does not import
this demo. It uses Babylon 9.18.0 and WebGPU, with a first-person inspection camera.

The supplied `forest_previz.glb` contains 20,984 plants: 3,457 trees, 2,549 bushes
and 14,978 grass placements, sharing four models. `npm run prepare:forest` extracts
a four-node prototype GLB and compact placement buffer. Regenerate these when
the source changes. Geometry, embedded textures and authored transforms are
preserved; unused ground bytes remain in the prototype buffer to avoid remapping
accessors. The demo renders the current `alpha-map.glb` ground instead.

Vegetation is grouped into 411 occupied **32 m** cells. Each geometry/material/LOD
combination has a thin-instance batch in its cell. Babylon frustum-culls these
batches. Each batch owns its geometry attribute bindings and index buffer;
static vertex allocations are reference-counted and shared with the prototype.
Instance matrix bindings must never share a Babylon Geometry between chunks.
Instance membership updates after camera movement, at most ten times
per second; wind runs on the GPU without per-plant JavaScript animation.

Default distance settings, in metres:

| Class | Full geometry | Medium geometry | Distant cards | Hidden |
| --- | --- | --- | --- | --- |
| Trees | <28 | 28–100 | 100–280 | >280 |
| Bushes | <28 | 28–65 | — | >65 |
| Grass | <28 | 28–35 | — | >35 |

Medium foliage retains approximately 45% of complete disconnected leaf cards;
wood uses error-limited mesh simplification. Distant trees use four-triangle
crossed cards with a 512 px texture baked from each tree prototype at startup.
They are inexpensive approximations from one viewing direction, not full
multi-angle impostors. LOD switches currently pop instead of cross-fading.

The HTML controls expose density, plant classes, LOD, visibility distances,
render scale, shadows, wind and trunk collisions. Full-detail distance takes
precedence if set above the card distance. Grounding is enabled initially: it
adjusts plant Y to the current terrain while preserving authored X/Z, rotation
and scale. Disable it to compare original heights. Ground mismatch counters
always describe the original placements; grounding uses approximate local bases.

Nearby trees and bushes cast alpha-cutout shadows into a 1024 px map; grass and
distant tree cards do not cast. Shadow geometry uses the same wind deformation.
The fixed-sun projection follows a world-aligned texel grid, with corrected
WebGPU texture orientation, four-tap bilinear comparison filtering and a soft
coverage-edge fade. Shadow silhouettes still follow the selected geometry LOD.
Collisions use static trunk cylinders derived from the lower opaque wood, with
the existing swept body collision system. Bushes and grass are passable. Collision
layout is retained even when render density or visibility changes.

For a comparison, reset the view, wait for shader compilation/frame times to
settle, then record ten seconds. Repeat with the same viewport and one changed
setting. Settings are locked during recording; camera movement is allowed for
traversal measurements. JSON captures settings, source hash, start/end camera,
viewport, median/p95/p99 frame times, draw calls and visible triangles.
Frame times include presentation pacing; these are not GPU timestamp measurements.
Vegetation instance counters count primitive instances (a tree's wood and foliage
are separate); draw calls include terrain and shadow passes. Render scale is
relative to CSS pixels. The recorded load time covers forest preparation only.

## Porting into the main world

`ForestSystem.js` owns rendering, LOD, wind and trunk collision data. It has no DOM
or input handlers. Keep the main page's existing camera, terrain and movement:

```js
const forest = new ForestSystem(scene, {
    heightAt: (x, z) => terrain.heightAt(x, z),
    options: { grounded: true },
});
await forest.load();
// Before scene.render():
forest.update(camera, dt);
// UI changes:
forest.configure({ treeDistance: 240, shadowDistance: 45 });
// forest.collisions provides the existing PropCollisions API.
// Merge its colliders into the world's collision index when integrating.
// Teardown:
forest.dispose();
```

Use the real terrain height callback for that integration. Keep the main ground
material; `createGroundMaterial()` is only for the demo. The benchmark uses a
fixed sun, its own shadow target and display-encoded shading without the world's
HDR chain. Adapt its material lighting/output and shadow receiver bindings to
the main page before integration. The renderer supports Babylon's left-handed
scene convention; GLB X reflection and quaternion conversion happen once.

Run `npm test` for placement integrity, chunk boundaries, LOD/density behavior,
foliage card reduction and the existing collision/movement tests. Browser visuals
and actual device performance need checking in the demo; no Playwright or
production build was run for this change.
