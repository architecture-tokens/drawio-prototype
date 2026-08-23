# Diagram rules check — 1-cloud-web-app

Genre: cloud 3-tier/SaaS, orthogonal box layout. Per the task brief, all
connector rules (1-12) and all box rules (B1-B10) apply, not just the
"universal" subset. Verified against three rendered iterations of
`final.svg` -> `final.png` (headless Chrome, 2x device scale) — two real
violations were found and fixed during that process (see below).

## Connectors

1. **Exit toward target, most direct path.** PASS. `user->route53` is a
   same-row straight shot; the CDN chain (`cdn->static-assets->s3`) is a
   straight vertical column; every LB/ASG hop is a minimal-bend elbow.
2. **Anchor at edge midpoint; distribute when a face is shared.** PASS.
   `user`'s bottom edge carries two outgoing edges (to `cdn`, to `web-elb`),
   offset to x=320/x=380 either side of its center (x=350) instead of both
   sitting at the exact midpoint.
3. **Orthogonal polylines only.** PASS. Every connector is a `<polyline>`
   with axis-aligned segments; no bezier curves anywhere.
4. **Arrowhead follows the final segment.** PASS, checked edge by edge —
   every arrowhead's approach direction matches its box's entry edge
   (down into every top edge, right into `route53`/`rds-slave`).
5. **Land clear of badges/labels.** N/A — no number badges in this diagram.
6. **Leave whitespace around boxes a line doesn't connect to.** PASS,
   after a fix: the first render had the `web-instance->app-elb` and
   `app-instance->rds-master` merge buses running immediately along the
   Autoscaling Group container's dashed bottom border (10px clearance).
   Re-centered both buses in their 40px gap (20px clear of the container
   above, 20px clear of the target box below).
7. **Uniform arrowhead size, decoupled from stroke width.** PASS. One
   marker geometry (`0 0 10 10` viewBox, `9x9` fixed size,
   `markerUnits="userSpaceOnUse"`) reused per domain color.
8. **Uniform connector stroke-width.** PASS. Every connector is
   `stroke-width="1.5"`; box borders are a separate `2.5` (rule 12's note:
   line clearly thinner than a box border).
9. **Arrowhead tip lands exactly on the edge.** PASS. `refX="10"` on the
   `0 0 10 10` marker viewBox puts the tip (not the base) at the line
   endpoint, which is always set to the target box's exact edge coordinate.
10. **Solid by default; dashed only with real meaning.** PASS. Only
    `rds-master->rds-slave` (Cross-AZ Replication) is dashed — a genuinely
    different kind of edge (async replication, not a request path). All 21
    other connectors are solid.
11. **Converging same-direction edges merge to one trunk/one arrowhead.**
    PASS for both real convergence points: the 4 web instances into
    `app-elb`, and the 4 app instances into `rds-master` — each renders as
    4 risers -> 1 shared horizontal bus -> 1 trunk -> 1 arrowhead. The
    *diverging* fans (`web-elb`->4 instances, `app-elb`->4 instances) are
    correctly left as 4 separate arrowheads since rule 11 only mandates
    merging on convergence, not divergence.
12. **Edge label never struck by its line.** PASS, after a fix: the first
    render had "DNS lookup" overlapping the `user->route53` line and
    `route53`'s corner, and "Cross-AZ Replication" struck by the
    `app-instance->rds-master` merge bus. Moved "DNS lookup" above both
    boxes (row-0 margin, y=30) and moved "Cross-AZ Replication" into the
    open canvas to the right of `rds-slave`.

## Boxes

B1. **Quantized height, shared width per peer group.** PASS. All 15 leaf
    boxes share one size (140x60, single-line centered title). Both ASG
    containers share one formula-derived size (740x120 = 30 top pad + 60
    child row + 30 bottom pad).
B2. **One uniform gap.** PASS. 40 used for every gap in the diagram: row
    spacing, lane spacing, sibling-instance spacing, and the `User`/
    `Route 53` pair — checked exhaustively, no other value appears.
B3. **Shared grid; connector-axis alignment.** PASS. Both ASG's four child
    columns sit at the identical x-positions (250/430/610/790), so `Web N`
    and `App N` line up vertically tier-to-tier. `Web ELB`/`App ELB` and
    the RDS pair share one grid center (x=590 and x=500/610 respectively).
B4. **Uniform border weight.** PASS. Every box (leaf, container, legend
    swatch) uses `stroke-width="2.5"` — confirmed by grep, no stray value.
B5. **Labels never overlap a box.** PASS, after the same two label fixes
    as connector rule 12.
B6. **Consistent internal layout.** PASS. Every leaf box = centered
    title only (no badge, no body). Both containers = left-aligned title
    above a child row, applied identically to both.
B7. **Shared text margins, even padding.** PASS. Leaf box text is centered
    with equal padding on all sides; both container titles sit at the same
    8px left inset from their box's left edge.
B8. **Compress empty space.** PASS. Containers are sized to their true
    content (120, not the earlier 140 that left 20px of dead padding once
    the title moved outside); canvas trimmed to 780 tall to match. The
    CDN/storage lane (3 boxes, ends y=400) is shorter than the compute
    lane (continues to y=720) — inherent to the two paths having different
    hop counts (the source diagram has this same asymmetry), not padding.
B9. **Nested box centered, equal margins.** PASS. Both axes checked for
    both containers: horizontal margin 30/30 (250-220 vs 960-930),
    vertical margin 30/30 (270-240 vs 360-330; same pattern for app-asg).
B10. **Nested box never touches container border.** PASS. 30px clearance
     on every side for all 8 compute-instance boxes inside their ASG.

## Colors

C1. **One documented palette in a comment block.** PASS. Six-domain table
    (actor/ingress/routing/compute/storage/database) at the top of
    `final.svg`, each with border/fill/text/light-on-dark tints.
C2. **Color by meaning; arrow = destination's domain.** PASS, checked
    every one of the 22 connectors against its destination component's
    domain color (e.g. `app-instance->rds-master` is blue/database because
    it leads into the database, not orange for its compute-domain source).
C3. **Neutral only for raw/no-meaning content.** PASS. `#4B5563` (neutral
    grey) is used only for the legend's meta captions ("Legend", the two
    footnote lines) — never on a diagram element.
C4. **Judge by palette membership, not mere visual contrast.** PASS.
    Routing (amber `#B7791F`) and compute (orange `#C2410C`) are visually
    adjacent hues but documented as two distinct, intentional domains
    (traffic distribution vs. execution) — not an accidental near-clash.
C5. **Documented meaning matches usage.** PASS, checked each domain's
    palette description against every element actually painted with it.

## Text

T1. **No text overlaps.** PASS, after the same connector-rule-12 fixes
    (which were simultaneously T1 violations) plus one more: the ASG
    container title originally sat inside the top padding at the same
    y-band as the fan-out bus, striking through "Autoscaling" — moved the
    title above the bus entirely (y=214/y=474, both above the y=220/y=480
    bus lines) so it's vertically clear regardless of horizontal extent.
T2. **Text stays within box padding.** PASS. Longest leaf label ("Amazon
    Route 53", 16 chars) fits inside the 140px box with visible margin at
    13px Arial; verified visually in the render, no clipping/overflow.
T3. **Title-only centered; body-content left-aligned.** PASS. All 15 leaf
    boxes are title-only -> centered (T3's default). Both ASG containers
    have body content (their 4 children) -> title left-aligned, not
    centered.

## Verification

Rendered `final.svg` -> `final.png` via headless Chrome at 2x device
scale after every edit (4 render passes total). Cropped and visually
inspected the specific regions changed each time — the container title
band, the DNS-lookup label, the Cross-AZ-Replication label, and both
merge-bus/container-border gaps — before moving to the next fix, per the
skill's "render, crop, look" verification rule.

## Summary

**30 PASS, 1 N/A, 0 FAIL.**
