# 1 — cloud-web-app (AWS SaaS 3-tier web application)

## Source

- URL: https://raw.githubusercontent.com/jgraph/drawio-diagrams/dev/examples/aws-saas-example.drawio
- Repo: `jgraph/drawio-diagrams`
- License: Apache-2.0 (not share-alike; no attribution clause required beyond
  crediting the source, done here)
- Fetched: 2026-08-24T06:33:00Z
- Original title: "AWS SaaS example architecture"

The original `.drawio` file stores its diagram as base64+deflate inside a
`<diagram>` tag (standard draw.io compression); `source.xml` is the decoded
plain `<mxGraphModel>` used as the actual input for this example.

## Node / edge count

The source's own vertex count is 28 (20 was `meta.json`'s pre-decode
estimate), breaking down as:

- **18 real AWS resource icons** with unique instance geometry: 4x M4,
  4x M3, 2x ELB, S3, CloudFront, Static Resources, Route 53, User, SSL
  padlock, RDS Master, RDS Slave (one of these, the padlock, gets
  consolidated away below).
- **4 group/container boxes**: 2 Availability Zone boxes, 2 Auto Scaling
  boxes.
- **6 pure-text annotation vertices**: "A", two rotated "Availability
  Zone" captions, "EC2", "AZ", and the "Cross-AZ Replication" edge-label
  cell (a child of the RDS replication edge, not a floating node).

  `18 + 4 + 6 = 28` ✓. It has 23 edges.

The semantic model (`model.yaml`) captures **19 components / 22
relationships**: `18 icons − 1 (padlock, consolidated into a security
token) + 2 (the Auto Scaling boxes, promoted from decoration to real
container components) = 19`. Every node and edge of the source is
represented _except_ the consolidations below, which are decorative or
structurally inexpressible in the layout-contract v0.1 schema (see
"Flattening & simplification decisions"). 19 is well above the task's
minimum-10 floor.

## What the semantic model captures

- **Ingress**: `user` (external actor), `route53` (DNS), the CDN path
  (`cdn` -> `static-assets` -> `s3`), and both load balancers.
- **Compute**: two Autoscaling Group container components (`web-asg`,
  `app-asg`), each with 4 child compute-instance components — using the
  layout contract's `parentId` containment exactly as intended.
- **Data tier**: `rds-master` / `rds-slave` (`core:component.database`,
  `configuration.engine: amazon-rds`) with a `replicates-to` relationship
  carrying the source's "Cross-AZ Replication" label.
- **Security**: `security:security.encryption.in-transit` applied to the
  two edges that visually passed through the source's SSL-padlock icon
  (`user->cdn`, `user->web-elb`) — see below for why the icon itself isn't
  a component.
- **A local token library** (`tokens.yaml`, namespace `infra`): the
  built-in `core` library only defines `component.database` /
  `component.service` / `component.external-actor` and
  `relationship.call.sync` / `data.read` / `belongs.to` — none of which
  correctly names a DNS service, CDN, load balancer, object-storage bucket,
  static-content bundle, compute instance, or autoscaling group. Added 6
  component-types, 1 relationship-type (`routes-to`, for LB->instance
  traffic distribution — distinct from `call.sync`'s peer-to-peer request
  semantics), and 1 applied token (`deployment.multi-az`) instead of
  mislabeling everything as a generic `component.service`.

Gate: `node dist/cli.js validate model.yaml --library tokens.yaml` exits 0
(see `validate.txt`).

## What the layout improved over the source

- **Shared grid + uniform 40px gap everywhere** (row spacing, lane
  spacing, sibling-instance spacing) — the source hand-places boxes with
  inconsistent offsets (e.g. `M3`/`M4` instance x-positions aren't evenly
  spaced: 270, 367.5, 550.61/581, 645/675).
- **Quantized, uniform box size**: every leaf box is 140x60 (one formula,
  one line-height); the source mixes instance-icon sizes (55x57.75),
  resource-icon sizes (56.76x69, 69x69, 69x72) and text-label pseudo-boxes
  with no consistent sizing rule.
- **Both tiers' instance columns share x-positions** (250/430/610/790), so
  `Web N` and `App N` line up vertically — the source's two Auto Scaling
  rows are each independently spaced and don't share columns.
- **Converging edges merge into one trunk with one arrowhead**
  (`web-instance-*->app-elb`, `app-instance-*->rds-master`), matching the
  spirit of the source's own visual style but drawn as a precise
  rules-compliant bus instead of four independently-routed elbow edges
  that happen to visually coincide.
- **Flow direction flipped top-to-bottom** (entry at top, database at
  bottom) instead of the source's bottom-to-top flow, for conventional
  readability — a deliberate layout choice, not a fidelity loss; every
  node and edge from the source is still present.
- **Compressed canvas**: containers are sized to their true content (30px
  top/bottom padding around the child row, not the source's much larger,
  inconsistent AZ-box margins), and the canvas height (780) is trimmed to
  what the content needs.

Gate: `node tools/offline-generate.mjs model.yaml layout.json --out out.drawio --library tokens.yaml`
exits 0 on the first try, no repair loop triggered (see `generate.txt`).

**Coordinate convention in `layout.json`**: `src/drawio.ts` writes every
node's `x`/`y` straight through as the emitted `<mxGeometry>`, with
`parent` set to `node.parentId ?? '1'`. Standard mxGraph/draw.io semantics
interpret a non-root-parented cell's geometry as **relative to its
parent's origin**, not canvas-absolute. So the 8 compute-instance nodes
(`parentId` = their ASG) use small relative offsets — `(30,30)`,
`(210,30)`, `(390,30)`, `(570,30)` — identical for both ASGs since they
share the same internal grid, while every other node (`parentId: null`)
uses absolute canvas coordinates. `final.svg` is unaffected by this: it's
hand-authored directly from the absolute canvas positions (container
origin + relative child offset), not generated through `drawio.ts`.

## Flattening & simplification decisions

1. **Dropped 5 of the 6 pure-text annotation vertices** (`"A"`, two
   rotated `"Availability Zone"` captions, `"EC2"`, `"AZ"`). None of these
   has a shape or AWS resource identity of its own — they're captions
   restating what their enclosing box already means. Their meaning
   survives in the container titles ("Web/App Tier Autoscaling Group (×2
   AZ)") and in this README. The 6th text vertex, "Cross-AZ Replication",
   is _not_ dropped — it's the source's own edge-label cell for the RDS
   replication edge, and it is carried into the model as
   `rds-master-rds-slave`'s `metadata.label`.

2. **Dropped the SSL-padlock icon node** (`value=""`, generic
   `ssl_padlock` glyph — the only non-decorative-annotation node in the
   source with no unique AWS resource identity). It sat as a pass-through
   between `user` and its two downstream targets (`cdn`, `web-elb`).
   Consolidated into the `security:security.encryption.in-transit` token
   applied directly to those two edges — a more semantically correct
   representation of "this traffic is HTTPS" than a decorative
   intermediate node, and a better fit for what the Architecture Tokens
   spec is _for_ (carrying meaning as tokens, not as icons). No token was
   invented for the `user->route53` edge, since the source doesn't route
   that edge through the padlock either.

3. **Flattened the crossing Availability-Zone x Autoscaling-Group
   grouping.** The source draws 2 Availability Zone boxes (as _columns_,
   x=225-450 and x=525-750) crossing 2 Auto Scaling boxes (as _rows_,
   y=319-394 and y=600-675) — each M3/M4 instance belongs to both an AZ
   _and_ an Auto Scaling group simultaneously, a genuine 2-D/crossing
   containment. The layout contract v0.1 only supports one `parentId` per
   node (a tree, not a lattice), so both dimensions can't be represented
   as containment at once.

   Chose the **Autoscaling Group as the real containment parent** (kept as
   2 container components, each holding its 4 instances via `parentId`)
   because it's the concrete AWS resource actually operating the
   instances. Represented the Availability-Zone dimension instead as an
   applied token — `infra:deployment.multi-az` with `value: {zoneCount:
2}` — on each ASG component, and surfaced it in the container's visual
   title ("×2 AZ") so the redundancy fact isn't lost, just relocated from
   a second containment axis to metadata.
