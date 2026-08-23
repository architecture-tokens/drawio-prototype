# RULES-CHECK — 5-event-pipeline

Evaluated against `/Users/pengxiao/.overnight-runs/architecture-tokens/2026-08-24-0620/diagram-rules.md`.
This is an orthogonal box-and-connector flowchart, so both connector tiers (universal 4-9/12, and
orthogonal-only 1-3/11), all ten Box rules, all five Color rules, and all three Text rules apply.

## Connectors

1. PASS — Producer/message/Channel each exit right-mid straight into the box directly ahead
   (targets sit on the same row). Channel exits right-mid toward all three consumers, which sit to
   its right (see rule 11 for how the three-target case is routed).
2. PASS with a documented rule-11 override — producer-message and message-channel each anchor at
   the plain midpoint (single edge per face, no deviation needed). Channel's three outgoing edges do
   **not** follow rule 2's "distribute evenly along the edge" default: all three leave from the exact
   same point (620,170). This is deliberate — see rule 11 below, the diagram's showcase rule.
3. PASS — every edge departs and arrives perpendicular to the box edge it touches (all horizontal
   at the connection point); departure and arrival mirror on every edge, verified in final.png.
4. PASS — every arrowhead follows its final segment's direction (all final segments are horizontal
   runs into a left edge, so all arrowheads point right; no kinked head).
5. N/A — no number badges or title decorations exist on any box to land clear of.
6. PASS — the two trunk risers (x=660, y 70-170 and y 170-270) pass through open canvas space; no
   connector grazes a box it doesn't terminate at.
7. PASS — one `<marker id="arrow">` def, `markerUnits="userSpaceOnUse"`, fixed `markerWidth`/
   `markerHeight="9"`, independent of the uniform stroke-width="1".
8. PASS — every `<polyline>` connector uses `stroke-width="1"`; box outlines are separately
   stroke-width 1.5 per B4 (rule 8 explicitly allows this split).
9. PASS — marker `viewBox="0 0 10 10"`, triangle `M0,0 L10,5 L0,10`, `refX="10"` (the tip), so the
   arrowhead tip lands exactly on the box edge, no overshoot.
10. PASS — every connector is solid; no dash is used anywhere (no second transition class exists
    in this diagram to distinguish).
11. PASS — **showcase rule.** The source (source.png / source.mmd) draws three separate curved
    lines from Channel to each Consumer. This diagram is the fan-OUT mirror of rule 11's stated
    fan-IN case: one source, three distinct destinations. A literal "one arrowhead" merge is
    impossible here (each consumer needs its own arrowhead), so the merge happens on the shared
    exit side instead: all three `channel-consumer-*` polylines start with the byte-identical
    segment `620,170 660,170`, so the overdrawn strokes render as one trunk line up to the bus
    point x=660, where each edge peels off toward its own consumer with its own arrowhead. This
    replaces what would otherwise be three near-parallel near-duplicate lines leaving Channel's
    right face at slightly different angles — the exact anti-pattern rule 11 forbids, applied here
    to the divergence side instead of the convergence side.
12. N/A — no edge carries a text label (the source has none either); nothing for a line to strike.

## Boxes

B1. PASS — height = top/bottom padding (20 each) + 1 line x line-height (20) = 60, applied
    identically to all 6 boxes (all single-line titles). Width = 140, uniform across all 6 boxes as
    one peer group, sized to the longest label ("Producer"/"Consumer", 8 chars) plus equal
    left/right padding (~38px each side at font-size 14).
B2. PASS — one horizontal gap (80) used between every column pair (Producer-message,
    message-Channel, Channel-Consumers); one vertical gap (40) used between every pair of stacked
    Consumer boxes. Each axis uses a single value throughout, never mixed.
B3. PASS — Producer, message, Channel and consumer-b all share centre-y=170, so their connectors
    run dead straight; consumer-a and consumer-c are the trunk's branch endpoints (rule 11), still
    grid-snapped to the same column and the same 40px vertical rhythm as consumer-b.
B4. PASS — every box border is `stroke-width="1.5"`, uniformly, with no per-box variation.
B5. N/A — no floating labels/pills/callouts exist in this diagram.
B6. PASS — all 6 boxes use the identical internal layout: one centered title, nothing else (no
    badge/body/action-hint slots exist to be inconsistent about).
B7. PASS — text is centered per T3 with equal padding on all sides (box sized to the height/width
    formula above), so margins are uniform by construction.
B8. PASS — canvas is 880x340, sized to content plus a uniform 40px margin on every side; no padded
    voids.
B9. N/A — no nested/contained boxes; the model has no containment (see README).
B10. N/A — same reason as B9.

## Colors

C1. PASS — one semantic palette (producer/message/channel/consumer) documented in the `<!-- -->`
    comment block at the top of final.svg, with border/background/text tints for each.
C2. PASS — every box is colored by its role; every connector is colored by its **destination**
    (producer-message = message-grey, message-channel = channel-violet, channel-consumer-* =
    consumer-green), and each arrowhead inherits its line's color via `fill="context-stroke"`.
C3. PASS — `message` (the in-flight payload, no state of its own) uses neutral grey per C3, the
    only element in the diagram that is genuinely "raw data" rather than a role/actor.
C4. PASS — Channel's violet sits next to Consumer's green in the layout, but both are correct
    per their own documented meaning, not an accidental off-palette clash.
C5. PASS — each color is used for exactly the role documented in the C1 comment block; no drift.

## Text

T1. PASS — no text elements overlap (verified in final.png at 2x).
T2. PASS — "Producer"/"Consumer" (longest labels) fit inside their 140-wide boxes with clear
    padding on all sides; no clipping or border-touching.
T3. PASS — all 6 nodes are title-only (no body content), so all are centered both horizontally and
    vertically per T3.

## Verification

Rendered via `headless Chrome --screenshot --force-device-scale-factor=2` at 880x340 -> final.png
(1760x680). Inspected the PNG directly: trunk merge reads as one line into a clean 3-way split,
arrowheads match their line colors, no overlap, no overflow. Clean on the first render — no
iteration was needed.

## Summary

25 PASS, 5 N/A, 0 FAIL.
