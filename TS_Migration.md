# Staged TypeScript migration plan

Status: The main application migration is complete through Stage 7. The production
source tree is strictly typed; standalone forest and mountain demos remain JavaScript.

TypeScript 5.9, tsx, browser and Node configurations are installed. `npm run typecheck` checks the production application strictly while the explicitly excluded demo folders remain JavaScript. The main terrain coordinator and its core data layer are now TypeScript: procedural heightfield baking and CPU sampling, terrain triangle sampling, biome weights, planar UV recovery, the Exalted GLB terrain loader, local soft-terrain partitioning, persistent GPU deformation and grounding probes, persistent world-water rendering, water geometry and swimming-surface lookup, spawn-point data, and static prop collision. Shared character movement contracts, swimming, timed flight, walking, surfing, terrain grounding, gait events, snow/sand contact brushes, the avatar rendering owner, procedural skeleton/IK pose solver, garment panel model, Verlet cloth solver, procedural avatar geometry builder, and its flat-array rigid-transform math are also migrated. The character conversion preserves its authored lofts, skin weights, fur shells, fixed cloth storage, rest constraints, apparent wind, body capsules, terrain contact, zero-allocation bone transforms, and packed GPU vertex layouts. The shared input and pointer-lock layer, third-person camera rig, key-specific settings store, frame statistics and graph, loading-screen lifecycle, analytic sky, camera-depth prepass, stabilized cascaded shadows, asynchronous GPU readiness, and zero-copy matrix-array binding are typed as well. Stage 6 is complete, covering typed spell easing, parallel-transport frames, ground rays, aim-point fallback, fixed spell lights, shared swept-water strands, pooled crystals, the central spell coordinator, the distance-sampled Rift lifecycle, Crystallise's staged formation and terrain glaze, Aegis's held wall and owned crystal-handle lifecycle, Thaw's recovery pulse, runoff strand, and cleanup lifecycle, Avalanche's terrain-following sheet, distance-sampled track, and spray lifecycle, Sweep's translating crescent, plough deformation, and strand cleanup, Bloom's eruption column, one-shot crater, and delayed fallout lifecycle, Vortex's transported helices, surface stripping, grain emission, and multi-strand cleanup, and Ribbon's retained path, throw physics, impact, terrain scoring, and strand lifecycle. The src/spells migration and integration audit are complete; key routing, held/release transitions, cancellation, and shared resource ownership were checked. Ribbon now rejects a cast cleanly when the shared strand pool is exhausted. The shared SprayField VFX pool is now typed as well, including fixed particle storage, sand classification, simulation, packed texture upload, shader bindings, warm-up, and disposal; the spell folder no longer crosses a JavaScript type boundary. The surf wake is typed too, preserving its fixed spine ring, resolved two-sided crest, packed GPU texture, plume emission, shadow/depth materials, warm-up, and disposal lifecycle. Water effects are typed across bounded nearby-waterfall selection, pooled spray, ripple bursts, swimming strokes, and flight landing transitions. Flight feedback is typed across ribbon geometry, timer colours, takeoff spray, HUD ownership, and disposal. The src/vfx JavaScript-to-TypeScript conversion is complete. The post-processing chain is typed across all nine passes, temporal history, resize invalidation, projection jitter, shader bindings, focus and streak state, and disposal; its three required Babylon internals are isolated behind narrow structural assertions. The remaining terrain render support is typed too: static clipmap lattice generation and shared desert texture/material bindings, with the sRGB texture internal isolated behind one narrow interface. Authored desert props are typed across GLB/PBR source narrowing, geometry/material batching, thin-instance near/far LOD buffers, collision extraction, wind and shader passes, placement audit data, warm-up, and disposal. The UI layer is typed across settings widgets, performance and camera diagnostics, spawn navigation, wind and texture controls, and the lazily loaded Inspector lifecycle. The central WGSL registry is typed across immutable include and shader-source maps while preserving its idempotent registration contract. The typed main entry now owns boot sequencing, warm-up, resize scheduling, the frame loop, spawn transitions, diagnostics, and the browser inspection surface. JavaScript demo consumers import shared `.ts` modules directly through Vite. Displays and their video integration have been removed. Forest requirements are retained in [FOREST_SPEC.md](FOREST_SPEC.md).

The standalone `snow_mountain.html`, `forest_road.html`, and legacy `forest.html`
pages are demos and remain JavaScript. They are excluded from the migration and
may continue consuming migrated shared world modules through normal ES imports.
The first conversion target is a small, tested dependency slice of the main app.

## Objective and scope

Adopt TypeScript incrementally while keeping Exalted usable throughout the
migration. Preserve behavior, visual appearance and performance. This is a
language and interface migration, not a rewrite of the renderer or gameplay.

Repository snapshot from inspection:

- Approximately 15,100 JavaScript lines across 68 files in `src`.
- Approximately 8,100 WGSL lines across 71 shader files. WGSL stays WGSL.
- Vite serves the main page and the separate `forest.html` performance demo.
- Babylon packages are pinned to 9.18.0.
- Tests currently use Node's test runner and import JavaScript modules directly.
- Browser and Node TypeScript configurations now support incremental migration.

## Working rules

- Keep JavaScript and TypeScript interoperable during migration.
- Convert small, cohesive groups of files. Avoid a repository-wide rename.
- Keep dependency upgrades, visual changes and architectural rewrites separate.
- Use strict checking for migrated TypeScript from the outset. Legacy JavaScript
  may remain unchecked initially; opt individual files into JSDoc checking when useful.
- Prefer concrete interfaces, discriminated unions and `unknown` with validation.
  Avoid broad `any` types or assertions that merely silence errors.
- Preserve typed arrays and allocation-conscious hot loops.
- Keep demo pages working, but do not convert their page-specific code to TypeScript.
- Run type checks and relevant tests after changes. Do not build on every edit.
- Do not use Playwright unless explicitly requested. Runtime visual checks must
  be performed manually or through another separately agreed workflow.

## Stage 0 вЂ” Establish the baseline

Tasks:

- Record the current Node version, test commands and page entry points.
- Run the existing automated tests and record their results.
- Document representative main-world checks: movement, footprints, flight,
  swimming, avatar cloth, shadows, displays and UI.
- Record a main-world performance sample at a fixed viewport, camera and settings.
- Identify existing issues so they are not mistaken for migration regressions.

Completion criteria:

- Test baseline and repeatable runtime check list exist.
- Performance comparisons have a recorded device, resolution and scene setup.

## Stage 1 вЂ” Add tooling without converting the application

Tasks:

- Add TypeScript and the development-only typings needed for the actual browser
  and Node environments, using versions compatible with the installed toolchain.
- Add a browser TypeScript configuration with `allowJs`, `checkJs: false`,
  `strict`, `noEmit`, DOM libraries and module resolution appropriate for Vite.
- Include Vite client declarations and verify typing for `import.meta.env`,
  `import.meta.hot`, JSON imports and shader imports using `?raw`.
- Keep Node scripts/tests in a separate configuration where needed; avoid leaking
  Node-only globals into browser modules.
- Add `npm run typecheck`. Vite transformation alone is not a type check.
- Settle test execution before renaming imported modules: choose a compatible
  TypeScript runner or a test-only compilation step. Do not assume every supported
  Node version executes TypeScript directly.
- Define one import-extension convention that works for both Vite and tests.
- Verify with a small mixed JavaScript/TypeScript import exercised by a test.

Completion criteria:

- Type checking and existing tests run successfully.
- The main page still loads with no behavior changes; demos remain usable as JavaScript consumers.
- Establish the mixed-language test path with the first migrated main-app slice,
  without generating files beside source files.

## Stage 2 вЂ” Define shared contracts

Tasks:

- Define focused interfaces for terrain height sampling, surface normals and
  bounds, using the methods the existing implementations actually provide.
- Type collision shapes, collision queries, spawn points and biome identifiers.
- Define character movement state and the data consumed by animation and effects.
- Type settings keys and their values precisely. Replace broad records where a
  fixed schema is known; make change callbacks preserve each key's value type.
- Keep interfaces near their owning systems rather than creating one large global
  types file. Use type-only imports to avoid adding runtime dependency cycles.
- Add runtime validation at external boundaries where needed. A TypeScript cast
  does not validate downloaded JSON, GLB metadata or placement buffers.

Completion criteria:

- Migrated consumers can depend on explicit contracts rather than untyped objects.
- Small compile-time checks reject invalid settings and incompatible interfaces.
- Existing runtime data layouts and coordinate conventions remain unchanged.

## Stage 3 вЂ” Migrate a tested main-application slice

Tasks, in order:

1. Select a small main-app dependency slice with existing unit coverage, starting
   with pure math, collision, movement, or terrain-query helpers.
2. Define contracts at that slice's boundaries and convert its leaf modules.
3. Update production consumers and tests without changing runtime behavior.
4. Use the result to estimate the remaining core, terrain and character work.

The mountain and forest-road viewers may import converted shared modules, but
their page-specific loading, UI and camera code stays JavaScript.

Completion criteria:

- The selected production slice passes strict checks and its tests pass.
- Main-world behavior covered by the slice matches the recorded baseline.
- JavaScript consumers, including demos where relevant, still import it correctly.

## Stage 4 вЂ” Migrate core utilities, terrain and world services

Tasks:

- Convert math helpers, settings, input and reusable GPU utilities in dependency order.
- Convert terrain sampling and collision utilities before their larger consumers.
- Convert terrain/deformation management, world props, water and spawn services.
- Document units and coordinate conventions at boundaries: metres, radians/degrees,
  GLB handedness conversion and packed array layouts.
- Preserve shader attributes, uniform names, texture formats and allocation behavior.

Completion criteria:

- Converted modules pass strict checks and relevant tests.
- Grounding, collision, deformation and biome behavior match the baseline.
- Remaining JavaScript consumers can still call the converted services.

## Stage 5 вЂ” Migrate character and avatar systems

Tasks:

- Convert the movement controller, flight and swimming state first.
- Convert the procedural figure, bone identifiers and pose interfaces.
- Convert geometry builders, garment specifications, cloth solver and character rendering.
- Type the packed bone/cloth texture layout without replacing efficient numeric arrays.
- Make material palette entries and garment constraints explicit.
- Use the contracts needed by the future avatar-part workflow described in
  `AVATAR.md`; do not implement export/import as part of the language migration.

Completion criteria:

- Character tests and strict checks pass.
- Manual checks cover foot planting, cloth, surfing, flight, swimming and shadows.
- The rig, bind pose, movement behavior and GPU data layout are preserved.

## Stage 6 вЂ” Migrate spells, effects, rendering and UI

Tasks:

- Convert spell definitions, runtime states, effect contexts and lifecycle hooks.
- Convert particle/effect systems, lighting, shadows and post-processing.
- Type custom shader bindings and resource ownership where practical. String types
  alone cannot prove that a WGSL uniform or binding matches its JavaScript setup.
- Convert UI modules and finally the main boot/update loop and debug globals.
- Update main-page imports and entry references as files move to TypeScript.

Completion criteria:

- All application modules in scope pass strict checking.
- The main page boots and affected runtime features pass the baseline checks.
- Async initialization, teardown and resource disposal retain their behavior.

## Stage 7 вЂ” Close the migration and enforce it

Tasks:

- Inventory remaining JavaScript. Keep configuration or maintenance scripts in
  JavaScript if conversion offers little value; document the boundary.
- Remove temporary declarations, duplicate types and obsolete compatibility code.
- Disable `allowJs` for the application once its remaining imports permit it.
- Evaluate stricter indexed-access and optional-property checks, introducing them
  in manageable steps rather than adding large numbers of non-null assertions.
- Include type checking and automated tests in CI if CI is present or introduced.
- Perform one explicit final production validation of the main entry point when
  authorized; avoid production builds during routine migration edits.
- Update contributor instructions for development, type checks, tests and asset preparation.

Completion criteria:

- Application type coverage has no unexplained gaps or blanket error suppressions.
- Tests and agreed final validations pass.
- Main-world performance and visual comparisons are documented.

## Validation limits and risk management

TypeScript helps detect incompatible interfaces, missing properties and incorrect
API arguments. It does not directly improve FPS or verify GPU rendering behavior.
The previous instance-buffer ownership bug, shadow projection errors and tree-card
orientation issue demonstrate why runtime and visual checks remain necessary.

For each stage:

- Keep changes reviewable and separate from feature work.
- Run type checking and tests appropriate to the changed modules.
- Record any intentional behavior correction separately from the migration.
- If integration fails, revert the affected migration increment while preserving
  unrelated work; do not reset the entire workspace.

## Effort and recommended pace

The full migration is a multi-day task and may take longer where strict types
expose inconsistent interfaces or reliance on engine internals. A precise schedule
should follow the tooling setup and first main-application slice rather than precede it.

Start with Stages 0вЂ“3. Use their results to estimate the remaining work, then
migrate systems as they are modified. Write new substantial systems in TypeScript
once the mixed-language toolchain is established. World development need not stop
while the migration proceeds.
