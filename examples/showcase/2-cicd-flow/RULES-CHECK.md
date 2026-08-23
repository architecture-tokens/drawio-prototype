# Rules check — 2-cicd-flow

Genre: pipeline flowchart, orthogonal box layout. Per diagram-rules.md Scope,
this genre is exactly the case both connector buckets (1-3/11 orthogonal-only,
4-9/12 universal) and all Box/Color/Text rules apply to — verified against
`final.png` (headless Chrome, 2x device scale) after each edit.

## Connectors

1. Exit toward target, most direct orthogonal route — PASS. Fan-out jobs
   exit their entry job's right edge (target is to the right); stage-handoff
   jobs exit their right edge toward the next lane.
2. Anchor at MIDDLE by default; distribute when a face carries >1 arrow —
   PASS. Single-arrow faces (all box arrivals, all stage-transition
   arrivals) anchor at the exact edge midpoint. The one 2-arrows-per-face
   case (each entry job's right edge, feeding two different children) is
   distributed evenly (y = 1/3 and 2/3 of the edge, not stacked at the
   midpoint) since the two arrows mean different things (rule 11's own
   converse).
3. Orthogonal polylines only, no curves — PASS. Every connector is a
   `<polyline>` with only horizontal/vertical segments.
4. Arrowhead follows the final segment, no kink — PASS. Every arrowhead's
   last segment is horizontal, arriving perpendicular into a left-facing
   box edge.
5. Land clear of badges/labels — N/A. No box carries a badge or number.
6. Leave whitespace around boxes a line merely passes by — PASS. The only
   crossings are a stage-transition connector passing perpendicularly
   through its own two containers' borders once each (necessary: the job
   is nested inside the container, the connector must leave it) — it does
   not run parallel to / hug either border.
7. All arrowheads one fixed absolute size, markerUnits="userSpaceOnUse" —
   PASS. Three markers (`arrow-build/test/deploy`), each `markerWidth`/
   `markerHeight`=9, `markerUnits="userSpaceOnUse"`.
8. Uniform connector stroke-width — PASS. Every `<polyline>` is
   `stroke-width="1"`, independent of the box border-width (2).
9. Arrowhead tip lands AT the edge, not overshooting — PASS. `refX="10"`
   on a `M0,0 L10,5 L0,10` triangle in a `0 0 10 10` viewBox = tip at the
   line endpoint, matching the rule's own worked example.
10. Solid by default; dashed only for real meaning — PASS. Solid for
    in-stage fan-out; dashed (`6,4`) only for the 4 stage-transition
    edges, applied to that whole class consistently (never as decoration).
11. Converging same-direction edges merge into one trunk, one arrowhead —
    PASS. build_a-test and build_b-test (and test_a-deploy/test_b-deploy)
    share one entry point and one final riser/approach coordinate, so
    their last segments coincide into a single trunk with a single
    arrowhead on the target job.
12. Edge label never struck by its line — N/A. No edge carries a text
    label in this diagram (matches the source, which also has none).

## Boxes

B1. Quantized height, shared width — PASS. All 9 job boxes: 130x60
(padding 19 + line-height 22 + padding 19 = 60, single title line).
B2. One uniform gap — PASS. One vertical gap (24, between stacked branch
jobs in every lane) and one horizontal gap (40, used both between a
lane's entry-job and branch-job columns AND between lanes) — a single
value per axis, not mixed.
B3. Shared grid; connected boxes aligned on the connector's axis — PASS.
All 3 stage containers share y=40, h=212. build_a (y-centre 110) and
test (y-centre 152) are NOT on the same row — but that's rule 11's
prescribed resolution, not a B3 miss: two source rows (build_a,
build_b) converge on one target row, so "both boxes on the same row"
is structurally impossible for either individual pair. The merged
trunk's final segment is what actually needs to be straight, and it
is: it targets the next stage's entry-job row exactly (y=152, the
same row build/test/deploy all share by B9's in-lane centring), so
the one line that actually enters the target box arrives dead
straight and perpendicular.
B4. One uniform border weight — PASS. Every box (container and job alike)
is `stroke-width="2"`; no exceptions.
B5. Floating labels never overlap a box — N/A. No floating labels/pills
exist; the only text is box titles living inside their own box.
B6. Consistent internal layout (badge/title/body/action) — N/A. Every box
carries a single centered title only (T3); there is no badge/body/
action sub-layout to keep consistent.
B7. Shared text margins, even padding — PASS. Title-only boxes are
centered (T3), so there's no left-margin rule to apply; padding is
even on all sides by construction (B1's height formula, symmetric
width fit).
B8. Compress empty space — PASS. Horizontal gap between lanes was
tightened from an initial 90 to the shared 40 (matching B2's "one
horizontal gap" requirement) once discovered — canvas shrank from
1328x292 to 1228x292 with no loss of legibility.
B9. Centre nested boxes in their container, equal margins — PASS. Each
lane's content block (300 wide) sits inside its 356-wide container
with 28px on both left and right (equal); this is the constrained/
centred axis since lanes are arranged as columns.
B10. Nested box never overlaps its container's border — PASS. 28px clear
margin on every side between a job box's stroke and its container's
stroke (verified in the rendered PNG, not just the numbers).

## Colors

C1. One documented semantic palette in the source — PASS. Comment block
at the top of final.svg documents all 3 stage colors (border/bg-lane/
bg-job/text) and states the C2 "colored by destination" convention.
C2. Color by meaning, arrows included, colored by destination — PASS.
Every job box is colored by its own stage; every connector is colored
by the stage its target belongs to (a stage-transition arrow is the
destination stage's color for its entire length, not a gradient).
C3. Neutral/ink reserved for meaningless content — PASS (by absence).
Every element in this diagram carries stage meaning, so no neutral
color is defined or needed — documented explicitly in the C1 comment
rather than left ambiguous.
C4. Judge by palette membership, not by contrast — PASS. The only
same-color-as-neighbour case (a build-colored fan-out arrow sitting
right next to the build-colored container border) is intentional:
same documented semantic (build), not an invented near-duplicate.
C5. Documented meaning stays in sync with usage — PASS. All 3 colors are
used exactly as documented (stage identity, no broader/narrower use
than the C1 comment states).

## Text

T1. No text overlaps other text — PASS. Stage titles sit in their own
title band above the job boxes; job titles sit centered in boxes with
24px+ clearance to every neighbour; verified visually in final.png.
T2. Text stays inside its box, no overflow — PASS. Longest label
(`deploy_a`/`deploy_b`, 8 chars) fits well inside 130px width at
15px/500-weight; verified visually.
T3. Center title-only text; left-align when there's body content — PASS.
Every box in this diagram is title-only, so every label is centered
both horizontally and vertically (`text-anchor="middle"`,
`dominant-baseline="central"`).

## Verification

Rendered via `headless Chrome --screenshot --force-device-scale-factor=2`
at the exact viewBox size (1228x292) after every geometry edit; inspected
the PNG directly (not just the SVG source) before and after tightening
the B2 gap, plus 2x cropped close-ups of the build-stage fan-out and of
BOTH stage-transition merge points (build→test and test→deploy) to
confirm arrowhead placement, merge-trunk shape, and border clearance at
pixel level.

**26 PASS, 4 N/A, 0 FAIL.** (Connectors: 10 PASS, 2 N/A [5, 12]. Boxes: 8
PASS, 2 N/A [B5, B6]. Colors: 5 PASS. Text: 3 PASS.)
