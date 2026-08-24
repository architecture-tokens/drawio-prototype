# Showcase examples

Each example in this directory demonstrates the same three-layer pipeline end to end:

1. **Architecture Tokens semantic model** — the source of truth. A YAML/JSON document
   (`model.yaml`) describing components, relationships, and the tokens attached to them
   (environment, security, lifecycle, etc.), validated against the
   `@architecture-tokens/spec` schemas.
2. **Layout contract v0.1** — a renderer-independent placement (`layout.json`): node
   positions/sizes, parent nesting, and edge waypoints. Normally an AI planner (OpenAI,
   via `src/planner.ts`) produces this from the semantic model; for these showcase
   examples it is hand-authored instead (see "Regenerating an example" below), so the
   examples build and stay identical without any network access or API key.
3. **Diagram-rules-styled SVG** — the final rendered artifact. The `.drawio` file
   produced by `src/drawio.ts` is opened in diagrams.net/draw.io and exported to SVG/PNG
   using the project's Diagram rules (shape choice per component type, styling per
   token) for a shareable, human-reviewable picture.

```
Architecture Tokens model  --(planner)-->  layout.json  --(renderer)-->  out.drawio  --(draw.io export)-->  final.svg / final.png
      model.yaml                      layout contract v0.1        drawio XML              styled diagram
```

## Per-example directory shape

Each example lives in its own subdirectory and carries the full trail from source
material to final render:

| File                            | Contents                                                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `source.drawio` or `source.mmd` | The original hand-drawn or Mermaid diagram this example is modeled after (whichever format the original was authored in).          |
| `source.png`                    | A rendered snapshot of `source.*`, for side-by-side comparison against `final.png`.                                                |
| `model.yaml`                    | The Architecture Tokens semantic model for this example.                                                                           |
| `layout.json`                   | The layout-contract-v0.1 placement used to render this example (see "Regenerating an example").                                    |
| `out.drawio`                    | The generated draw.io XML — the direct output of `archtokens generate` / `tools/offline-generate.mjs`.                             |
| `final.svg`                     | `out.drawio` exported to SVG with the project's Diagram rules applied.                                                             |
| `final.png`                     | `out.drawio` exported to PNG, for quick preview.                                                                                   |
| `RULES-CHECK.md`                | A manual checklist confirming the Diagram rules (shapes, styling, token-driven decoration) were applied correctly to this example. |
| `README.md`                     | A short write-up of what this example demonstrates and any notable modeling decisions.                                             |

## Regenerating an example

Examples are regenerated offline, from the checked-in `layout.json`, without ever
calling OpenAI:

```bash
node tools/offline-generate.mjs <example>/model.yaml <example>/layout.json --out <example>/out.drawio
```

Add `--library <file>` / `--policy <file>` flags for examples that need extra token
libraries or policy sets beyond the built-in ones. `tools/offline-generate.mjs` never
reads `OPENAI_API_KEY` and never makes a network call — see the comment at the top of
that script for why.

## Conversion methodology (the actual product of these examples)

The examples exist to harden the method, not to perfect any one picture. Each conversion
feeds defects back into the layer that caused them. The rules below were extracted from
real failures in this directory — including two adversarial review rounds — and every
future example must follow and extend them.

**Scope (v1): orthogonal box-flow diagrams** — flowcharts, tiered architectures,
swimlanes, C4 containers: rectangular nodes, directed edges, single-parent visual
nesting. This matches the Diagram rules' own applicability tiers. ER attribute ports,
statechart AND-regions, force-directed meshes, and Sankey continuous encodings are named
non-goals until the contracts gain ports, lattice containment, and continuous tokens.

### Fidelity contract

Every source element (vertex or edge) gets exactly ONE **primary bucket** plus any number
of **trace links** to derived records. The primary bucket answers "where did its meaning
go"; trace links record fan-out (a padlock consolidated into a token that decorates two
edges is: primary `token`, traces to two view attachments — one source element, one
bucket, three links).

| Primary bucket               | Meaning                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------- |
| **component / relationship** | First-class in `model.yaml`                                                      |
| **token**                    | Meaning kept as an applied token; geometry given up                              |
| **visual**                   | Inexpressible in the model schema; declared in `view.yaml`, drawn in `final.svg` |
| **drop**                     | Dropped, with a required one-line reason                                         |

The census is a FILE, not prose: `census.yaml` carries one record per source element
(`source_id`, `kind`, `primary_bucket`, `target_ids`, `reason`). `tools/rules-lint.mjs
--census` enforces it (`CENSUS_MISMATCH`): record count must equal the source's element
count, targets must resolve, drops must carry reasons. A silent drop is a lint failure,
not a review comment.

### Layer boundaries: model vs view

`model.yaml` stays semantics-only. Everything about how THIS diagram shows the model
lives in `view.yaml` (the view layer contract prototype):

- `flow.direction` — the direction arrows point on canvas (`up/down/left/right/mixed`).
  Determined from the SOURCE mechanically: the dominant axis-aligned projection of edge
  displacement vectors; below a 60% majority the value is `mixed` (no global direction
  assumption, human decision recorded). Never anchored to a model component.
- per-element visual attachments — a LIST per component/relationship: `{icon, anchor}`.
  Anchors: nine-grid enum for rectangular nodes (typical `top-center`, `middle-left`,
  `middle-right`), `edge-midpoint`+offset for edge badges. Multiple attachments per
  element are expected (technology logo + alert badge).
- visual-layer elements (AZ bands, namespace corridors) — declared here with member ids,
  so hand-drawn geometry is bound to the model instead of floating in the SVG.

Presentation token TYPES stay in a token library (typed, shared vocabulary — spec issue
drafted); their APPLICATION lives in the view, so one model can carry several views
without mutation, and non-visual consumers (linters, IaC generators) never parse
rendering hints.

### Source-fidelity defaults

1. **Direction**: preserve the source's computed direction; `mixed` sources get no
   global orientation. Layout must satisfy the declared direction
   (`DIRECTION_GEOMETRY_CONFLICT` when edge displacements disagree with it).
2. **Icons**: when the source carries icon identity, keep it (`icon` attachment resolved
   from the SVG `<defs>` symbol set — `UNKNOWN_ICON_SYMBOL` when unresolved). Dropping an
   icon is an explicit-drop decision, never a default.
3. **Binding**: every model component appears in `final.svg` exactly once, tagged
   `data-component="<id>"`; view elements tagged `data-view-element`
   (`UNTRACEABLE_VISUAL` / `MISSING_COMPONENT` otherwise). Hand-authored SVG is a
   validated artifact, not free drawing.
4. **Improvements are layout-layer only**: grid, gaps, quantized sizes, merged trunks —
   never changes to what the diagram says (direction, membership, icons, labels).

### Cross-layer diagnostics (blocking)

`CENSUS_MISMATCH`, `UNKNOWN_ICON_SYMBOL`, `UNTRACEABLE_VISUAL` / `MISSING_COMPONENT`,
`DIRECTION_GEOMETRY_CONFLICT` — implemented in `tools/rules-lint.mjs` (cross-layer flags
`--model/--view/--census/--layout`). A defect class with no owning layer is itself a
methodology bug: add the diagnostic, then fix the instance.

### Feedback routing

A defect found in a finished diagram routes to the layer that owns it: missing concept ->
spec issue (containment, presentation vocabulary); undeclared contract semantics ->
layout contract issue (parent-relative coordinates); style violation -> `diagram-rules.md`

- `tools/rules-lint.mjs` when statically checkable; cross-layer mismatch -> a new blocking
  diagnostic. The diagram itself is only patched as a side effect of fixing the layer.
