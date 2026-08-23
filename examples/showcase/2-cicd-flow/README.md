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

## Gate results

- `node dist/cli.js validate model.yaml --library tokens.yaml` → **exit 0**
  (`validate.txt`).
- `node tools/offline-generate.mjs model.yaml layout.json --out out.drawio
--library tokens.yaml` → **exit 0, first try, no repair** (`generate.txt`).

See `RULES-CHECK.md` for the full diagram-rules.md compliance pass:
**26 PASS, 4 N/A, 0 FAIL.**
