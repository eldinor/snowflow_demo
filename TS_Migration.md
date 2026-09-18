# Staged TypeScript migration plan

Status: proposed; implementation has not started.

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
- No TypeScript configuration is present.

## Working rules

- Keep JavaScript and TypeScript interoperable during migration.
- Convert small, cohesive groups of files. Avoid a repository-wide rename.
- Keep dependency upgrades, visual changes and architectural rewrites separate.
- Use strict checking for migrated TypeScript from the outset. Legacy JavaScript
  may remain unchecked initially; opt individual files into JSDoc checking when useful.
- Prefer concrete interfaces, discriminated unions and `unknown` with validation.
  Avoid broad `any` types or assertions that merely silence errors.
- Preserve typed arrays and allocation-conscious hot loops.
- Maintain the main and forest entry points throughout.
- Run type checks and relevant tests after changes. Do not build on every edit.
- Do not use Playwright unless explicitly requested. Runtime visual checks must
  be performed manually or through another separately agreed workflow.

## Stage 0 — Establish the baseline

Tasks:

- Record the current Node version, test commands and page entry points.
- Run the existing automated tests and record their results.
- Document representative main-world checks: movement, footprints, flight,
  swimming, avatar cloth, shadows, displays and UI.
- Record a forest performance sample at a fixed viewport, camera and settings,
  including a traversal sample to expose LOD-update costs.
- Identify existing issues so they are not mistaken for migration regressions.

Completion criteria:

- Test baseline and repeatable runtime check list exist.
- Performance comparisons have a recorded device, resolution and scene setup.

## Stage 1 — Add tooling without converting the application

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
- Both pages still load with no behavior changes.
- The mixed-language test path works without generated files beside source files.

## Stage 2 — Define shared contracts

Tasks:

- Define focused interfaces for terrain height sampling, surface normals and
  bounds, using the methods the existing implementations actually provide.
- Type collision shapes, collision queries, spawn points and biome identifiers.
- Define character movement state and the data consumed by animation and effects.
- Type settings keys and their values precisely. Replace broad records where a
  fixed schema is known; make change callbacks preserve each key's value type.
- Define forest options, asset manifests, placement records and performance reports.
- Keep interfaces near their owning systems rather than creating one large global
  types file. Use type-only imports to avoid adding runtime dependency cycles.
- Add runtime validation at external boundaries where needed. A TypeScript cast
  does not validate downloaded JSON, GLB metadata or placement buffers.

Completion criteria:

- Migrated consumers can depend on explicit contracts rather than untyped objects.
- Small compile-time checks reject invalid settings and incompatible interfaces.
- Existing runtime data layouts and coordinate conventions remain unchanged.

## Stage 3 — Migrate the isolated forest demo

Tasks, in order:

1. Convert pure helpers: chunks, foliage LOD, ground colours and shadow projection.
2. Convert batch geometry handling and its buffer ownership boundaries.
3. Convert `ForestSystem`, its options, statistics and lifecycle methods.
4. Convert the forest page's DOM controls and measurement/export code.
5. Update the HTML module entry and affected test imports.

Pay particular attention to Babylon mesh/material types, optional loaded state,
typed-array handling and the existing use of internal buffer reference fields.
Isolate unavoidable internal API access in a small adapter with an explanation
and a regression test; do not hide it behind broad casts.

Completion criteria:

- Forest TypeScript passes strict checks and its automated tests pass.
- Existing matrix-buffer isolation and shadow-stability tests still run.
- Manual checks cover LOD, vegetation colours, grounding, wind, shadows and UI.
- Equivalent performance samples show no unexplained regression. Record normal
  run-to-run variation rather than treating every timing difference as a failure.

## Stage 4 — Migrate core utilities, terrain and world services

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

## Stage 5 — Migrate character and avatar systems

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

## Stage 6 — Migrate spells, effects, rendering and UI

Tasks:

- Convert spell definitions, runtime states, effect contexts and lifecycle hooks.
- Convert particle/effect systems, lighting, shadows and post-processing.
- Type custom shader bindings and resource ownership where practical. String types
  alone cannot prove that a WGSL uniform or binding matches its JavaScript setup.
- Convert UI modules and finally the main boot/update loop and debug globals.
- Update main-page imports and entry references as files move to TypeScript.

Completion criteria:

- All application modules in scope pass strict checking.
- Both pages boot and affected runtime features pass the baseline checks.
- Async initialization, teardown and resource disposal retain their behavior.

## Stage 7 — Close the migration and enforce it

Tasks:

- Inventory remaining JavaScript. Keep configuration or maintenance scripts in
  JavaScript if conversion offers little value; document the boundary.
- Remove temporary declarations, duplicate types and obsolete compatibility code.
- Disable `allowJs` for the application once its remaining imports permit it.
- Evaluate stricter indexed-access and optional-property checks, introducing them
  in manageable steps rather than adding large numbers of non-null assertions.
- Include type checking and automated tests in CI if CI is present or introduced.
- Perform one explicit final production validation of both entry points when
  authorized; avoid production builds during routine migration edits.
- Update contributor instructions for development, type checks, tests and asset preparation.

Completion criteria:

- Application type coverage has no unexplained gaps or blanket error suppressions.
- Tests and agreed final validations pass.
- Main-world and forest performance/visual comparisons are documented.

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
should follow the tooling setup and forest pilot rather than precede them.

Start with Stages 0–3. Use their results to estimate the remaining work, then
migrate systems as they are modified. Write new substantial systems in TypeScript
once the mixed-language toolchain is established. World development need not stop
while the migration proceeds.
