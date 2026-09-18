# Code documentation audit

Reviewed: 2026-09-18.

## Findings

Documentation was uneven. The original character, renderer and spell modules
already explained many algorithms and design decisions, but a number of those
introductions were not marked as TypeDoc module documentation. Several newer
forest, water, flight, collision and UI interfaces had little API-level explanation.

## Changes

- Added or marked module introductions in all 68 application JavaScript modules
  and the three maintenance scripts.
- Added declaration-level explanations for previously undocumented exported
  classes and significant public operations, retaining existing detailed comments.
- Documented coordinate conventions, seconds versus milliseconds, mutable output
  storage, lifecycle ownership, asynchronous results and initialization order at
  important interfaces.
- Explained forest instance-buffer isolation, deterministic density/LOD selection,
  shader colour handling, grounding adjustments and benchmark counter semantics.
- Documented movement hand-offs between flight, swimming and walking, collision
  approximations and the distinction between absolute terrain height and cached
  deformation offsets.
- Explained water geometry metadata, coverage, bounded ripple/emitter pools,
  display placement and world-space text rendering.
- Expanded spell update descriptions beyond parameter-only comments.
- Added purpose/invariant headers to 15 WGSL entry points/includes that lacked
  them. Existing shader algorithm explanations were retained.
- Corrected stale references to the avatar bone count and engine draw-counter
  behavior, and separated multiple inline parameter tags for clearer parsing.

## Scope and interpretation

The audit focuses on module responsibilities, public APIs, substantial algorithms,
GPU/CPU data boundaries and lifecycle behavior. Small assignments, loop counters,
obvious constructors and trivial accessors do not need repetitive comments. Private
algorithms may be explained by adjacent inline comments and their module design
notes rather than a separate generated API entry for every helper.

JavaScript uses JSDoc-style `/** ... */` comments and TypeDoc-compatible tags such
as `@module`, `@param`, `@returns`, `@remarks` and `@throws`. This is not a claim
of complete static typing or parameter type coverage; that belongs to the staged
TypeScript work in `TS_Migration.md`.

WGSL is outside TypeDoc's JavaScript/TypeScript processing. Its comments explain
shader behavior directly beside the code. Tests primarily document their purpose
through descriptive test names and assertions. HTML/CSS and external dependencies
are not treated as TypeDoc APIs.

No TypeDoc package, documentation build configuration or generated HTML site was
introduced or validated in this task. These can be added separately; do not infer
that a strict TypeDoc generation run has passed from this source-comment audit.

## Validation

- Compared parsed JavaScript syntax trees before and after editing for all 71
  application/script modules, ignoring source locations and comments: unchanged.
- Checked that all 15 edited WGSL files differ only by added comment prefixes
  after normalizing line endings.
- Existing automated suite: 33 tests passed.
- No production build, Playwright run or new behavior tests were needed for the
  documentation changes.

## Convention for future changes

For significant APIs, document the operation and the reason for its constraints.
Add units, coordinate space, mutation, resource ownership, return semantics and
failure behavior where those details are not obvious. Keep explanations next to
the owning declaration, and update comments when an implementation changes.

Use module comments for architecture, declaration comments for caller contracts,
and local comments for numerical/GPU invariants. Do not use comments as a substitute
for runtime validation of imported assets or tests of rendering and simulation.
