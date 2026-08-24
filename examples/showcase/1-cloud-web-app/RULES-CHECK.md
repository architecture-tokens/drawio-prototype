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
3. **Orthogonal polylines only.** PASS. Every connector is a `<polyline>`
   with axis-aligned segments; no bezier curves anywhere (the icon glyphs
   inside `<defs>`/`<symbol>` use curved `<path>`s, but none carry a
   marker — out of scope for this rule per its own text, and confirmed by
   rules-lint rule 4).
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
   `stroke-width="1.5"` (rules-lint rule 8); box borders are a separate
   `2.5`.
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

## Summary

**31 PASS, 0 FAIL, 1 N/A** (rule 5, no badges in this diagram — unchanged
from the previous iteration). `node tools/rules-lint.mjs final.svg` exits
0 (9 PASS / 0 FAIL / 22 NOT-CHECKABLE or out-of-scope for the mechanical
subset it can evaluate; the render-dependent and semantic-judgement rules
above were checked manually per the table).
