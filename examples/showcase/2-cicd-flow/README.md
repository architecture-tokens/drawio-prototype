# 2-cicd-flow

## Source

- **URL:** https://gitlab.com/gitlab-org/gitlab/-/raw/master/doc/ci/pipelines/pipeline_architectures.md
- **Title:** GitLab CI/CD docs — "Basic pipelines" diagram
- **Fetched:** 2026-08-24T06:33:00Z
- **Format:** Mermaid `graph LR` (verbatim, see `source.mmd`)
- **License: CC-BY-SA-4.0.** This example is derived from GitLab's own
  documentation, which is published under Creative Commons
  Attribution-ShareAlike 4.0 International
  (https://creativecommons.org/licenses/by-sa/4.0/). Per the license:
  - **Attribution:** the diagram's structure (which jobs exist, which
    stage each belongs to, which triggers which) is copied from GitLab's
    "Basic pipelines" figure in the CI/CD pipeline architectures docs,
    linked above.
  - **Share-alike:** this derivative (`model.yaml`, `layout.json`,
    `final.svg`, and the rendered `.png`/`.drawio` outputs in this
    directory) is itself redistributable only under CC-BY-SA-4.0 or a
    compatible license — it is NOT relicensed under this repository's
    Apache-2.0 terms. Anyone reusing the _content_ of this specific
    example (not the surrounding tool) must carry the same
    attribution + share-alike terms forward.
  - The mermaid source used the substitute GitLab source instead of
    mermaid.js.org's own docs because the mermaid project's docs/examples
    contain no CI/CD-pipeline-specific flowchart (only generic
    shape-reference demos) — see `meta.json`'s `substitution_note` for
    the full account of that search.

## What the source diagram shows

Three pipeline stages running left to right — build, test, deploy. Each
stage has one entry job that fans out to two parallel jobs; each stage's
two parallel jobs both feed into (trigger) the next stage's entry job.
9 nodes, 10 edges, exactly as estimated in `meta.json`.

## What the semantic model captures

`model.yaml` uses **12 components** and **19 relationships** — more than
the source's raw 9 nodes / 10 edges, because the model also captures the
grouping the source shows _visually_ (the three `subgraph ... end` blocks)
as first-class semantic structure rather than dropping it:

- **9 job components** (`build`, `build_a`, `build_b`, `test`, `test_a`,
  `test_b`, `deploy`, `deploy_a`, `deploy_b`) — one per source node,
  typed `cicd:pipeline.job`.
- **3 stage components** (`build_stage`, `test_stage`, `deploy_stage`) —
  typed `cicd:pipeline.stage`, one per source `subgraph`.
- **10 `cicd:pipeline.triggers` relationships** — one per source edge.
  The 4 that cross a stage boundary (dotted in the source) carry the
  applied token `cicd:pipeline.stage-transition`; the other 6 (solid
  in-stage fan-out) don't.
- **9 `core:relationship.belongs.to` relationships** — one per job,
  pointing at its stage. This is how containment is expressed: the
  `architecture-model` schema (`schema/architecture-model.schema.json`)
  has no first-class "parent" field on a component, but the shipped
  renderer (`src/drawio.ts`'s `edgeStyle`) already special-cases
  `core:relationship.belongs.to` for exactly this purpose (dashed
  open-arrow "ownership" styling), and the layout schema's `parentId`
  requires the parent to be a real component id — so stages had to
  become components either way for `layout.json` to nest jobs inside
  them. Given that, using the core namespace's existing "ownership
  association" type for job→stage membership was the natural fit,
  rather than inventing a redundant local token for the same concept.
  So this example does **not** flatten containment: the "groups/
  containers become parent components" branch of the task brief applies
  here, just expressed through a relationship (as the spec's own
  primitives require) rather than a dedicated schema field.
- **1 local token library** (`tokens.yaml`, namespace `cicd`) supplies
  the three concepts none of the built-in libraries have: a pipeline job,
  a pipeline stage, and a "triggers" relationship (plus the
  stage-transition applied-token modifier). `core:relationship.belongs.to`
  is the only built-in token actually used, for containment as above.

## What the layout improved over the source

The source SVG (see `source.png`) already uses a clean 3-column layout;
`layout.json` keeps that shape but makes every measurement systematic
instead of hand-placed:

- **Shared grid (B3):** all 3 stage containers sit on the same row
  (`y=40`, `height=212`); all "entry job" boxes share one row, all "first
  parallel job" boxes share another, all "second parallel job" boxes a
  third — so every lane is pixel-identical in shape, not just
  approximately similar.
- **Quantized, uniform box size (B1):** every one of the 9 job boxes is
  exactly 130x60 (padding 19 + 22px line-height + padding 19), derived
  from one formula rather than eyeballed per box.
- **One gap value per axis (B2):** a single vertical gap (24, between a
  lane's two stacked parallel jobs) and a single horizontal gap (40, used
  for both the entry-to-parallel-column gap inside a lane AND the
  lane-to-lane gap) — an intermediate version of this layout used 90 for
  the lane-to-lane gap and 40 inside the lane, which is a **B2
  violation** ("don't mix values"); it was caught during the rules
  check and unified to one value, which also compressed the canvas from
  1328x292 to 1228x292 (B8: compress empty space).
- **Distributed fan-out exits (rule 2):** each entry job's two outgoing
  arrows leave from two different points on its right edge (at 1/3 and
  2/3 of the edge height) rather than both leaving from the exact
  midpoint — the source does this visually too, but `layout.json` makes
  it an explicit, reproducible offset instead of an implicit rendering
  choice.
- **Merged stage-transition trunks (rule 11):** the two dotted arrows
  entering each stage's entry job converge into one shared trunk segment
  with one arrowhead, instead of two visually-parallel near-duplicate
  lines — `layout.json`'s waypoints route both source edges to the exact
  same merge coordinate so their final approach segments coincide.

No flattening or simplification was needed beyond the containment
representation described above — every node and edge from `source.mmd`
is present in `model.yaml`, `layout.json`, and `final.svg`.

## Conversion modes

Two views of the same `model.yaml` live in this directory, per
`examples/showcase/README.md`'s "Conversion modes" contract:

- **`final.svg` / `layout.json` (no view.yaml)** — a **restyle**. The
  source SVG already used a clean 3-column layout, but `layout.json`
  re-derives every measurement from a B1/B2/B3 grid formula rather than
  keeping the source's own numbers (see "What the layout improved over
  the source" above) and colors every job/connector by its own stage
  (rule C2), a restyle-only authoring choice.
- **`final-reproduce.svg` / `layout-reproduce.json` / `view-reproduce.yaml`
  / `census.yaml`** — a **reproduce**. `source.mmd`'s 3-lane grid already
  passes every applicable Diagram rule this genre exercises (B1/B2/B3/B9
  spacing, rule 11 converging trunks), so `layout-reproduce.json`'s node
  positions/sizes are EXTRACTED from the mermaid.ink-rendered SVG of
  `source.mmd` (see "Reproduce-mode provenance" below), not re-derived.
  The one thing NOT copied from the source's own render is connector
  treatment: mermaid draws every edge as a smooth diagonal bezier curve,
  but rule 3/3a (orthogonal routing, uniform rounded corners) is
  normative in BOTH modes (owner decision 2026-08-24), so every connector
  is an orthogonal polyline rounded via `tools/round-connectors.mjs` at
  radius 5. Two rule exemptions are disclosed (B1 per-label box sizing,
  C2 uniform `#333333` connector color, both matching source exactly) —
  see `RULES-CHECK.md`'s "Reproduce mode" section for the full per-rule
  pass. The icon-less view now receives explicit vacuous PASS results for
  icon and relationship-attachment checks under `--full`.

## Reproduce-mode census summary

`census.yaml` carries **22 records** biject onto `source.mmd`'s own 12
vertex + 10 edge inventory (`node tools/rules-lint.mjs --census-dump
source.mmd`): **12 `component`** (3 stage subgraphs + 9 jobs — every
subgraph promotes to a real `cicd:pipeline.stage` model component, unlike
1-cloud-web-app's AWS Availability-Zone bands, which had no backing
component) and **10 `relationship`** (every source edge). **0 `token`, 0
`visual`, 0 `drop`** — unlike the AWS example, nothing in this source
needed dropping or token-only preservation. The 9
`core:relationship.belongs.to` containment edges in `model.yaml` have no
source-edge counterpart at all (`source.mmd` draws containment purely as
subgraph nesting, no arrow) — closed instead by `view-reproduce.yaml`'s 3
`visualElements` entries (`build_stage_container` /
`test_stage_container` / `deploy_stage_container`), each dual-tagging its
stage's own rendered rect with `data-view-element` and a `members` list
naming the 3 nested jobs (same pattern as 1-cloud-web-app's
`web-asg-band`/`app-asg-band`).

## Reproduce-mode provenance

Node/container geometry in `layout-reproduce.json` was extracted from
`mermaid-render.svg` (kept in this directory as the provenance record),
fetched via `curl https://mermaid.ink/svg/<base64url-of-source.mmd>` and
parsed for each `<g class="node">`'s `transform="translate(cx,cy)"` +
child `<rect x= y= width= height=>` (absolute = `cx+x, cy+y`) and each
`<g class="cluster">`'s `<rect>` (already absolute). Job-node coordinates
in `layout-reproduce.json` are PARENT-RELATIVE (subtracted from their
stage's own extracted origin), matching the layout contract's drawio-style
`parentId` convention (`tools/rules-lint.mjs`'s `resolveLayoutCenters`).
All values rounded to integers per the task brief. Connector waypoints
are NOT extracted from the source's bezier control points (mermaid's
`data-points` attributes) — those are diagonal and rule 3/3a explicitly
excludes bezier routing from what reproduce mode copies — instead
authored as orthogonal bend points between the extracted box edges,
matching the same rule-2 (distributed fan-out exits) / rule-11 (merged
convergent trunks) idioms `layout.json`'s restyle already uses, just at
the extracted (non-uniform) coordinates.

## Gate results

- `node dist/cli.js validate model.yaml --library tokens.yaml` → **exit 0**
  (`validate.txt`).
- `node tools/offline-generate.mjs model.yaml layout.json --out out.drawio
--library tokens.yaml` → **exit 0, first try, no repair** (`generate.txt`).
- `npm run pipeline -- --example examples/showcase/2-cicd-flow --out-dir
/tmp/cicd-pipeline` → **exit 0**: source import 12 vertices / 10 edges,
  draw.io generation PASS, full gate **16 PASS / 0 FAIL / 0 WARN / 23
  NOT-CHECKABLE**.

See `RULES-CHECK.md` for the full diagram-rules.md compliance pass —
restyle: **26 PASS, 4 N/A, 0 FAIL**; reproduce: 34 PASS/N-A across
Connectors/Boxes/Colors/Text (2 documented rule exemptions, matching
1-cloud-web-app's precedent), and the cross-layer full gate is green.
