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
real failures in this directory; every future example must follow them and extend them.

### Fidelity contract

Every element of the source diagram must land in exactly one of four buckets, and the
example's README must carry the census:

| Bucket                       | Meaning                                                                              | Example                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| **component / relationship** | First-class in `model.yaml`                                                          | a service box, an edge                                       |
| **token**                    | Meaning kept, geometry given up — recorded as an applied token                       | SSL padlock -> `security:encryption.in-transit` on its edges |
| **visual-layer element**     | Not expressible in the model schema, drawn at the SVG layer and traceable to a token | AZ bands, namespace containers                               |
| **explicit drop**            | Dropped with a one-line reason                                                       | a letter annotation duplicating a label                      |

A silent drop is a methodology bug: `source census = model + tokens + visual + drops`
must reconcile, count for count. (Origin: example 1 dropped the AZ containers and all
icons without the loss being visible in any artifact.)

### Source-fidelity defaults

1. **Direction**: detect the source's flow direction; when it has logic, preserve it.
   Record it as `presentation.flow.direction` so downstream layers consume a token, never
   a guess. (Origin: example 1's bottom-up source silently became top-down.)
2. **Icons**: when the source carries icon identity, keep it — `presentation.icon` names
   the glyph, the render layer resolves it from a `<defs>` symbol set. Dropping icons is
   an explicit-drop decision, never a default.
3. **Icon placement**: from the nine-grid enum (`top-left` .. `bottom-right`; typical:
   `top-center`, `middle-left`, `middle-right`), matched to the source's placement —
   positions are chosen from the enum, never freehand.
4. **Improvements are layout-layer only**: grid, gaps, quantized sizes, merged trunks —
   the Diagram-rules cleanups — must not change what the diagram says (direction,
   membership, icons, labels).

### Feedback routing

A defect found in a finished diagram routes to the layer that owns it: missing concept ->
spec issue (containment, presentation tokens); undeclared contract semantics -> layout
contract issue (parent-relative coordinates); style violation -> `diagram-rules.md` +
`tools/rules-lint.mjs` when statically checkable. The diagram itself is only patched as a
side effect of fixing the layer.
