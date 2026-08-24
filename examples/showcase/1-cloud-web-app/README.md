# 1 — cloud-web-app (AWS SaaS 3-tier web application)

## Conversion modes (added 2026-08-24)

This example now carries **two views of the same model** — see
`examples/showcase/README.md` "Conversion modes" for the general contract.
`model.yaml`, `tokens.yaml`, and `census.yaml` are shared, unmodified,
between both:

| View                      | Mode        | Files                                                                 | Status                                                                                                                                                  |
| ------------------------- | ----------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`view-reproduce.yaml`** | `reproduce` | `layout-reproduce.json`, `final-reproduce.svg`, `final-reproduce.png` | **PRIMARY**, per owner decision (2026-08-24) — this example was the case study that motivated adding the reproduce/restyle mode gate in the first place |
| `view.yaml`               | `restyle`   | `layout.json`, `final.svg`, `final.png`, `out.drawio`                 | secondary/historical — predates the mode split; kept as the Diagram-rules re-layout alternative                                                         |

**Why reproduce is primary:** `source.xml` already conveys deliberate
structure — this is a well-known, widely reproduced AWS reference
architecture (Route 53 → CloudFront/ELB → two-AZ × two-tier autoscaling
web/app fleet → RDS master/slave). Every applicable Diagram rule that the
restyle pass above had to actively FIX (icons, palette, the AZ bands, the
SSL padlock — see "Restored elements" below) was already present and
correct in the source. The restyle's one real structural move — flattening
the source's crossing Availability-Zone × Autoscaling-Group grouping into
two single-parent containers, and widening the corridor between them — is
a genuine loss of the source author's own spatial reasoning, not a defect
fix; see this file's own "What the layout improved over the source"
section, which candidly documents that move as an _improvement judgement_,
not a defect correction. That is exactly the case
`examples/showcase/README.md`'s conversion-modes contract calls out: "A
high-quality source reproduced faithfully BEATS a rules-perfect re-layout
of it."

See "Reproduce mode" near the end of this file for the reproduce view's
own geometry-extraction method, icon provenance, source-defect list, and
visual-diff notes against `source.png`. `RULES-CHECK.md`'s "Reproduce
mode" section covers the Diagram-rules check-by-check pass for
`final-reproduce.svg`.

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

## Reproduce mode (`view-reproduce.yaml`, PRIMARY)

### Geometry extraction

`layout-reproduce.json`'s 19 nodes are `source.xml`'s own `mxGeometry`
`x`/`y`/`width`/`height` values (verified by parsing `source.xml`
programmatically, not transcribed by eye), passed through one uniform
integer offset — `x' = round(x) - 61`, `y' = round(y) - 134` — chosen so
the extracted bounding box (source `x:[101.25, 750]`, `y:[174, 863.36]`)
lands at a comfortable 40px margin from `(0,0)`; no scaling, no invented
coordinates. `canvas: {width: 749, height: 789}`. Every node's `parentId`
is `null`: `source.xml` itself parents every vertex directly to root cell
`"1"` (there is no source-level nesting at all — see "Flattening &
simplification decisions" #3 below for why the AZ×ASG crossing can't be
containment either way), so "parent-relative coordinates for parented
nodes" applies vacuously here — nothing in this source is parented, and
inventing a single-parent hierarchy the source doesn't have would be the
opposite of extraction. `web-asg`/`app-asg` (source ids 4/5, the
horizontal Autoscaling-Group bands) are full `layout-reproduce.json`
nodes like every other component — `src/layout.ts`'s `OMITTED_LAYOUT_ID`
check requires every `model.yaml` component id to appear — sized to the
source's own full-width band geometry (525×75), not the restyle's
padded 928×120 container.

Gate: `node tools/offline-generate.mjs model.yaml layout-reproduce.json --out out-reproduce.drawio --library tokens.yaml` exits 0, first try.

### Icon provenance

Per an explicit requirement added mid-task: every AWS glyph in
`final-reproduce.svg` is the **official AWS Architecture Icons artwork**,
not a hand-drawn approximation (the restyle's `final.svg` icons, built
before this requirement existed, stay hand-drawn — see
`examples/showcase/README.md`'s "Conversion modes": upgrading them is
optional, not required).

- **Channel**: npm package [`aws-svg-icons`](https://www.npmjs.com/package/aws-svg-icons), version `3.0.0-2021-07-30`, fetched via jsDelivr's raw CDN (`https://cdn.jsdelivr.net/npm/aws-svg-icons@3.0.0-2021-07-30/...`). Its own README states it mirrors "all the official AWS icons published at https://aws.amazon.com/architecture/icons/" — the asset package dated 07302021 (July 30, 2021), the same naming AWS itself uses for that release ("Resource-Icons_07302021", "Architecture-Service-Icons_07302021").
- **Primary permission source**: `aws.amazon.com/architecture/icons/` states "We allow customers and partners to use these toolkits and assets to create architecture diagrams" and permits their use "in materials like whitepapers, presentations, data sheets, and posters" (fetched 2026-08-24) — this diagram is exactly that use.
- **Redistribution-channel license**: the `aws-svg-icons` package does not carry its own separate license file, but the sibling official AWS Labs GitHub repo that redistributes the same 07302021 asset package for a different tool, [`awslabs/aws-icons-for-plantuml`](https://github.com/awslabs/aws-icons-for-plantuml), states its `LICENSE` as **Creative Commons Attribution-NoDerivs 2.0** (verbatim CC BY-ND 2.0 text, fetched 2026-08-24). Recorded here for completeness — this repo takes no legal position on how CC BY-ND 2.0's "no derivatives" clause interacts with AWS's own diagram-use permission above; both texts are quoted so a reviewer can judge. Where this example recolors an icon's fill (below), that is disclosed, not hidden.
- **Icons used, unmodified white glyph on a source-matched gradient background** (Architecture Service Icons, 64px, `Arch_<Service>_64.svg`): `aws.elb` (Elastic Load Balancing), `aws.cloudfront` (Amazon CloudFront), `aws.route53` (Amazon Route 53 — its official artwork is itself a highway-shield "53" badge, an unplanned but exact match for the source's own shield-53 glyph), `aws.s3` (Amazon Simple Storage Service), `aws.rds` (Amazon RDS). Background gradient colors are `source.xml`'s own `fillColor`/`gradientColor` pairs (a real 2-stop `linearGradient`, `gradientDirection="north"` reproduced as a pure-vertical gradient, matching the source's own gradient direction exactly), not AWS's current (2021) category-color scheme — disclosed deviation: AWS's 2021 set categorizes ELB under Networking (purple), while the source (and this reproduction) uses the older orange/compute-family hue for ELB, to stay faithful to `source.png`, the stated fidelity target.
- **Icons used as shipped, no recolor** (Resource Icons, 48px, `Res_<Name>_48_Light.svg`, bare glyph, no background box — matches source exactly, which also draws these two as bare colored silhouettes with no box): `actor.user` (`Res_User_48_Light`, official `#242F3E`, source's own value is `#232F3E` — near-identical) and `security.ssl-padlock` (`Res_SSL-padlock_48_Light`, official `#232F3D` — the shape name literally matches source's own `mxgraph.aws4.ssl_padlock`).
- **Icon recolored, disclosed**: `aws.ec2-instance` (`Res_Amazon-EC2_Instance_48_Light` — a bare outline "chip with pins" glyph whose hollow center is produced by the source SVG's own `fill-rule="evenodd"`, carried through here). Shipped fill is `#D45B07`; recolored to source's own `#F58534` to match `source.png`'s exact hue. Reused for all 8 EC2-instance nodes (both the `M4`-labeled and the chip-icon-rendered-as-`C3` tier — see "Source-fidelity notes" below for why `C3` and not the XML's dead `M3` attribute), matching the source, which also draws all 8 with the identical glyph.
- **No official equivalent, hand-drawn fallback (disclosed)**: `aws.static-assets`. The source's `Static Resources` node uses `shape=mxgraph.aws4.resourceIcon;resIcon=general` — an AWS4-stencil-era generic "unspecified resource" wireframe-cube placeholder glyph that AWS retired when it redesigned its icon set (no `Res_General*`/`Arch_General*` file in the 07302021 package matches it — checked the full `Res_General-Icons` and category listings). Kept as the pre-existing hand-drawn cube (from `final.svg`'s icon set), recolored to the source's exact `#1E262E`→`#505863` gradient background with a white cube glyph, matching `source.png`'s look. Per the task's own fallback clause: "If every channel fails... fall back to the current hand-drawn glyphs, mark the deviation prominently."
- **Decorative-only bonus**: `icon-aws-ec2-auto-scaling` (`Res_Amazon-EC2_Auto-Scaling_48_Light`, official artwork) draws the small orange badge inside each Autoscaling-Group band, matching `source.png`'s own badge — rendered as raw SVG content, not through a `view.yaml` icon attachment (same precedent as `web-asg`/`app-asg` carrying no attachment at all — see `view.yaml`'s existing comment). `rules-lint`'s `UNKNOWN_ICON_SYMBOL` reports this as WARN (an unused `<symbol>` no attachment references), not FAIL — confirmed non-blocking under `--full`.

All symbol `<path>` content is copied verbatim from the fetched official
SVGs (only the wrapping `fill-rule="evenodd"` from each source file's own
`<g>` element is preserved on the `<symbol>`, since several glyphs —
the EC2 chip's hollow center, the RDS cylinder's rings — depend on it to
render correctly), with editor cruft (`<title>`, `<desc>`, Sketch
generator comments, `xlink` namespace noise) stripped.

### Source defects fixed

1. **Invisible "Availability Zone A/B" band labels.** `source.xml` sets
   `fontColor="#ffffff"` on these two rotated-text vertices (source ids 42,
   43), on a fully transparent background — genuinely invisible in
   `source.png` (confirmed: cropped and inspected at 2x zoom, no trace of
   the text). Rendered here in the band's own `#5A6C86` stroke color;
   position and `rotate(-90 ...)` are otherwise unchanged from source. The
   other three white-on-white text vertices (`"A"`, `"EC2"`, `"AZ"` —
   source ids 41, 44, 46) stay **dropped**, per `census.yaml`'s existing,
   unmodified drop records: they were genuinely invisible in `source.png`
   too, so dropping them (not "fixing" them into existence) is what
   fidelity to the _visual_ source actually requires — inventing visible
   text the source never showed would be the opposite of a defect fix.
2. **Dead `value="M3"` attribute on the bottom instance tier — not
   fixed, documented.** `source.xml`'s 4 bottom-tier compute-instance
   cells (ids 22/24/26/28) carry `value="M3"`, but their
   `shape=mxgraph.aws4.optimized_instance` glyph bakes its own `"C3"`
   lettering directly into the icon artwork; drawio does not additionally
   render the cell's `value` text for this shape family. Cropped and
   confirmed at 2x zoom: `source.png` shows `"C3"`, never `"M3"`, on all 4
   boxes. Since the task's own fidelity target is `source.png` ("LOOK at
   it hard, it is the visual target"), this reproduction labels those
   boxes `"C3"` — what a viewer actually sees — and records the XML/PNG
   mismatch here rather than silently reproducing the PNG's own visible
   text as if it were uncontested. This is _not_ one of the disclosed
   "genuine source defects... you may fix" — nothing was changed, the
   dead attribute was simply not the fidelity target.

### Visual-diff notes vs `source.png`

What differs, and why:

- **Ingress-route crossing corrected.** Source edge 38 (`ssl_padlock` ->
  `CloudFront`) carries an explicit elbow control point at `y=760`.
  Applying the reproduction's uniform `-134` y translation puts that
  horizontal leg at `y=626`, below the web-tier fan bus at `y=593`, just
  as `source.png` shows it. An earlier extraction incorrectly used
  `y=560`; that made the CDN route cross both the fan bus and its first
  vertical branch even though neither crossing exists in the source.
  `layout-reproduce.json`, the SVG, editable draw.io output, PNG, and
  showcase report now all use `y=626`.
- **Connector corners rounded (rule 3a).** `source.xml`'s connectors are
  all sharp right-angle bends. This file originally kept them sharp too,
  under rule 3a's now-REMOVED reproduce-mode exemption (owner decision
  2026-08-24: corner-rounding is line treatment, not content, so it is
  now normative in both conversion modes — see `examples/showcase/
README.md`'s "Conversion modes" and `RULES-CHECK.md`'s "Connectors"
  section for the mechanics). The first pass converted only the 2
  SSL-badge paths and missed 16 fan-in/fan-out elbows because those routes
  were encoded as separate one-segment polylines meeting at a bus. That
  static-lint blind spot was caught by visual review. The fan routes now
  keep separate elements only at genuine T-junctions; every logical turn
  is one path with the same 5-unit `Q` corner used by the restyle. One SSL
  connector (`user->web-elb`) has a genuine 5.5-unit micro-jog in the
  extracted geometry (`259.5,697.5 -> 259.5,692`), shorter than 2x the
  diagram's 5-unit radius — so BOTH of its bends (the two Q arcs flanking
  that short segment) clamp per rule 3a's clamp clause, each to
  r_eff = min(5, 5.5/2) = 2.75, rather than the full 5-unit radius. The
  other connector (`user->cdn`) and all 16 fan elbows keep the full radius
  unclamped. This is a mechanical constraint of the short segment, not a
  second chosen radius. Node, icon, container, label, and edge endpoint
  geometry remains unchanged.
- **Connector color**: uniform `#505863` grey, matching every single edge
  in `source.xml` (grepped: the only other `strokeColor` values present are
  box borders `#5A6C86`/`#D86613`/`#ffffff`, none on an edge) — including
  the dashed RDS-replication line. An earlier draft of this file
  mistakenly imported `final.svg`'s restyle-only "arrow color = destination
  domain" (C2) convention even onto these two SSL-tagged edges; fixed once
  spotted, since `source.png` uses one neutral color for every connector,
  never a per-domain palette.
- **AZ-band corner badges omitted.** `source.png` draws a tiny
  location-pin badge in the top-left corner of each Availability-Zone
  band (the AWS4 `group_availability_zone` stencil's own decoration, no
  separate semantic content — redundant with the band's own dashed
  border + label). No official 2021 icon matches that specific
  location-pin glyph in the general-icons set checked; given it carries
  no meaning beyond "this is an AZ" (already conveyed twice over),
  it's left out rather than approximated with a mismatched official
  glyph or a new hand-drawn one.
- **Auto-Scaling badge glyph**: source's own badge (inside a small orange
  square, matching the "Auto Scaling" text beside it) is a different,
  unidentified small icon (looks like a location/target marker in the
  rendered PNG, not distinguishable from the AWS4 stencil's compressed
  rendering at that size). Replaced with the official
  `Res_Amazon-EC2_Auto-Scaling_48_Light` glyph on the same orange
  background — same idiom (small colored badge next to the label), an
  even more literally on-brand choice than trying to match an
  unidentifiable source pixel pattern.
- **Overall proportions**: this reproduction's canvas (749×789, plus a
  wide left margin for the label column) reads slightly more spread out
  than `source.png`'s tighter crop — a byproduct of the uniform-offset
  extraction (no scaling applied, per the task's "invention not"
  constraint) rather than a deliberate layout choice. Topology, relative
  positions, colors, icons, and text are otherwise a 1:1 match, verified
  by a side-by-side crop comparison at matched heights.

Rendered headless-Chrome 2x device scale (`final-reproduce.png`), looked
at directly and against a side-by-side crop of `source.png` at every
iteration (4 render passes: initial layout, `fill-rule` fix for the
hollow EC2-chip glyph + RDS rings, connector-color correction, AZ-label
repositioning for `rules-lint`'s T2-lite check) — not just SVG-source
read-through.
