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
  semantics), and 5 applied tokens: `deployment.multi-az` (unchanged from
  the first iteration), `deployment.availability-zone`,
  `presentation.flow.direction`, `presentation.icon`, and
  `presentation.icon.position` (the last four are new — see "Direction
  token", "Icon tokens", and "Restored elements" below) — instead of
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
- **Both tiers' instance columns share x-positions** (250/430/798/978 — see
  the corridor bullet below for why 798/978 aren't 610/790), so `Web N`
  and `App N` line up vertically — the source's two Auto Scaling rows are
  each independently spaced and don't share columns.
- **Converging edges merge into one trunk with one arrowhead**
  (`web-instance-*->app-elb`, `app-instance-*->rds-master`), matching the
  spirit of the source's own visual style but drawn as a precise
  rules-compliant bus instead of four independently-routed elbow edges
  that happen to visually coincide.
- **Flow direction preserved bottom-to-top**, matching the source exactly
  (`user`/`route53` at the bottom, `rds-master`/`rds-slave` at the top;
  every arrowhead's final segment points up into the tier above — see
  "Direction token" below). An earlier iteration of this rework flipped the
  flow top-to-bottom for "conventional readability" — that was a fidelity
  loss the source didn't ask for and owner feedback reverted it. The
  layout-quality improvements below (grid, gaps, quantization, merged
  buses) are orthogonal to direction and are preserved unchanged from that
  iteration, just mirrored vertically.
- **A corridor between the two Availability-Zone bands.** The source
  leaves an x-gap (450-525) between its two AZ columns for the shared
  Elastic Load Balancing icon to sit in, outside either AZ. Once the AZ
  bands came back as real geometry (see "Restored elements"), the compute
  columns needed the same gap: `web-instance-3/4` and `app-instance-3/4`
  moved right (from x=610/790 to x=798/978) to open a 160px corridor
  (614-754) that both ELBs sit in, centered, with >=20px clearance from
  each band. This is a **documented exception to B2's single uniform
  horizontal gap** — the corridor (184px, band-edge to ELB-edge) is wider
  than the standard 40px sibling gap by design, for the same reason the
  source has it: the ELB is not a member of either zone. Both Autoscaling
  Group containers widened accordingly (740px -> 928px) to keep enclosing
  all 4 instances + margin; the canvas widened from 1000 to 1200.
- **Compressed canvas**: containers are sized to their true content (30px
  top/bottom padding around the child row, not the source's much larger,
  inconsistent AZ-box margins).

Gate: `node tools/offline-generate.mjs model.yaml layout.json --out out.drawio --library tokens.yaml`
exits 0 on the first try, no repair loop triggered (see `generate.txt`).

**Coordinate convention in `layout.json`**: `src/drawio.ts` writes every
node's `x`/`y` straight through as the emitted `<mxGeometry>`, with
`parent` set to `node.parentId ?? '1'`. Standard mxGraph/draw.io semantics
interpret a non-root-parented cell's geometry as **relative to its
parent's origin**, not canvas-absolute. So the 8 compute-instance nodes
(`parentId` = their ASG) use small relative offsets — `(30,30)`,
`(210,30)`, `(578,30)`, `(758,30)` (the jump from 210 to 578 is the
AZ-band corridor, see "What the layout improved over the source") —
identical for both ASGs since they share the same internal grid, while
every other node (`parentId: null`)
uses absolute canvas coordinates. `final.svg` is unaffected by this: it's
hand-authored directly from the absolute canvas positions (container
origin + relative child offset), not generated through `drawio.ts`.

## Flattening & simplification decisions

1. **Dropped 3 of the 6 pure-text annotation vertices** (`"A"`, `"EC2"`,
   `"AZ"`). None of these has a shape or AWS resource identity of its own
   — they're captions restating what their enclosing box already means.
   Their meaning survives in the container titles ("Web/App Tier
   Autoscaling Group (×2 AZ)"), the restored AZ-band labels (see "Restored
   elements"), and this README. Owner feedback restored the other 2 of the
   original 6 — the two rotated `"Availability Zone"` captions — as the AZ
   bands' own labels; they are no longer in the dropped list. The 6th text
   vertex, "Cross-AZ Replication", was never dropped — it's the source's
   own edge-label cell for the RDS replication edge, carried into the
   model as `rds-master-rds-slave`'s `metadata.label`.

2. **Consolidated the SSL-padlock icon node into a token, then restored it
   as a rendered glyph.** The source's padlock (`value=""`, generic
   `ssl_padlock` glyph — the only non-decorative-annotation node with no
   unique AWS resource identity) sat as a pass-through between `user` and
   its two downstream targets (`cdn`, `web-elb`). It is still **not** a
   model component — that consolidation into
   `security:security.encryption.in-transit`, applied directly to those
   two edges, is unchanged and is the semantically correct representation
   ("this traffic is HTTPS" is a property of the edge, not a node on it).
   What changed: `final.svg` now draws a small padlock glyph on each of
   those two edges, keyed off that same token's presence (see "Restored
   elements") — so the model stays clean (no decorative node) while the
   render restores the visual the source had. No token was invented for
   the `user->route53` edge, since the source doesn't route that edge
   through the padlock either.

3. **Still can't express the crossing Availability-Zone x
   Autoscaling-Group containment — flattened onto a second applied token
   instead of a second containment axis.** The source draws 2 Availability
   Zone boxes (as _columns_, x=225-450 and x=525-750) crossing 2 Auto
   Scaling boxes (as _rows_, y=319-394 and y=600-675) — each M3/M4 instance
   belongs to both an AZ _and_ an Auto Scaling group simultaneously, a
   genuine 2-D/crossing containment. The layout contract v0.1 only supports
   one `parentId` per node (a tree, not a lattice), so both dimensions
   still can't be represented as containment at once — this is a schema
   gap, not something owner feedback could fix by asking harder.

   The Autoscaling Group remains the real containment parent (2 container
   components, each holding its 4 instances via `parentId`), because it's
   the concrete AWS resource actually operating the instances. What
   changed from the first iteration: `infra:deployment.multi-az` (on each
   ASG, `value: {zoneCount: 2}`) is no longer the only trace of the AZ
   axis — each of the 8 compute-instance components now also carries
   `infra:deployment.availability-zone` (`value: a` or `b`, naming WHICH
   zone), and the visual layer draws that as real geometry: 2 dashed bands
   crossing both Autoscaling Group containers, exactly like the source
   (see "Restored elements"). The model-level flattening is unavoidable;
   the information loss it used to cause is not — the per-instance token
   plus the band geometry recovers it.

## Direction token

> **Updated:** `infra:presentation.flow.direction` is no longer _applied_
> anywhere in `model.yaml` — see "View layer (view.yaml)" below. The token
> **type** and the rationale for its value are unchanged and still live in
> `tokens.yaml`; this section now describes that rationale, not a live
> model.yaml application.

`infra:presentation.flow.direction` (`tokens.yaml`, domain `presentation`)
records that this diagram reads **bottom-to-top** (`value: up`), matching
the source exactly: `user`/`route53` at the bottom, `rds-master`/
`rds-slave` at the top, every arrowhead's final segment pointing up into
the tier above it (diagram-rules.md rule 3). Default policy: detect and
preserve the source's own flow direction when it already reads logically —
don't silently invert a diagram that makes sense on its own terms. This
token is how that decision gets recorded as data instead of staying
implicit in a pile of hand-picked y-coordinates, so a downstream
layout/render pass can consume it directly rather than re-deriving it from
geometry.

**Where it used to be applied, and why there (historical — model.yaml no
longer carries this token at all):** the architecture-model schema has no
model-wide token scope — `tokens` is a field on `component` and
`relationship` only (`$defs.component` / `$defs.relationship` in the spec
schema; the model itself has no top-level `tokens` array, and
`additionalProperties: false` means one can't be added informally). So this
token used to be applied once, on `user` — the component the whole flow
originates from — rather than repeated on all 19 components. `view.yaml`
isn't constrained by that schema, so `flow.direction` is now a genuine
top-level, diagram-wide field there instead — the single-component
workaround is gone, not relocated.

## Icon tokens and the nine-grid

> **Updated:** both tokens below are no longer _applied_ anywhere in
> `model.yaml` — see "View layer (view.yaml)" below. The token **types**
> and the per-component reasoning (including the table) are unchanged and
> still live in `tokens.yaml`; this section now describes that reasoning,
> not a live model.yaml application.

Two applied token **types**, both domain `presentation`, both `appliesTo:
{elementKinds: [component]}`:

- **`infra:presentation.icon`** — which glyph from `final.svg`'s shared
  icon set represents this component. One `<symbol>` per icon id inside a
  single `<defs>` block; every placement is a `<use href="#icon-...">` —
  that indirection **is** the icon token made concrete, not a stand-in
  description of it.
- **`infra:presentation.icon.position`** — a nine-grid anchor
  (`top-left`/`top-center`/`top-right`/`middle-left`/`middle-center`/
  `middle-right`/`bottom-left`/`bottom-center`/`bottom-right`) for where
  that glyph sits inside the component's box, clear of the title text
  (rule T1) and the box padding (rule T2).

Applied (from `view.yaml`, as `components[<id>][].icon` /
`components[<id>][].anchor` — see below) to all 17 leaf components that
have a source icon (not the 2 ASG
containers — see below). Position was chosen from the source's own
`labelPosition`/`verticalLabelPosition` style attribute on each icon
(grounded in `source.xml`, not guessed): `verticalLabelPosition=bottom`
(caption stacked below the icon) maps to `top-center`; `labelPosition=left`
(caption to the icon's left, icon on the right) maps to `middle-right`;
`labelPosition=right` maps to `middle-left`. Two components
(`route53`, `static-assets`) have long labels ("Amazon Route 53", "Static
Assets") where the source-matching middle-row position would put the icon
close enough to the centered title text to risk T1 at this box width
(140px); both are bumped to the top row on the same side instead — still
nine-grid, still right-anchored, just clear of the text row entirely. That
bump was verified empirically (render -> crop -> look), not assumed.

| component           | source style attr                 | icon id             | position       | why                                   |
| ------------------- | --------------------------------- | ------------------- | -------------- | ------------------------------------- |
| `user`              | `verticalLabelPosition=bottom`    | `actor.user`        | `top-center`   | icon-above-caption                    |
| `route53`           | `labelPosition=left` (icon right) | `aws.route53`       | `top-right`    | long label — bumped from middle-right |
| `web-elb`           | `labelPosition=right` (icon left) | `aws.elb`           | `middle-left`  | short label, safe at middle row       |
| `cdn`               | `labelPosition=left` (icon right) | `aws.cloudfront`    | `middle-right` | short label, safe at middle row       |
| `static-assets`     | `labelPosition=left` (icon right) | `aws.static-assets` | `top-right`    | long label — bumped from middle-right |
| `s3`                | `labelPosition=left` (icon right) | `aws.s3`            | `middle-right` | short label, safe at middle row       |
| `web-instance-1..4` | `verticalLabelPosition=bottom`    | `aws.ec2-instance`  | `top-center`   | icon-above-caption                    |
| `app-elb`           | `labelPosition=right` (icon left) | `aws.elb`           | `middle-left`  | short label, safe at middle row       |
| `app-instance-1..4` | `verticalLabelPosition=bottom`    | `aws.ec2-instance`  | `top-center`   | icon-above-caption                    |
| `rds-master`        | `labelPosition=left` (icon right) | `aws.rds`           | `middle-right` | short label, safe at middle row       |
| `rds-slave`         | `labelPosition=right` (icon left) | `aws.rds`           | `middle-left`  | mirrors master, matches source        |

**Not applied to `web-asg`/`app-asg`.** The source's own small "Auto
Scaling" badge icon on those group shapes is redundant with the
container's own title text ("Web/App Tier Autoscaling Group") — same
reasoning as dropping the pure-text annotation vertices above, applied to
a decorative icon instead of a decorative text node.

**Not a relationship-level token.** The one edge-attached icon this
diagram needs (the SSL padlock) is keyed off the _existing_
`security:security.encryption.in-transit` token's presence on an edge —
see "Restored elements" — not a second, parallel icon-token type on
relationships. All icon colors reuse the 6 domain hexes (plus neutral
`#4B5563`) already in the C1 palette comment; no new colors were
introduced for icons, only documented under a new ICONS section of that
same comment block (rules-lint's C1 check keys off the single comment with
the most documented hex values, so the ICONS section had to land inside
the existing palette comment, not a separate one).

## Restored elements

Three things owner feedback asked back in, all at the visual layer only
(the model-level flattening decisions above are unchanged and still
documented as such):

**(a) The two Availability Zone bands.** Two dashed, neutral (`#94A3B8`
border, no fill — domain STRUCTURE in the C1 palette, not one of the six
meaningful domains) rounded rectangles, drawn the same way example 4
(`examples/showcase/4-kubernetes`) draws its namespace containers, but
crossing both Autoscaling Group containers vertically (20px past each
container's own top/bottom edge, so the band's stroke is never coincident
with the container's — B10 in spirit, even though a crossing band isn't a
"nested box" in B10's literal sense) instead of nesting inside one. Each
band's horizontal extent covers exactly the 2 instances (per tier) whose
`infra:deployment.availability-zone` value matches (`a`: instances 1-2,
`b`: instances 3-4), inset 24px around them — 6px inside the ASG
container's own 30px margin, so the two boundaries never coincide either.
Band labels ("Availability Zone A"/"B") are rotated -90°, matching the
source's own rotation, and drawn **last** in `final.svg` (after the
opaque Autoscaling Group container fill) — an earlier draft drew them
right after the band rects and the container fill painted over half of
each label; moving them to the end of the file fixed it without changing
their position. **AZ bands exist only in `final.svg`, never in
`layout.json`** — the offline generator (`tools/offline-generate.mjs`)
iterates `model.components` and would silently ignore a node with no
matching component, so a pseudo-node for a band would be dead weight, not
a rendering hint.

**(b) The SSL padlock glyph**, on the two edges that carry
`security:security.encryption.in-transit` (`user->cdn`, `user->web-elb`).
A small padlock `<symbol>` (from the same shared `<defs>` set as the
component icons) sits on each edge's horizontal run, with a white disc
behind it masking the connector line — the icon reads as a badge clipped
onto the wire, the same visual idiom the source itself uses, rather than
being a label the line strikes through (T1's masking option, applied to a
glyph instead of text).

**(c) The rotated "Availability Zone" captions**, as the AZ bands' own
labels — see (a). This closes the gap in the "what was dropped" list: of
the source's original 6 pure-text annotation vertices, only `"A"`, `"EC2"`,
and `"AZ"` are still dropped (see "Flattening & simplification decisions"
#1); "Cross-AZ Replication" was never dropped; the two "Availability Zone"
captions are restored here.

## View layer (view.yaml)

This example is the prototype for a View Layer Contract: presentation
facts (flow direction, per-component icon + nine-grid anchor, per-edge
icon attachments, and the two AZ-band visual elements) now live in
`view.yaml`, not as `infra:presentation.*` applied tokens inside
`model.yaml`. `model.yaml` keeps only semantic tokens
(`deployment.multi-az`, `deployment.availability-zone`,
`security.encryption.in-transit`); `tokens.yaml` still defines the three
`presentation.*` token **types** (a view document has no independent
vocabulary mechanism of its own) under a "View vocabulary" section, now
documented as applied from `view.yaml`, not `model.yaml`. `final.svg`
carries `data-component="<id>"` on every one of the 19 rendered model
components and `data-view-element="<id>"` on the two AZ-band rects, so a
tool can trace SVG geometry back to `model.yaml`/`view.yaml` mechanically.

`census.yaml` is the companion machine-readable manifest: one record per
**source** element (28 vertices + 23 edges from `source.xml`, by stable
source id), each with an exclusive `primary_bucket`
(`component`/`relationship`/`token`/`visual`/`drop`) and `target_ids`
trace links — replacing this README's prose "18 icons − 1 + 2 = 19" bucket
counting with something a tool can check.

`tools/rules-lint.mjs` gained four cross-layer checks
(`UNKNOWN_ICON_SYMBOL`, `UNTRACEABLE_VISUAL`/`MISSING_COMPONENT`,
`DIRECTION_GEOMETRY_CONFLICT`, `CENSUS_MISMATCH`) that read these files
together; see `node tools/rules-lint.mjs --help` for exactly what each
one needs and checks. Gate: the full cross-layer invocation (`final.svg`

- `--model` + `--view` + `--census` + `--layout`) exits 0 for this
  example.
