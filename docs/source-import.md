# Source import and census scaffolding

The source-import boundary converts an existing diagram into deterministic evidence before any semantic model or visual restyling is attempted. It deliberately separates machine-decidable facts from human classification.

## Commands

```sh
archtokens import-source source.drawio \
  --out source-inventory.json \
  --layout-out source-layout.json

archtokens scaffold-census source.mmd \
  --out census.yaml \
  --model model.yaml \
  --classifications source-classifications.yaml
```

`import-source` accepts uncompressed and compressed `.drawio`, bare `mxGraphModel` XML, Mermaid `graph`/`flowchart`, and Mermaid C4 sources. The inventory contains:

- the source basename, format, and SHA-256;
- exact vertex, edge, and total counts;
- stable source-order IDs and labels;
- explicit flow direction where Mermaid declares it, or a geometry-derived majority direction for mxGraph;
- mxGraph vertex geometry, parent IDs, edge endpoints, source/target points, and every control point;
- one stable `SOURCE_CLASSIFICATION_TODO` diagnostic per unclassified source element.

The optional `source-layout.json` is a lossless geometry projection keyed only by source IDs. Mermaid coordinates are `null` and control-point arrays are empty because those facts do not exist in Mermaid text; the importer does not invent them.

## Classification contract

Classification is a separate, reviewable input:

```yaml
kind: source-classifications
version: '0.1'
mappings:
  A:
    primary_bucket: component
    target_ids: [producer]
  'edge:A->B':
    primary_bucket: relationship
    target_ids: [producer-message]
  annotation-1:
    primary_bucket: drop
    target_ids: []
    reason: Duplicate annotation already represented by the component label.
```

The five resolved buckets are `component`, `relationship`, `token`, `visual`, and `drop`. A drop must have an empty target list and a reason. Unknown source IDs and malformed mappings fail rather than being ignored.

Without a mapping, the generated census still contains every source element, but uses `primary_bucket: TODO`, an empty target list, and an explicit reason. This is intentional: `rules-lint` reports `CENSUS_MISMATCH` until all TODOs have been classified. With complete mappings, the generated census uses the existing `kind: census` wire format and passes the same source-bijection and target-resolution gate as hand-authored examples.

## Verified evidence

The importer is checked against all source dialects currently in the repository:

| Source                          | Format            | Vertices | Edges | Total | Direction                |
| ------------------------------- | ----------------- | -------: | ----: | ----: | ------------------------ |
| `1-cloud-web-app/source.xml`    | mxGraph           |       28 |    23 |    51 | mixed (geometry-derived) |
| `2-cicd-flow/source.mmd`        | Mermaid flowchart |       12 |    10 |    22 | right (`LR`)             |
| `3-microservices-c4/source.mmd` | Mermaid C4        |        9 |    10 |    19 | mixed/not declared       |
| `5-event-pipeline/source.mmd`   | Mermaid flowchart |        6 |     5 |    11 | right (`LR`)             |

The cloud fixture is a regression boundary: source edge `38` has the exact control point `{x: 230, y: 760}`. Both the inventory and source-layout projection preserve `y=760`; tests explicitly reject the historical mistranscription to `y=560` that created a false crossing in the reproduced diagram.

The integration test supplies complete classifications for the 11-element event pipeline, writes a generated census, and runs the production `rules-lint` cross-layer check. `CENSUS_MISMATCH` must be `PASS`.

## Deliberate limits

The Mermaid parser supports the two dialect families represented by the showcase: flowcharts (`graph`/`flowchart`, subgraphs, `-->`, `-.->`, `==>`) and C4 element/boundary/`Rel` macros. Known metadata and style directives are ignored because they are not source elements. Any other non-empty drawing syntax is preserved as a stable `SOURCE_SYNTAX_TODO` diagnostic instead of being silently discarded.
