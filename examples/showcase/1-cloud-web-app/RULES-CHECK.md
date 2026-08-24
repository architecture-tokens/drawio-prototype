# Diagram rules check — 1-cloud-web-app (bottom-up rework)

Genre: cloud 3-tier/SaaS, orthogonal box layout. Per the task brief, all
connector rules (1-12) and all box rules (B1-B10) apply, not just the
"universal" subset. This is a full re-check against the reworked
`final.svg` -> `final.png` (headless Chrome, 2x device scale) — flow
direction flipped back to bottom-up (matching the source), AWS icons
restored, and the two Availability-Zone bands + SSL padlock restored.
Verified against three rendered iterations; one real T1 violation was
found and fixed during that process (see below).

## Connectors

1. **Exit toward target, most direct path.** PASS. `user->route53` is a
   same-row straight shot; the CDN chain (`s3<-static-assets<-cdn`, now
   read bottom-up) is a straight vertical column; every LB/ASG hop is a
   minimal-bend elbow.
2. **Anchor at edge midpoint; distribute when a face is shared.** PASS.
   `user`'s top edge carries two outgoing edges (to `cdn`, to `web-elb`),
   offset to x=414/x=474 either side of its center (x=444) instead of both
   sitting at the exact midpoint.
3. **Orthogonal polylines only.** PASS. Every connector routes in
   axis-aligned horizontal/vertical segments; the single-segment straight
   connectors stay `<polyline>`, and the 10 connectors with a bend are now
   `<path>` (M/L/H/V plus the rule-3a corner arc — see below), never a
   smooth bezier route (the icon glyphs inside `<defs>`/`<symbol>` use
   curved `<path>`s, but none carry a marker — out of scope for this rule
   per its own text, and confirmed by rules-lint rule 4, which allows Q/A
   but still fails C/S).
   3a. **Uniform small corner-rounding radius.** PASS (rule adopted
   2026-08-24). All 10 bent connectors (20 bends total: the two SSL-badge
   edges, both diverging fan-out buses, both converging merge trunks) were
   converted from sharp `<polyline>` elbows to `<path>` with a 5-unit `Q`
   arc at every bend — one radius, uniform across the whole file (rules-lint
   rule 3a: 18 rounded connectors, 28 bends, radius 5, PASS). Verified
   visually at 2x-render zoom on four different bend shapes (a badge-run
   elbow, a diverging fan-out riser, a converging merge trunk, and a
   terminal arrowhead landing) — see `final.png`: every corner is smooth,
   every arrowhead still lands exactly on its box edge, no marker
   distortion. `final-reproduce.svg` is now ALSO converted, at this same
   5-unit radius (with 2 bends clamped smaller per rule 3a's clamp clause)
   — the reproduce-mode exemption recorded here in an earlier iteration of
   this file was REMOVED (owner decision 2026-08-24); see this file's
   "Reproduce mode" section below for that conversion's own check-by-check
   pass.
4. **Arrowhead follows the final segment.** PASS, checked edge by edge —
   flow reads bottom-up (`infra:presentation.flow.direction = up`, now
   view.yaml's top-level `flow.direction`, not a model.yaml token on
   `user` — see README.md "View layer (view.yaml)"), and every arrowhead's
   approach direction matches: up into
   every box one tier above it (`cdn`, `web-elb`, both ELBs' targets, both
   instance tiers' targets, `rds-master`), right into `rds-slave`, right
   into `route53`.
5. **Land clear of badges/labels.** N/A — no number badges in this
   diagram.
6. **Leave whitespace around boxes a line doesn't connect to.** PASS. Both
   merge buses (`web-instance->app-elb` at y=380, `app-instance->rds-master`
   at y=120) sit centered in their 40px gap (20px clear of the box above,
   20px clear of the box below). The two diverging fan-out buses (y=540,
   y=280) are the same. The AZ-band corridor (see Boxes B2 below) gives
   both ELBs >=20px clearance from the nearest band edge on both sides —
   this is the same rule 6 clearance requirement, now also checked against
   the two new band rectangles, not just the ASG containers.
7. **Uniform arrowhead size, decoupled from stroke width.** PASS. One
   marker geometry (`0 0 10 10` viewBox, `9x9` fixed size,
   `markerUnits="userSpaceOnUse"`) reused per domain color (rules-lint
   rule 7: 6 markers, all pass).
8. **Uniform connector stroke-width.** PASS. All 26 connectors are
   `stroke-width="1.5"` (visually confirmed and inherited from the shared
   `<g fill="none" stroke-width="1.5">` wrapper; rules-lint rule 8 itself
   Coverage note resolved 2026-08-24: rule 8 scans `<polyline>`/`<line>` AND marker-ended `<path>` connectors, so the rule-3a rounded paths stay inside its uniform-stroke-width guarantee.
9. **Arrowhead tip lands exactly on the edge.** PASS (rules-lint rule 9:
   6/6 markers verified `refX` == tip x).
10. **Solid by default; dashed only with real meaning.** PASS, now with
    **two** documented dashed classes instead of one: `rds-master->rds-slave`
    (Cross-AZ Replication — async replication, not a request path) and
    every container/band boundary (both Autoscaling Group containers, both
    AZ bands — dashed marks "grouping boundary", never a real connector).
    Both classes are named in the C1 palette comment (rules-lint rule 10
    only requires the word "dash" appear somewhere in a comment; this file
    documents both classes explicitly, going beyond the mechanical bar).
11. **Converging same-direction edges merge to one trunk/one arrowhead.**
    PASS for both real convergence points: the 4 web instances into
    `app-elb`, and the 4 app instances into `rds-master` — each renders as
    4 risers -> 1 shared horizontal bus -> 1 trunk -> 1 arrowhead. The
    _diverging_ fans (`web-elb`->4 instances, `app-elb`->4 instances) are
    correctly left as 4 separate arrowheads.
12. **Edge label never struck by its line, and neither is an edge icon.**
    PASS. "DNS lookup" sits below the `user`/`route53` row (y=734, 10px
    clear of both boxes' bottom edge at 720), mirroring the source's own
    user<->route53 pairing. "Cross-AZ Replication" sits to the right of
    `rds-slave` (x=859, clear of the dashed line at y=70 and of the
    relocated legend, which is far below at y>=606). The two new SSL
    padlock glyphs use the masking-background variant of this rule (a
    white disc behind the glyph) instead of an offset, since an icon
    (unlike text) reading as a badge clipped onto the wire is the correct
    visual idiom here, matching the source.

## Boxes

B1. **Quantized height, shared width per peer group.** PASS. All 17 leaf
boxes share one size (140x60, single-line centered title + one
nine-grid-anchored icon). Both ASG containers share one formula-derived
size (928x120 = 30 top pad + 60 child row + 30 bottom pad); the width grew
from 740 to 928 (see B2) but both containers still match each other
exactly.
B2. **One uniform gap** — with one documented, load-bearing exception.
PASS for every row/lane/sibling-instance gap: 40px, checked exhaustively
(rules-lint B2-lite confirms exactly one gap value, 40, across all
stacked-sibling pairs it can see). The **AZ-band-to-ELB corridor is a
deliberate, documented exception**: `web-instance-2`/`app-instance-2`'s
band (`Availability Zone A`) ends at x=594 and each ELB starts at x=614 —
20px, not 40 — because that clearance is measured off the **band** edge
(itself inset 24px inside the ASG container's 30px margin), not off a
sibling box; the ELB-to-ELB-tier "row" gap itself is still the standard
40px everywhere it applies. This mirrors the source, which also opens a
wider, non-uniform gap (450-525) around its own shared ELB icon for the
same structural reason — see README "What the layout improved over the
source".
B3. **Shared grid; connector-axis alignment.** PASS. Both ASGs' four
child columns sit at the identical x-positions (250/430/798/978), so
`Web N` and `App N` line up vertically tier-to-tier — unchanged property,
just at new x-values after the corridor widened the container. `Web
ELB`/`App ELB` and the RDS pair share one grid center (x=684 and
x=594/704 respectively, both centered on the same corridor).
B4. **Uniform border weight.** PASS (rules-lint B4, after one fix — see
"Verification" below). Every leaf box, every legend swatch, and both ASG
containers use `stroke-width="2.5"`. The two AZ bands use `1.5` — allowed
as their own consistent, documented class (rule text explicitly permits a
distinct class for structural containers when applied consistently); the
legend's new "Availability Zone (structure)" swatch was initially given
the band's real `1.5` instead of the legend's own uniform `2.5` and
rules-lint caught it (`FAIL: leaf-node rects use 2 different border
stroke-widths`) — fixed by matching the other 5 legend swatches at `2.5`
(the swatch's `stroke-dasharray` already signals "this one is dashed";
its border weight doesn't also need to match the real element's).
B5. **Labels never overlap a box.** PASS after one real fix — see
"Verification".
B6. **Consistent internal layout.** PASS. Every leaf box = centered title

- one nine-grid icon, same rule (source-derived position, T1-bumped where
  needed) applied identically across all 17. Both containers = left-aligned
  title above a child row, applied identically to both.
  B7. **Shared text margins, even padding.** PASS. Leaf box text is centered
  with equal padding on all sides; both container titles sit at the same
  8px left inset from their box's left edge.
  B8. **Compress empty space.** PASS. Containers are sized to their true
  content (120 tall, 30px top/bottom padding); canvas trimmed to 800 tall.
  The two lanes (CDN/storage: 3 boxes; compute: 2 tiers + RDS) still have
  different heights — inherent to the source's own asymmetry, not padding.
  B9. **Nested box centered, equal margins.** PASS. Both axes checked for
  both containers: horizontal margin 30/30 per instance pair (e.g.
  250-220=30, 1148-1118=30), vertical margin 30/30 (both containers,
  unchanged from the original design, just at new y-values).
  B10. **A nested box never overlaps its container's border.** PASS for the
  true nesting case (30px clearance, all 8 compute-instance boxes inside
  their ASG, unchanged). For the new AZ bands — which cross rather than
  nest — the equivalent check is "the band's own stroke is never coincident
  with a box or container stroke it crosses": bands are inset 24px around
  their 2 instances (vs. the container's 30px, so 6px inside, never
  touching) and extend 20px **past** each ASG container's top/bottom edge
  (vs. the source's own flush placement) specifically so the band and
  container strokes never run along the same line. Verified visually
  (render -> crop -> look at both ends of both bands).

## Colors

C1. **One documented palette in a comment block.** PASS (rules-lint C1:
22 colors documented, all 22 used fill/stroke hexes covered). Extended
from the original six-domain table with a **STRUCTURE** entry (neutral,
example-4 style, for the AZ bands) and an **ICONS** section mapping each
`presentation:icon` value to the domain hex it reuses — added to the
_same_ comment block as the original palette (rules-lint's C1 check keys
off the single comment with the most hex values; a separate ICONS comment
would not have been picked up).
C2. **Color by meaning; arrow = destination's domain.** PASS, checked
every one of the 26 connectors against its destination component's
domain color — unchanged logic from the original design, re-verified
against the new coordinates and the two new padlock badges (neutral, not
a domain arrow).
C3. **Neutral only for raw/no-meaning content.** PASS, with the neutral
palette's documented scope **widened** (and the comment updated to match,
not left stale — see C5): `#4B5563` now also covers the Static Assets and
SSL-padlock icon glyphs (both intentionally outside the six domains — no
single AWS-family hue fits a generic cube/lock), and `#94A3B8`/`#5B6B82`
(STRUCTURE) cover the AZ bands and their labels. Every other domain color
is still confined to its own domain's elements.
C4. **Judge by palette membership, not mere visual contrast.** PASS.
Routing (amber) and compute (orange) remain visually adjacent but
documented as two distinct, intentional domains; STRUCTURE's grey-blue
sits close to neutral grey but is a separate, documented entry (two shades
serving two different jobs: pure "no meaning" vs. "this is a structural
boundary").
C5. **Documented meaning matches usage.** PASS — the original C1 comment's
claim "neutral is reserved for the legend caption only" was **corrected**
in this rework (it is no longer true: neutral now also colors two icon
glyphs), rather than left to drift from what the file actually does.

## Text

T1. **No text overlaps.** PASS, after one real fix found during
verification: the first render placed both rotated AZ-band labels
("Availability Zone A"/"B") directly behind the Autoscaling Group
container fill at their original y-center (330), and separately the very
first coordinate draft had them colliding with the "Web Tier Autoscaling
Group" title text at that same y. Fixed in two steps — moved the label's
y-center to 245 (clear of both container titles by >=60px) and moved the
label `<text>` elements to the end of the file so they draw _after_ the
opaque container fill instead of being partially painted over by it.
Re-rendered and visually confirmed both labels are fully legible, clear of
every title and every connector (rules-lint's T1 is render-dependent /
NOT-CHECKABLE, so this was confirmed by cropping the rendered PNG and
looking, not just re-reading the SVG source).
T2. **Text stays within box padding.** PASS. Longest leaf label ("Amazon
Route 53", 16 chars) fits inside the 140px box with visible margin at 13px
Arial; the added icons sit in a different row/edge of the box from the
title in all 17 cases (top-center icon vs. vertically-centered title, or
middle-left/right icon vs. horizontally-centered title) — verified
visually, including two close-up crops (Route 53's top-right shield vs.
its long title, Static Assets' top-right cube vs. its title) that confirm
no glyph-level overlap despite tight horizontal margins on the long
labels.
T3. **Title-only centered; body-content left-aligned.** PASS. All 17 leaf
boxes are title-only -> centered (T3's default); the added icon is
anchor-positioned independently of the centered title, not part of the
"title" content itself. Both ASG containers have body content (their 4
children) -> title left-aligned, not centered. The two AZ-band labels are
boundary/structure captions, not node titles — T3 doesn't govern them
directly; they follow the same left/edge-anchored convention as the ASG
container titles (rotated instead of horizontal only because the source
itself needed rotation for the same space reason: a narrow 24px margin
channel, verified as the one part of each band clear of every connector
regardless of y).

## Verification

Rendered `final.svg` -> `final.png` via headless Chrome at 2x device scale
after every edit (4 render passes total across this rework). Two real
issues were found and fixed this way, not by re-reading source:

1. **T1**: rotated AZ-band labels behind opaque container fill / colliding
   with a container title (see Text T1 above) — fixed by repositioning and
   reordering.
2. **B4**: legend's new AZ-structure swatch used the band's own
   `stroke-width="1.5"` instead of the legend's uniform `2.5` — caught by
   `node tools/rules-lint.mjs final.svg` (not visual), fixed by matching
   the other 5 swatches.

Also cropped and visually inspected: the Route 53 / padlock / User row
(icon-vs-long-title clearance, padlock-as-badge-on-the-wire), the Static
Assets box (icon-vs-title clearance), the RDS Master/Slave pair (icon
clearance, dashed replication edge, converging bus entry), and both AZ
bands end-to-end (title clearance, connector clearance, corridor gap to
both ELBs) — per the skill's "render, crop, look" verification rule.

**Rule 3a pass (2026-08-24):** re-rendered `final.svg` -> `final.png` after
converting all 18 bent connectors to rounded `<path>`s, then cropped and
looked at four distinct bend shapes at 2-3x zoom: the padlock-badge elbow
(User -> CDN/Web ELB), a diverging fan-out riser (App ELB -> App
instances), a converging merge-trunk bend (App instances -> App ELB), and
a terminal arrowhead landing (App ELB -> App 1). All four are smooth,
uniform-radius corners with the arrowhead still landing exactly on the box
edge — no marker distortion, no overshoot into the box.

## Summary

**32 PASS, 0 FAIL, 1 N/A** (rule 5, no badges in this diagram — unchanged
from the previous iteration; +1 PASS vs. the previous iteration for the new
rule 3a). `node tools/rules-lint.mjs final.svg` exits 0 (11 PASS / 0 FAIL /
22 NOT-CHECKABLE or out-of-scope for the mechanical subset it can evaluate
— rule 3a confirms all 18 rounded connectors / 28 bends share one 5-unit
radius, while `VISUAL_TOPOLOGY` confirms 52 straight connector legs have
no unintended crossing or invalid T-junction; the render-dependent and semantic-judgement rules
above were checked manually per the table).

---

# Diagram rules check — 1-cloud-web-app (reproduce mode, `final-reproduce.svg`)

Per `examples/showcase/README.md`'s "Conversion modes": in `reproduce`
mode, "Diagram rules act only as a defect lint; a clean source gets zero
visual edits." This section checks `final-reproduce.svg` against the same
rule set the restyle pass above used, and records where a rule's
_static-check machinery_ doesn't apply the way it does for a re-authored
layout — not because the reproduction is sloppier, but because several
rules (B1's shared-size quantization, B2's single uniform gap) are
explicitly about layout the AUTHOR chose, and this file's layout is
extracted, not chosen.

## Connectors

Mechanically re-verified by `node tools/rules-lint.mjs final-reproduce.svg`
(see "Verification" below for the exact run): rules 4/7/8/9/10 all PASS —
one marker (`#505863`, matching every single edge color in `source.xml` —
grepped, confirmed no other edge stroke color exists), every connector
uses `stroke-width="1.5"`, one dashed class (RDS replication + the two
Availability-Zone/Autoscaling-Group band borders — rule 10 requires the
word "dash" appear in a documenting comment; the palette comment does).

**3a PASS (reproduce-mode exemption REMOVED, owner decision 2026-08-24:
corner-rounding is line treatment, not content, so rule 3a is now
normative in BOTH conversion modes — the earlier "reproduce follows the
source's own corner treatment" exemption recorded below no longer
applies).** `source.xml`'s connectors are all sharp-cornered, so
`final-reproduce.svg` was converted with `tools/round-connectors.mjs`
(promoted from a scratchpad script to a checked-in tool by this same
task) at the diagram's uniform radius, 5 — matching `final.svg`'s restyle
pass exactly, per the amended rule's "one radius for the whole diagram"
requirement spanning both modes. The initial pass only rounded the two
SSL-badge paths: it missed 16 visible fan elbows because each was encoded
as two separate one-segment polylines meeting at a shared bus. The revised
SVG keeps separate elements only at true T-junctions and expresses each
turn as one rounded path. `user->cdn`'s bends get the full 5-unit radius,
but `user->web-elb` has a genuine
micro-jog in the extracted geometry (`259.5,697.5 -> 259.5,692`, a
5.5-unit vertical leg, under 2x5=10), so rule 3a's clamp clause applies to
BOTH of that bend pair: r_eff = min(5, 5.5/2) = 2.75 at each, not the
diagram's full 5. `rules-lint` accepts this mechanically as PASS, not
FAIL, and reports the clamp count in its message (`node
tools/rules-lint.mjs final-reproduce.svg`: `3a: 18 rounded connector(s), 21
bend(s) total, all one uniform radius 5, 2 bend(s) clamped below 5 for a
short adjacent segment (rule 3a clamp clause)`) — the clamp is accepted
because rule 3a's own text ties it to a mechanical constraint (an
adjacent segment under 2x the uniform radius), not a second declared
radius, and `rules-lint`'s check reconstructs that original 5.5-unit leg
from the rounded path's own geometry to verify the clamp is exact, not
merely "some smaller number."

Re-rendered `final-reproduce.png` in headless Chrome at 2x and compared a
1200x1050 crop before/after. All four fan regions now visibly ease through
their 90-degree turns; buses remain straight, genuine T-junctions remain
T-junctions, shared trunks do not double in weight, and every arrowhead
still lands on the same box edge. The SSL badge routes remain clean and
their mechanically clamped micro-jog remains hidden under the badge mask.
The user-to-CDN leg is also restored to `y=626`, below the web fan bus at
`y=593`: the two false lower-left crossings created by the earlier
`y=560` extraction are gone, matching source edge 38's explicit `y=760`
control point after the diagram's `-134` y translation.

Rules 1/2/3/5/6/11/12 are the render-dependent/semantic-judgement ones
`rules-lint` marks NOT-CHECKABLE for every file (restyle included);
checked here the same way restyle's check documents (render → crop →
look): every connector routes in axis-aligned horizontal/vertical
segments (rule 3) — straight trunks stay `<polyline>` while all 18 bent
connectors are rounded `<path>`s per rule 3a above, never a smooth
bezier route. Converging fans (4
instances → 1 LB/RDS, rule 11) merge to one shared bus + one trunk + one
arrowhead, diverging fans (1 LB → 4 instances) stay as 4 separate
arrowheads — exactly `source.png`'s own visual idiom, extracted rather
than re-derived.

## Boxes

**B1 (quantized/shared size) does not apply as a defect-lint the way it
does to a re-authored layout, and that is the reproduce-mode point, not
an exemption from anything.** Source deliberately uses _different_ sizes
per resource family — 55×58 EC2-instance chips, 57×69 S3, 69×69
CloudFront/RDS/Static-Resources, 69×72 ELB, 525×75 Autoscaling-Group
bands, 225×356 Availability-Zone bands — because each glyph's own AWS
artwork has a different natural aspect ratio; forcing one uniform leaf
size (as the restyle above correctly does for ITS OWN invented layout)
would mean redrawing the source's own icons at the wrong proportions,
which is a fidelity loss B1 exists to prevent elsewhere, not one it's
asking for here. **This is the one documented, disclosed exemption for
reproduce mode** — recorded here per the task brief ("If a Diagram-rules
static check conflicts with faithful reproduction... document the
exemption... under a 'reproduce mode' section"). `rules-lint.mjs`'s B1
check is itself `NOT-CHECKABLE` for every file regardless (its own
comment: "needs semantic/typographic judgement beyond mechanical SVG
inspection") — so no code gate needed changing; this is a documentation
exemption, not a code exemption.

B2/B2-lite: source's own inter-tier gaps are NOT uniform (76px RDS↔ASG,
70/81/126px around the two ELBs) — same reasoning as B1, extracted not
chosen. `rules-lint`'s mechanical B2-lite check reports "no
vertically-stacked sibling leaf rects found" (NOT a FAIL) because the 4
leaf-node rects it can classify (the 4 crossing bands) don't share both
x and width with each other by construction (crossing, not stacked) — it
correctly has nothing to flag, not a false pass.

B4 (uniform border weight): PASS, mechanically verified — all 4
classified leaf-node rects (`az-band-a`, `az-band-b`, `app-asg`,
`web-asg`) share `stroke-width="2"`.

B3/B5–B10: render-dependent/semantic, `NOT-CHECKABLE` by the tool for
every file; visually verified (render → crop → look, 4 iterations) —
shared connector-axis alignment across both tiers (rule 3, matches
source's own vertical alignment of instance columns), no label overlaps
a box, the two crossing bands never visually merge or obscure each
other's stroke, both container titles ("Auto"/"Scaling") sit centered in
their badge's own space.

## Colors

**C1** — mechanically PASS (`rules-lint.mjs`): 22 documented palette
colors cover all 13 used fill/stroke hex values (after 2 real fixes found
during iteration — see "Verification"). **C2** (arrow = destination
domain) is explicitly **not applied** here: `source.xml` uses one neutral
connector color (`#505863`) for every edge, including the two edges that
carry the `security.encryption.in-transit` token — the C2 convention
belongs to `final.svg`'s restyle (a Diagram-rules authoring choice for a
re-layout), and applying it to a faithful reproduction would be exactly
the kind of unrequested visual edit the conversion-modes contract
forbids. This is the second reproduce-mode exemption, and — like B1 — a
documentation call, not a code change (`rules-lint`'s C2 check is itself
`NOT-CHECKABLE` for every file).

C3/C4/C5: `NOT-CHECKABLE` (semantic-judgement, tool-wide); domain hues
reused unchanged from `source.xml`'s own `fillColor`/`gradientColor`
pairs (verified against the raw XML, not approximated).

## Text

T1: `NOT-CHECKABLE` (render-dependent); visually verified — no label
overlaps a box or a connector, both rotated Availability-Zone labels
clear their crossing Autoscaling-Group bands' fill.

**T2-lite: mechanically PASS**, after one real fix during iteration (see
"Verification") — both rotated AZ-band labels now sit inside their own
band's bbox (matching `final.svg`'s own convention: an inward inset from
the band's edge, not an outward one) and are emitted immediately after
their own band's `<rect>` (not both rects then both texts), so
`rules-lint`'s `previousRectSibling` pairing binds each label to the
correct band.

T3: `NOT-CHECKABLE` (semantic); the 8 icon-square nodes' labels sit
OUTSIDE the box (left or right, per `source.xml`'s own
`align`/`labelPosition` style attribute on each — see the model's own
per-component table), matching source's own convention exactly; this
diagram has no node with body content requiring left-alignment (T3's
other branch), since every "container" here (the two crossing bands) is
drawn as a boundary/structure label, not a titled box with children
inside it the way the restyle's Autoscaling-Group containers are.

## Verification

Rendered `final-reproduce.svg` → `final-reproduce.png` via headless
Chrome at 2x device scale, 4 render passes, cropped and looked at each
time (not just re-reading the SVG source) — plus a side-by-side crop
comparison against `source.png` at matched heights, the actual fidelity
target:

1. **Real bug, official-icon integration**: the EC2-instance chip
   rendered as a SOLID filled square with no hollow center — no "M4"/"C3"
   text was visible at all. Root cause: the official SVG's hollow center
   depends on `fill-rule="evenodd"`, set on the _wrapping_ `<g>` in every
   fetched official file, not on the `<path>` itself — dropped when only
   the bare `<path d="...">` was copied into this file's `<symbol>`
   elements. Fixed by adding `fill-rule="evenodd"` to all 9 official-icon
   `<symbol>` tags (also fixes the RDS cylinder's ring detail, which
   depends on the same mechanism).
2. **Real bug, fidelity**: connectors were initially colored per
   destination domain (`final.svg`'s restyle-only C2 convention),
   contradicting `source.xml`'s own uniform `#505863` on every edge —
   caught by a side-by-side crop comparison against `source.png`, not by
   `rules-lint` (C2 is `NOT-CHECKABLE` there). Fixed; see "Colors" above.
3. **Real bug, layout**: left-side node labels ("CloudFront CDN",
   "Static Resources") were clipped by the SVG's own `viewBox` — the
   initial 20px left margin wasn't enough for the widest label. Fixed by
   widening the `viewBox`'s left margin to 150px.
4. **Real bug, `rules-lint` T2-lite FAIL**: both AZ-band labels were
   positioned outside their band (matching neither band's bbox) and
   emitted as a rect/rect/text/text run instead of interleaved
   rect/text/rect/text, so `previousRectSibling` paired both labels with
   the SAME (wrong) band. Fixed; see "Text" above.
5. **Real bug, `rules-lint` C1/UNKNOWN_ICON_SYMBOL/VIEW_REF_UNRESOLVED
   FAIL**: the hand-drawn `static-assets` fallback symbol was named
   `icon-static-assets-cube` instead of the `icon-<id-with-dots-as-dashes>`
   convention `UNKNOWN_ICON_SYMBOL` requires (`icon-aws-static-assets`
   for `view-reproduce.yaml`'s `aws.static-assets`); and the 4 now-unused
   domain-colored arrow markers (left over from bug #2's original,
   incorrect C2-style coloring) were still documented in a comment but
   left their hex values in the file, undocumented once C2 was removed.
   Fixed both; renamed the symbol id, deleted the unused markers, and
   added the 4 label-text `fontColor` hexes the C1 comment had missed.

## Summary

**`node tools/rules-lint.mjs final-reproduce.svg --full --model model.yaml --view view-reproduce.yaml --census census.yaml --layout layout-reproduce.json` exits 0**: 15 PASS, 0 FAIL, 1 WARN (unused decorative `<symbol>`, non-blocking), 23 NOT-CHECKABLE. Rule 3a reports 18 rounded connectors / 21 bends, including the 16 fan elbows missed by the first visual pass; `VISUAL_TOPOLOGY` checks 46 exact straight legs and reports no unintended crossing or invalid T-junction. Two documented, disclosed reproduce-mode exemptions remain (B1's size quantization, C2's arrow-color-by-domain) — both are documentation-only calls; no `rules-lint.mjs` code changed to accommodate either, since both checks are already `NOT-CHECKABLE` for every file regardless of mode.
