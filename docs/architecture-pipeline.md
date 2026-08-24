# Offline Architecture Tokens pipeline

The integration command turns each showcase into one reproducible evidence chain:

```sh
npm run pipeline -- \
  --example examples/showcase/1-cloud-web-app \
  --out-dir /tmp/cloud-pipeline
```

It performs, in order:

1. Import `source.xml`, `source.drawio`, or `source.mmd` into a deterministic source inventory and source-layout projection.
2. Validate the Architecture Tokens model, local token library, and Architecture View through the production CLI.
3. Read and topology-validate `layout-reproduce.json`, injected through the offline planner boundary.
4. Render an editable draw.io with token/view styles and trace bindings.
5. Run `rules-lint --full` with model, view, census, authored layout, and the checked-in reproduce SVG.

The pipeline does not call OpenAI or Codex. The separate subscription benchmark owns live planner evaluation.

## Outputs

| File                    | Meaning                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `source-inventory.json` | Stable source IDs, counts, labels, containment, endpoints, and classification TODO evidence |
| `source-layout.json`    | Source-native geometry projection; Mermaid coordinates remain `null` rather than invented   |
| `out.drawio`            | Newly rendered editable token/view-driven diagram                                           |
| `gate-report.json`      | Full `rules-lint` result used by the pipeline                                               |
| `pipeline-report.json`  | Compact source/generation/gate summary                                                      |

The source projection and renderer layout are intentionally distinct. Draw.io sources carry extractable geometry; Mermaid source text does not. Both source families are imported, while `layout-reproduce.json` is the validated renderer input for every offline showcase.

## Generated matrix

Run all five examples and write the checked-in matrix from actual reports:

```sh
npm run pipeline -- \
  --all \
  --out-dir /tmp/architecture-pipeline \
  --matrix-out docs/gate-matrix.md
```

The command exits nonzero if generation or any full gate fails. `docs/gate-matrix.md` is a generated snapshot, not manually maintained prose.
