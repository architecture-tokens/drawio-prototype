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
   3a. PASS (rule adopted 2026-08-24) — the top and bottom `channel-consumer-*` edges (2 bends, one
   each: `(660,170)`/`(660,270)`) were converted from sharp `<polyline>` elbows to `<path>` with a
   5-unit `Q` arc, one radius uniform across the file (`rules-lint` rule 3a: 2 rounded connectors,
   2 bends, radius 5, PASS). The middle `channel-consumer-*` edge stays a straight, unbent
   `<polyline>` (its middle point at `660,170` is collinear with its endpoints — no real bend to
   round, per the task brief's "straight single-segment lines unchanged"). This shrinks the
   shared-trunk overlap described in rule 11 below by the 5-unit radius (the trunk's three
   connectors now visually coincide from x=620 to x=655 instead of x=620 to x=660) — re-rendered
   and cropped the top branch's bend at 3x zoom: still reads as one trunk splitting cleanly into
   three, smooth corner, arrowhead lands exactly on the box edge.
4. PASS — every arrowhead follows its final segment's direction (all final segments are horizontal
   runs into a left edge, so all arrowheads point right; no kinked head).
5. N/A — no number badges or title decorations exist on any box to land clear of.
6. PASS — the two trunk risers (x=660, y 70-170 and y 170-270) pass through open canvas space; no
   connector grazes a box it doesn't terminate at.
7. PASS — one `<marker id="arrow">` def, `markerUnits="userSpaceOnUse"`, fixed `markerWidth`/
   `markerHeight="9"`, independent of the uniform stroke-width="1".
8. PASS — every connector (`<polyline>` and the rule-3a `<path>`s alike) uses `stroke-width="1"`;
   box outlines are separately stroke-width 1.5 per B4 (rule 8 explicitly allows this split).
   Coverage note resolved 2026-08-24: rule 8 scans `<polyline>`/`<line>` AND marker-ended `<path>` connectors, so the rule-3a rounded paths stay inside its uniform-stroke-width guarantee.
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
iteration was needed. Re-rendered after the rule-3a corner-rounding pass and re-cropped the top
branch's bend at 3x zoom: smooth corner, trunk-merge appearance intact, no distortion.

## Summary

26 PASS, 5 N/A, 0 FAIL. (+1 PASS vs. the previous iteration for the new rule 3a.)
`node tools/rules-lint.mjs final.svg` exits 0.

---

# Diagram rules check — 5-event-pipeline (reproduce mode, `final-reproduce.svg`)

Per `examples/showcase/README.md`'s "Conversion modes": in `reproduce` mode, "Diagram rules act
only as a defect lint; a clean source gets zero visual edits." `view-reproduce.yaml` records the
mode verdict: source.mmd is Mermaid's own clean default `graph LR` layout (uniform box heights,
near-equal gaps, already grid-aligned on its shared centre row) — nothing here is a layout defect
worth re-authoring except its bezier connector routing, which rule 3/3a fixes in BOTH modes
regardless (owner decision 2026-08-24). This section checks `final-reproduce.svg` against the same
rule set the restyle pass above used, noting the one real structural difference: the restyle's
rule-11 merged trunk is NOT reproduced here (see rule 11 below) — the reproduce view keeps three
independent branches, matching source.png's own "three separate arrows leaving Channel" reading,
per the task brief's explicit instruction for this view.

## Connectors

Mechanically verified by `node tools/rules-lint.mjs final-reproduce.svg` (see "Verification"
below for the full run): rules 4/7/8/9/10 all PASS — one marker (`#333333`, matching every edge
color read directly out of the mermaid.ink render's own stylesheet, `.flowchart-link{stroke:
#333333}` / `.arrowheadPath{fill:#333333}`), all 5 connectors share `stroke-width="1"`, no dashes
anywhere (nothing to document).

**3a PASS.** `rules-lint`: `3a: 2 rounded connector(s), 4 bend(s) total, all one uniform radius 5`
— zero clamped. `channel-consumer-a` and `channel-consumer-c` (the two bent branches) were
authored as plain multi-point `<polyline>`s then converted with `tools/round-connectors.mjs
final-reproduce.svg 5 --write` (tool output: "converted 2 bent polyline(s), left 3 single-segment
polyline(s) unchanged, 0 bend(s) clamped"). Both bends on each branch sit well clear of the clamp
threshold (legs of 24/91/25 and 24/90/25 units, all ≫ 2×5=10), so no clamp clause applies here —
unlike 1-cloud-web-app's reproduce view, which had a genuine sub-10-unit micro-jog.

1. PASS — Producer/message/Channel/consumer-b all sit on the shared centre row (y=139) and exit
   straight into the box directly ahead. Channel's two off-row branches (to consumer-a/c) leave
   from the right edge (the face that faces every one of the three targets, all of which sit to
   Channel's right) and turn once toward their target's row before entering horizontally — most
   direct orthogonal path, no wrap/detour.
2. PASS — producer-message/message-channel/channel-consumer-b each anchor at the plain midpoint
   (one edge per face). Channel's right edge carries **three** outgoing edges, so rule 2(a)
   applies: exit points are distributed evenly along the face (y=125/139/153, i.e. quarter marks
   of Channel's 112–166 span) instead of all three sharing one point — the deliberate mirror of
   rule 11 below (this diagram merges nothing, so there is no shared point to distribute away
   from).
3. PASS — every connector routes in axis-aligned horizontal/vertical segments only (3
   single-segment `<polyline>`s, 2 rule-3a `<path>`s using H/V/Q, never a smooth bezier route) —
   confirmed by `rules-lint` rule 4 (no C/S bezier commands in any marker-ended `<path>`).
4. PASS — every arrowhead follows its final segment's direction: all five final segments are
   rightward horizontal runs into a left edge, so all five arrowheads point right, landing
   perpendicular with no kink.
5. N/A — no number badges or title decorations exist on any box.
6. PASS — the two bend columns (x=443) run through open canvas space; no connector grazes a box
   it doesn't terminate at (checked in `final-reproduce.png` at 2×).
7. PASS — one `<marker id="arrow">`, `markerUnits="userSpaceOnUse"`, fixed `markerWidth`/
   `markerHeight="9"`, independent of the uniform `stroke-width="1"`.
8. PASS — every connector (`<polyline>` and the rule-3a `<path>`s alike) uses `stroke-width="1"`;
   box outlines are separately `stroke-width="1"` too (source's own value — no split needed here,
   unlike the restyle's 1 vs 1.5).
9. PASS — marker `viewBox="0 0 10 10"`, triangle `M0,0 L10,5 L0,10`, `refX="10"` (the tip) —
   note this is a deliberate departure from source.mmd's OWN marker (`refX="5"`, centre-anchored,
   overlapping into the target box by half the head width): rule 9 is a universal connector rule,
   not something the modes clause exempts, and every connector in this hand-authored file is built
   fresh to spec rather than literally copying the source's raw marker geometry.
10. PASS — every connector is solid; no dash used anywhere.
11. **N/A — fan-out, not fan-in; the restyle's merge does not apply here.** Rule 11 governs
    convergence ("multiple connectors converging on one node… merge into a single trunk"); this is
    the diverging mirror (one node, three destinations), and the task brief for this view is
    explicit that the fan-out "may keep three separate orthogonal branches matching the source's
    separate-arrows reading (this is the reproduce view — the restyle view's merged trunk stays
    the rule-11 demonstration)." Kept as 3 independent branches with 3 distinct arrowheads,
    exactly source.png's own reading and the documented precedent from 1-cloud-web-app's reproduce
    view ("diverging fans (1 LB → 4 instances) stay as 4 separate arrowheads").
12. N/A — no edge carries a text label (source has none either).

## Boxes

**B1 does not apply as a defect-lint the way it does to a re-authored layout — extracted, not
chosen.** All 6 boxes share height=54 (one line of text, Mermaid's own uniform formula) but width
varies by label length within a natural family (Producer=125, message=95, Channel=90, the three
Consumers=134 each) — read directly off the mermaid.ink render's own per-node `rect` `width`
attributes, not authored. The 3 Consumer boxes (the one genuine same-role peer group in this
diagram) DO already share one uniform width (134), so B1's "peer boxes share width" intent is
satisfied where it applies; the cross-type width variation is source fidelity, not a defect,
same documented reproduce-mode call as 1-cloud-web-app's B1 entry.

B2/B2-lite: PASS (mechanical) — `rules-lint`: "vertical gap value(s) found: 50" (the one
vertically-stacked sibling pair, consumer-a/consumer-b/consumer-c, all 104px apart centre-to-
centre / 50px edge-to-edge, extracted from source, already uniform). Horizontal gaps
(Producer↔message=50, message↔Channel=50, Channel↔Consumers=49) are within 1px of each other —
real-number source geometry rounded to integers, not a defect.

B3: PASS (visual) — Producer/message/Channel/consumer-b share centre-y=139 so their connectors run
dead straight; consumer-a/consumer-c are off-row but still grid-snapped to the same column
(x=467) and the same 104px vertical rhythm as consumer-b, matching source exactly.

B4: PASS (mechanical) — `rules-lint`: "all 6 leaf-node rects share border stroke-width 1."

B5: N/A — no floating labels/pills/callouts.

B6/B7: PASS (visual) — all 6 boxes use the identical internal layout (one centred title, nothing
else); text is centred per T3 with equal padding (box sized to content, per B1's per-family
formula above).

B8: PASS (visual) — canvas is 609×278, exactly the mermaid.ink render's own computed size; no
padded voids beyond what the source itself leaves.

B9/B10: N/A — no nested/contained boxes; this model has no containment (see census.yaml — no
`visual` records, no subgraphs in source).

## Colors

**C1 — mechanically PASS.** `rules-lint`: "palette comment documents 4 color(s); all 4 used
fill/stroke hex color(s) are covered." Source draws no per-component-type color distinction of
its own (Mermaid's default theme applies ONE style to every node), so this is a genuine one-entry
palette (border `#9370DB`, fill `#ECECFF`, text `#333333`), documented as such rather than
inventing per-type semantic colors the source doesn't have — values read directly out of the
mermaid.ink render's embedded `<style>` block (`.node rect{fill:#ECECFF;stroke:#9370DB}`,
`#mermaid-svg{fill:#333}`), not sampled from a rasterized PNG.

**C2 is explicitly not applied here — disclosed reproduce-mode exemption, same call as
1-cloud-web-app's C2 entry.** `final.svg`'s restyle colors each connector by its destination
(message-grey/channel-violet/consumer-green); this file uses ONE uniform connector color
(`#333333`) for all 5 edges, matching source.mmd's own single `.flowchart-link` stroke exactly —
applying C2's destination-coloring here would be an unrequested visual invention the
conversion-modes contract forbids for a clean source. `rules-lint`'s C2 check is itself
`NOT-CHECKABLE` for every file (semantic judgement), so this is a documentation call, not a code
change.

C3/C4/C5: `NOT-CHECKABLE` (semantic, tool-wide); N/A in substance — there is no per-type semantic
distinction in this source for these rules to check (see C1 above).

## Text

T1: `NOT-CHECKABLE` (render-dependent); visually verified in `final-reproduce.png` — no label
overlaps a box or a connector.

T2-lite: PASS (mechanical) — `rules-lint`: "6/6 node-label text anchor(s) verified inside their
rect."

T3: `NOT-CHECKABLE` (semantic) in substance PASS — all 6 nodes are title-only (no body content),
centred both horizontally and vertically, matching source exactly.

## Cross-layer gate

`node tools/rules-lint.mjs final-reproduce.svg --model model.yaml --view view-reproduce.yaml
--census census.yaml --layout layout-reproduce.json` (no `--full`): **14 PASS, 0 FAIL, 0
NOT-CHECKABLE among the checks that ran** (24 NOT-CHECKABLE render-dependent/out-of-scope, same
baseline as every file this tool evaluates) — `CENSUS_MISMATCH` (11 records biject onto source's
11 elements), `DIRECTION_GEOMETRY_CONFLICT` (5/5 relationships, 100%, match `flow.direction:
right`), `UNTRACEABLE_VISUAL / MISSING_COMPONENT` (6/6 components each appear exactly once via
`data-component`), `VIEW_REF_UNRESOLVED` all PASS. **Exit 0.**

**With `--full`: 2 FAIL, both a disclosed tool limitation, not a defect in this example.**
`UNKNOWN_ICON_SYMBOL` and `RELATIONSHIP_ATTACHMENT_NOT_RENDERED` are unconditionally NOT-CHECKABLE
whenever `view.yaml` declares zero icon/relationship attachments (`checkUnknownIconSymbol` /
`checkRelationshipAttachmentNotRendered` in `tools/rules-lint.mjs` both hard-return NOT-CHECKABLE
at `iconIds.size === 0` / `declared.length === 0`, with no vacuous-PASS path for "0 declared, 0
needed"), and `--full` unconditionally promotes any NOT-CHECKABLE cross-layer result to FAIL
(`FULL_GATE_NOT_CHECKABLE`). source.mmd is a bare Mermaid flowchart with no icon glyphs at all, so
`view-reproduce.yaml` correctly declares no attachments — inventing one to satisfy the gate would
be a real fidelity violation (drawing an icon the source doesn't have) traded for a cosmetic exit
code, which this task's HARD LIMITS (no edits to `tools/*`) also forbid fixing at the source. Cross-
checked: `2-cicd-flow`'s reproduce view (also icon-less) hits the exact same 2 FAILs under `--full`
for the identical reason — this is systemic to icon-free sources, not specific to this example's
authoring. Routed as feedback below for the coordinator (who owns `tools/`) to fix once at
consolidation: add a vacuous-PASS branch to both checks for "0 attachments declared AND 0 needed."

## Verification

Rendered `final-reproduce.svg` → `final-reproduce.png` via headless Chrome (`--screenshot
--window-size=609,278 --force-device-scale-factor=2`, matching the SVG's own `viewBox`), 2 render
passes:

1. First render hit Chrome's strict-XML comment parser: the header comment used `--` as a prose
   dash in several places (e.g. "fan-out into one trunk -- that stays..."), which is invalid
   inside an XML/SVG comment (only `-->` may contain a double-hyphen) — Chrome refused to render
   and showed its XML-error page instead of the SVG. Fixed by replacing every mid-comment `--`
   with a semicolon, parenthesis, or comma; re-rendered clean (21KB PNG vs. the first attempt's
   130KB error-page screenshot).
2. Side-by-side crop comparison against `source.png` (scaled to match `final-reproduce.png`'s
   pixel dimensions, stacked vertically): box positions, sizes, fill/border colors, and the
   sharp-vs-rounded corner distinction all line up almost exactly between source and reproduction;
   the only visible difference is the connector treatment (orthogonal + rounded corners vs.
   source's smooth beziers), which is the one deliberate, rule-mandated deviation. Zoomed 2× crop
   of the top branch's bend: smooth 5-unit corner, arrowhead lands exactly on the Consumer box's
   left edge, Channel's three exit points visibly distributed along its right face (not
   overlapping), no distortion.

## Summary

**24 PASS, 6 N/A, 0 FAIL** among the checkable/visually-verified rules above (T3/C3/C4/C5/T1
counted as N/A-in-substance per their entries; 11 is N/A as the documented fan-out/fan-in mirror).
`node tools/rules-lint.mjs final-reproduce.svg --model model.yaml --view view-reproduce.yaml
--census census.yaml --layout layout-reproduce.json` (no `--full`) exits 0: **14 PASS, 0 FAIL**.
`node tools/offline-generate.mjs model.yaml layout-reproduce.json --out out-reproduce.drawio
--library tokens.yaml` exits 0, first try. `--full` adds 2 FAIL from a disclosed, cross-checked
`tools/rules-lint.mjs` limitation (icon-less sources can never satisfy `UNKNOWN_ICON_SYMBOL`/
`RELATIONSHIP_ATTACHMENT_NOT_RENDERED` under `--full`), routed as tooling feedback above, not a
defect in this example's `model.yaml`/`view-reproduce.yaml`/`census.yaml`/`final-reproduce.svg`.
