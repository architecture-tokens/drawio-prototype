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
