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
3. Orthogonal polylines only, no curves — PASS. Every connector routes in
   horizontal/vertical segments; single-segment straight connectors stay
   `<polyline>`, and the 10 connectors with a bend are `<path>` (M/L/H/V
   plus the rule-3a corner arc — see below), never a smooth bezier route.
   3a. Uniform small corner-rounding radius — PASS (rule adopted 2026-08-24).
   All 10 bent connectors (16 bends: the 6 fan-out elbows into
   build/test/deploy, and the 5+5 stage-transition merge legs) were
   converted from sharp `<polyline>` elbows to `<path>` with a 5-unit `Q`
   arc at every bend, one radius uniform across the file (`rules-lint`
   rule 3a: 10 rounded connectors, 16 bends, radius 5, PASS). Re-rendered
   and cropped a fan-out elbow and a stage-transition merge bend at 3x
   zoom: both smooth, arrowheads still land exactly on the box edge.
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
8. Uniform connector stroke-width — PASS. Every connector (`<polyline>` and
   the rule-3a `<path>`s alike) is `stroke-width="1"`, independent of the
   box border-width (2).Coverage note resolved 2026-08-24: rule 8 scans `<polyline>`/`<line>` AND marker-ended `<path>` connectors, so the rule-3a rounded paths stay inside its uniform-stroke-width guarantee.
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
pixel level. Re-rendered again after the rule-3a corner-rounding pass and
re-cropped the same two spots at 3x zoom: smooth corners, no arrowhead
distortion.

**27 PASS, 4 N/A, 0 FAIL.** (Connectors: 11 PASS [rule 3a added], 2 N/A
[5, 12]. Boxes: 8 PASS, 2 N/A [B5, B6]. Colors: 5 PASS. Text: 3 PASS.)
`node tools/rules-lint.mjs final.svg` exits 0.

---

# Diagram rules check — 2-cicd-flow (reproduce mode, `final-reproduce.svg`)

Per `examples/showcase/README.md`'s "Conversion modes": in `reproduce` mode,
"Diagram rules act only as a defect lint; a clean source gets zero visual
edits" beyond geometry extraction and orthogonal rule-3a connector rounding
(both normative in either mode). This section checks `final-reproduce.svg`
against the same rule set the restyle pass above used, following
1-cloud-web-app's own "Reproduce mode" section format, including where a
rule's static-check machinery doesn't apply the way it does to a
re-authored layout.

## Connectors

Mechanically re-verified by `node tools/rules-lint.mjs final-reproduce.svg`
(see "Verification" below for the exact run): rules 4/7/8/9/10 all PASS —
no marker-ended `<path>` uses a bezier C/S command, one marker
(`arrow-neutral`, `#333333`, matching every single edge color in
`source.mmd`'s own render — grepped `.marker{fill:#333333}` /
`.flowchart-link{stroke:#333333}`, confirmed no other edge color exists),
all 8 polyline/path connectors share `stroke-width="1"`, 6 dashed elements
(the 2 risers + 1 trunk per stage-transition × 2 transitions) documented
in a "dash" comment.

**3a PASS.** `source.mmd`'s own mermaid render draws every edge as a
smooth diagonal bezier curve (basis-spline, extracted control points in
`mermaid-render.svg`'s `data-points` attributes) — not copied, per
README.md's "Conversion modes" clause that rule 3/3a is normative in BOTH
modes. Every connector here was authored as an orthogonal `<polyline>`
between the extracted box-edge coordinates, then converted with
`tools/round-connectors.mjs final-reproduce.svg 5 --write` in a single
pass: `converted 10 bent polyline(s), left 2 single-segment polyline(s)
unchanged, 0 bend(s) clamped below radius 5`. `rules-lint` confirms: `3a:
10 rounded connector(s), 16 bend(s) total, all one uniform radius 5` — 0
clamps, unlike 1-cloud-web-app's 2 clamped bends, because every adjacent
leg here (the shortest is the 25px riser height, e.g. 113→70 = 43px, or
the 40-50px in-stage horizontal runs) comfortably exceeds 2×5=10.

Re-rendered `final-reproduce.png` (headless Chrome,
`--window-size=1045,268 --force-device-scale-factor=2`, matching the
SVG's own `viewBox`/`width`/`height`) and cropped two regions at 6×
device scale: the `build`→`build_a`/`build_b` fan-out elbow (smooth
corners, arrowhead lands exactly on `build_a`'s left edge, no
overshoot) and the `build_a`/`build_b`→`test` merge trunk (both dotted
risers bend smoothly into one shared dashed trunk with one arrowhead,
crossing both stage containers' borders cleanly with no hugging). Full
side-by-side comparison against `source.png` at matched framing:
same 3-lane structure, same fan-out/merge topology, same palette — the
only visible difference is orthogonal vs. diagonal connector routing,
which is the one documented, intentional deviation.

Rules 1/2/3/5/6/11/12 are the render-dependent/semantic-judgement ones
`rules-lint` marks NOT-CHECKABLE for every file; checked here the same
way the restyle pass above documents (render → crop → look, plus the
side-by-side source.png comparison above): every connector routes in
axis-aligned horizontal/vertical segments (rule 3) before rounding: 8
polylines/paths total, never a smooth bezier route. Each entry job's two
outgoing edges exit its right edge at 1/3 and 2/3 height (rule 2 — two
different destinations), converging fans (rule 11: both stage-transition
pairs) merge to one shared trunk + one arrowhead exactly as
`source.png`'s own visual idiom shows, extracted rather than re-derived.
No line hugs a box it doesn't connect to; the only border crossings are
each stage-transition connector's own two containers, necessarily, once
each (same accepted pattern as the restyle pass's rule 6 note).

## Boxes

**B1 (quantized/shared size) does not apply as a defect-lint the way it
does to a re-authored layout, and that is the reproduce-mode point, not
an exemption from anything — same precedent as 1-cloud-web-app's B1
note.** `source.mmd`'s mermaid render auto-sizes every job box to fit its
own label text (82×54 for `test` up to 120×54 for `deploy_b`); forcing
one shared box size (as the restyle pass above correctly does for its
OWN invented layout, 130×60 for all 9) would mean redrawing the source's
own auto-fit boxes at the wrong proportions — a fidelity loss, not a fix.
`rules-lint`'s B1 check is itself `NOT-CHECKABLE` for every file
regardless (semantic/typographic judgement) — documentation exemption
only, no code exemption needed.

B2/B2-lite: source's own per-lane internal gaps (riser-to-box clearance,
entry-to-parallel-column horizontal run) are extracted, not chosen — same
reasoning as B1. `rules-lint`'s mechanical B2-lite check reports "no
vertically-stacked sibling leaf rects found" (NOT a FAIL): the 9 job
rects don't share both x and width pairwise (each stage's 3 jobs differ
in width from every other stage's, by construction of the auto-fit
extraction) — correctly nothing to flag, not a false pass.

B4 (uniform border weight): PASS, mechanically verified — all 9
classified leaf-node (job) rects share `stroke-width="1"`; the 3
container rects are their own class (also uniform at `stroke-width="1"`,
correctly excluded from the leaf-node comparison by `rules-lint`).

B3/B5–B10: render-dependent/semantic, `NOT-CHECKABLE` by the tool for
every file; visually verified (render → crop → look) — all 3 job columns
within a stage share the same x per row (extracted, matching source's
own alignment), no label overlaps a box, no container border is crossed
by a job box (each job sits with visible margin inside its stage,
matching source), both stage-transition merge points read cleanly.

## Colors

**C1** — mechanically PASS (`rules-lint.mjs`): "palette comment documents
5 color(s); all 6 used fill/stroke hex color(s) are covered (modulo
white/canvas background)". **C2** (arrow colored by destination domain)
is explicitly **not applied** here, same disclosed exemption as
1-cloud-web-app: `source.mmd`'s mermaid render uses ONE neutral connector
color (`#333333`) for every edge, in-stage and cross-stage alike — the
restyle pass's per-stage arrow-coloring convention is a restyle-only
authoring choice, and applying it here would be an unrequested visual
edit the conversion-modes contract forbids. `rules-lint`'s C2 check is
itself `NOT-CHECKABLE` for every file (documentation call, no code
change).

C3/C4/C5: `NOT-CHECKABLE` (semantic-judgement, tool-wide); the two
domain hues (job fill/stroke, stage-container fill/stroke) are reused
unchanged from `source.mmd`'s own rendered `<style>` block, not
approximated.

## Text

T1: `NOT-CHECKABLE` (render-dependent); visually verified — no stage
title or job label overlaps a box, connector, or another label (checked
in the rendered PNG, including the 3 stage titles sitting well inside
their container's top border with clear margin on both sides).

**T2-lite: mechanically PASS** — "9/12 node-label text anchor(s)
verified inside their rect (3 skipped as not confidently a node label)"
— the 3 skips are the stage-container titles (`rules-lint`'s node-label
heuristic pairs a text anchor with the immediately-preceding `<rect>`
sibling of matching size-class; the 3 stage titles are correctly not
misclassified as job labels, they're simply outside this heuristic's
"confident" set, not a failure).

T3: `NOT-CHECKABLE` (semantic); all 9 job boxes are title-only, centered
both axes (`text-anchor="middle" dominant-baseline="central"`), matching
`source.mmd`'s own convention exactly; there is no node with body content
in this diagram.

## Reproduce-mode `--full` gate limitation (disclosed, not a rule exemption)

Distinct in kind from the B1/C2 items above: this is a **gate coverage
gap for icon-less sources**, not a documented rules-methodology
exemption. `node tools/rules-lint.mjs final-reproduce.svg --model
model.yaml --view view-reproduce.yaml --census census.yaml --layout
layout-reproduce.json --full` exits **1** with exactly 2 FAILs, both
`FULL_GATE_NOT_CHECKABLE`:

```
[FAIL] RELATIONSHIP_ATTACHMENT_NOT_RENDERED: FULL_GATE_NOT_CHECKABLE: --full requires a definitive answer; RELATIONSHIP_ATTACHMENT_NOT_RENDERED was NOT-CHECKABLE: view.yaml declares no relationship attachments that resolve into a model.yaml relationship id
[FAIL] UNKNOWN_ICON_SYMBOL: FULL_GATE_NOT_CHECKABLE: --full requires a definitive answer; UNKNOWN_ICON_SYMBOL was NOT-CHECKABLE: view.yaml has no component/relationship icon attachments
```

Root cause: `source.mmd` has zero icons (plain-text mermaid flowchart
nodes; no icon-shape syntax anywhere) — per README.md's Source-fidelity
default #2, "[dropping an icon] is an explicit-drop decision, never a
default", and the inverse holds too: an icon is added only if the source
has one. `view-reproduce.yaml` therefore correctly declares no
`components`/`relationships` icon attachments. Both
`checkUnknownIconSymbol` and `checkRelationshipAttachmentNotRendered`
(`tools/rules-lint.mjs`) exist solely to verify declared icon
attachments render correctly; with zero declared, both are structurally
`NOT-CHECKABLE` (not a defect — see each function's own
`iconIds.size === 0` / `declared.length === 0` early return), and
`--full` promotes any NOT-CHECKABLE cross-layer result to FAIL
unconditionally (`tools/rules-lint.mjs`'s own comment: "a cross-layer
check that couldn't reach a definitive answer... is promoted to FAIL").
This is unavoidable from within this example's directory: fabricating an
icon attachment to force a definitive answer would violate the fidelity
contract (icons only when the source has them), and fixing the tool
itself (e.g. letting the zero-attachment case return PASS with "0
declared, 0 required") is out of scope per the task's HARD LIMITS (no
edits to `tools/*`) and belongs to whoever owns the gate.

**The same command without `--full` exits 0**: 13 PASS, 0 FAIL, 0 WARN,
25 NOT-CHECKABLE (the same 2 icon checks correctly report
NOT-CHECKABLE, not FAIL, in this mode) — every check this tool CAN
evaluate for this file passes; the only gap is `--full`'s inability to
mark "definitively nothing to check" as anything other than FAIL.

## Verification

Rendered `final-reproduce.svg` → `final-reproduce.png` via headless
Chrome at 2× device scale (`--window-size=1045,268
--force-device-scale-factor=2`, matching the SVG's own viewBox), full
side-by-side compare against `source.png`, plus two 6×-scale crops (the
`build`→`build_a`/`build_b` fan-out corner, the
`build_a`/`build_b`→`test` merge trunk) — see "Connectors" above for
what each confirmed. One real bug found and fixed during iteration:
`final-reproduce.svg`'s header comment used literal `--` (em-dash-style
separators) and a literal `` `-->` `` inside `<!-- ... -->` blocks —
invalid per the XML comment grammar (`--` cannot occur anywhere inside a
comment body), which made Chrome refuse to parse the file as XML at all
(rendered its own "This page contains the following errors" banner
instead of the diagram). Fixed by replacing every in-comment `--` with a
real em-dash character (`—`) and rewording the two arrow-syntax mentions
to avoid embedding literal `-->` text.

## Summary

`node tools/rules-lint.mjs final-reproduce.svg --model model.yaml --view
view-reproduce.yaml --census census.yaml --layout layout-reproduce.json`
(no `--full`): **13 PASS, 0 FAIL, 0 WARN, 25 NOT-CHECKABLE — exit 0.**
With `--full`: **13 PASS, 2 FAIL (both FULL_GATE_NOT_CHECKABLE, icon
checks only — see above), 23 NOT-CHECKABLE — exit 1**, a disclosed gate
coverage gap for this icon-less source, not a defect in the model, view,
layout, or SVG. `node tools/offline-generate.mjs model.yaml
layout-reproduce.json --out out-reproduce.drawio --library tokens.yaml`
exits 0, first try. Two documented, disclosed reproduce-mode rule
exemptions (B1's size quantization, C2's arrow-color-by-domain) mirror
1-cloud-web-app's precedent exactly; the `--full` gap is a third,
differently-kinded disclosure (tool coverage, not a rules-methodology
call).
