# 4-kubernetes

## Source

- **URL:** https://raw.githubusercontent.com/jgraph/drawio-diagrams/dev/templates/gcp/dev_test_ui_testing_with_kubernetes.xml
- **Repo:** `jgraph/drawio-diagrams`
- **License:** Apache-2.0
- **Fetched:** 2026-08-24T06:34:00Z
- **Title:** "Architecture: Dev Test > UI Testing with Kubernetes"

The `kubernetes/community` repo suggested for this genre has no `.drawio`/`.xml`
diagram assets in its tree (it's a docs/policy repo), so its path 404s at the
content level. Substituted with a bundled GCP reference-architecture template
from `jgraph/drawio-diagrams` (same repo used for showcase example 1,
Apache-2.0) whose subject is squarely the "kubernetes" genre: a GKE deployment
running a Selenium/Firefox grid in front of a two-tier web app, split across
two Kubernetes namespaces. See `meta.json` for the full substitution note.

Apache-2.0 requires no share-alike attribution beyond preserving the license
and copyright notice; there is no CC-BY-SA obligation for this source.

## What the source diagram shows

9 nodes / 9 edges (drawio node/edge count, i.e. excluding the two namespace
background boxes, the outer platform box, and the title bar, none of which
are graph nodes):

- **Tester** (external actor) issues WebDriver calls into a Selenium grid.
- **Selenium Namespace**: `Selenium Hub (Replication Controller)` ->
  `Hub Service` fans out to two Firefox worker pools --
  `Firefox Nodes (Attribute Name)` and `Firefox Nodes (Replication
Controller)` -- which both feed `Frontend Service`.
- **Web App Namespace**: `Frontend Service` -> `UI Servers (Replication
Controller)` -> `Backend Service` <- `Backend Servers (Replication
Controller)`.
- Both namespaces sit inside a "Google Cloud Platform" boundary; the Tester
  is drawn outside it.

## Semantic model (`model.yaml` + `tokens.yaml`)

Captures all 9 nodes and all 9 edges 1:1 (component/relationship ids listed
in each element's `metadata.sourceIds`, tracing back to the original drawio
cell ids).

- **Tester** -> `core:component.external-actor` (a direct fit; no local
  token needed).
- The 8 in-cluster components split into two Kubernetes-specific concepts
  the built-in `core`/`security`/`environment`/`lifecycle` libraries don't
  cover: a **workload** (`k8s:workload.replication-controller`, the 5
  "Kubernetes Engine" icon boxes) and a **network** object
  (`k8s:network.service`, the 3 small "* Service" boxes). These are real,
  distinct Kubernetes resource kinds -- collapsing them into one generic
  `core:component.service` would lose exactly the distinction the source
  diagram itself draws (icon+card vs. plain label pill). Added as a local
  `tokens.yaml` (namespace `k8s`), per the brief's instruction to add a
  token library when a needed concept is missing.
- A third local applied-token, `k8s:topology.namespace` (value
  `{name: string}`), records which of the two Kubernetes namespaces each
  in-cluster component is deployed into -- see "Containment" below for why
  this is a token rather than a structural parent.
- `environment:environment.development` is applied to all 8 in-cluster
  components (the source title is literally "Dev Test"). Not applied to
  Tester, which isn't itself deployed anywhere.
- `security` and `lifecycle` are not used: the source shows no
  encryption/TLS claim and no diff/change-state semantics to model, and
  inventing either would assert something not present in the source.
- All 9 relationships are typed `core:relationship.call.sync` (direct
  synchronous calls/traffic hops), matching the source's arrow semantics
  (WebDriver / HTTP calls between one component and the next).

### Fidelity note: "Firefox Nodes (Attribute Name)"

The source drawio literally labels one box `Firefox Nodes (Attribute Name)`,
parallel to its sibling `Firefox Nodes (Replication Controller)`. This is
almost certainly an unedited template placeholder left by the upstream
author (Kubernetes has no resource kind called "Attribute Name"), not a
documented term. Preserved verbatim in `model.yaml` per fidelity to the
source, with a `sourceLabelNote` explaining the oddity rather than silently
"fixing" it to something invented.

### Fidelity note: `backend-servers-rc` has no incoming edge

In the source, `Backend Servers (Replication Controller)` only has an
_outgoing_ edge into `Backend Service` -- nothing feeds it, unlike its
structural mirror `Firefox Nodes (Replication Controller)`, which is fed by
`Hub Service`. This is a genuine asymmetry in the source data (9 edges
total, none targeting that node), not a modeling omission here; preserved
as-is rather than inventing a driving edge to make the two namespaces
perfectly symmetric.

### Containment: flattened, not modeled as parent components

The two namespace boxes and the outer "Google Cloud Platform" box are
structural groupings in the source, not separate graph nodes (they're
excluded from the 9/9 node/edge count). The `architecture-model` component
schema (`node_modules/@architecture-tokens/spec/schema/architecture-model.schema.json`)
has no parent/containment field on a component (`additionalProperties:
false`, only `id`/`type`/`tokens`/`configuration`/`metadata`) -- so per the
brief's instruction ("parent components if the model schema supports
containment, else flatten"), containment is **not** modeled at the semantic
layer. The namespace grouping is instead carried as data via the
`k8s:topology.namespace` applied token on each component (see above), and
the layout contract's `parentId` is left `null` for every node (flat) since
`parentId` may only reference another id present in `model.components`
(`src/layout.ts`'s `validateLayout`), and no separate namespace/platform
components exist to be a legal parent.

The _visual_ nesting the brief calls for ("cluster/zone groupings become
nested containers, B9/B10") is still delivered -- at the `final.svg` layer,
where the platform and the two namespace boxes are drawn as background
rectangles computed directly from the bounding box of their member nodes'
`layout.json` geometry plus a fixed margin, independent of the semantic
model's flat component list.

## Layout (`layout.json`)

Hand-authored as a shared grid, computed from named constants (one script
derives both `layout.json` and `final.svg` from the same geometry, so they
can't drift): one workload-box size (232x104) and one service-box size
(140x56) reused for every peer, one horizontal gap (64) and one vertical
gap (40) reused everywhere, all 5 single-row items sharing one row-center
so their connectors run straight, and the two stacked pairs sharing one
top-row-y / bottom-row-y so their connectors align on the fan axis (Diagram
rules B1-B3, B8). All 9 edges carry orthogonal (axis-aligned) waypoints;
fan-out and fan-in pairs share a common trunk segment (rule 11/B3).

Improvement over the source layout: the source's box sizes and gaps were
hand-placed per-node with small inconsistencies (e.g. the Firefox pair's
box height (68) differs slightly from the Selenium Hub box's implied
height, and gaps between columns aren't uniform); this version quantizes
every box to one of two sizes by content-line-count and uses exactly two
gap constants for the whole diagram.

## Rendering (`final.svg` / `final.png`)

Hand-authored SVG applying `diagram-rules.md` in full -- see
`RULES-CHECK.md` for the rule-by-rule accounting (27 PASS, 4 N/A, 0 FAIL).
One deviation surfaced during rendering and was fixed before finalizing:
the first pass used a 216-unit-wide workload box, which let
"(Replication Controller)" overflow past the box's right padding (T2
violation, visible on render); fixed by widening the workload box to 232
units and trimming the title font from 13.5px to 12.5px, re-verified by
cropping the rendered PNG.

## Gates

- `node dist/cli.js validate examples/showcase/4-kubernetes/model.yaml
--library examples/showcase/4-kubernetes/tokens.yaml` -> exit 0 (see
  `validate.txt`).
- `node tools/offline-generate.mjs examples/showcase/4-kubernetes/model.yaml
examples/showcase/4-kubernetes/layout.json --out
examples/showcase/4-kubernetes/out.drawio --library
examples/showcase/4-kubernetes/tokens.yaml` -> exit 0, first try, no
  repair triggered (see `generate.txt`).
