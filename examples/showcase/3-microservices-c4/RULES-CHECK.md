# Diagram rules check — microservices-c4

Verified against `/Users/pengxiao/.overnight-runs/architecture-tokens/2026-08-24-0620/diagram-rules.md`
by rendering `final.svg` → `final.png` (headless Chrome, 2x scale), cropping every
connector/label cluster, and visually inspecting each one. Two rounds of fixes were made
(label placement relative to lines) before this checklist was written; see README for the
iteration log.

## Connectors

1. **PASS** — every edge exits the face nearest its target and runs straight when the
   target is directly above/below (`customer→spa`, `spa→backend_api`,
   `backend_api→database`, `web_app→spa`, `email_system→customer`,
   `backend_api→banking_system`), or exits the facing side edge and turns once when the
   target is offset (`customer→web_app`, `customer→mobile_app`,
   `mobile_app→backend_api`, `backend_api→email_system`).
2. **PASS** — every endpoint sits at its box-edge midpoint, except customer's left edge,
   which carries two edges (`email_system→customer` arriving, `customer→web_app`
   departing) and is deliberately split to y=169/y=199 (±15 from the true midpoint 184)
   per the rule's "distribute evenly" exception.
3. **PASS** — all 10 edges route in horizontal/vertical segments only; the 6 straight,
   single-segment edges stay `<polyline>`, and the 4 edges with a bend are now `<path>`
   (M/L/H/V plus the rule-3a corner arc — see below); no smooth bezier route anywhere.
   3a. **PASS** (rule adopted 2026-08-24) — the 4 bent edges (4 bends total: `customer→web_app`,
   `backend_api→email_system`, the merge trunk's `(1170,604)→(1170,624)→(850,624)` bend, and
   `backend_api→banking_system`) were converted from sharp `<polyline>` elbows to `<path>`
   with a 5-unit `Q` arc at every bend, one radius uniform across the file (`rules-lint`
   rule 3a: 4 rounded connectors, 4 bends, radius 5, PASS). Re-rendered and cropped the
   `backend_api→email_system` bend at 3x zoom: smooth corner, no distortion.
4. **PASS** — every arrowhead points along its final segment's direction (verified per
   edge; markers use `orient="auto-start-reverse"` so this is structural, not manual).
5. **N/A** — no badges/number chips are used anywhere in this diagram (see README
   simplification notes), so there is nothing for a landing arrowhead to avoid.
6. **PASS** — no polyline segment runs through or grazes a box it doesn't connect to;
   checked analytically per segment during layout (e.g. `mobile_app→backend_api`'s
   horizontal leg at y=624 sits 20u below Single-Page App's bottom edge, not touching it)
   and confirmed visually in the render.
7. **PASS** — three markers (`arrow-navy`/`arrow-gray`/`arrow-blue`), identical geometry
   (`viewBox="0 0 10 10"`, `markerWidth=markerHeight=16`, `markerUnits="userSpaceOnUse"`),
   differing only in fill — one canonical size/shape (the rule's intent), three colors to
   satisfy C2.
8. **PASS** — every connector (`<polyline>` and the rule-3a `<path>`s alike) uses
   `stroke-width="2"`, uniformly; box borders (3, or 2.5 dashed for the boundary) are a
   separate, consistently-applied value.Coverage note resolved 2026-08-24: rule 8 scans `<polyline>`/`<line>` AND marker-ended `<path>` connectors, so the rule-3a rounded paths stay inside its uniform-stroke-width guarantee.
9. **PASS** — `refX="10"` on a `M0,0 L10,5 L0,10` triangle places the reference point at
   the tip, so the arrowhead stops at the edge instead of overshooting into the box.
10. **PASS** — all 10 connectors are solid. The boundary's dashed border is a box style
    (C4 boundary convention), not a connector.
11. **PASS** — `spa→backend_api` and `mobile_app→backend_api` carry the identical
    "Uses [async, JSON/HTTPS]" relationship into backend_api's top face; they share one
    trunk `(850,624)→(850,664)` and one arrowhead (only one polyline carries
    `marker-end`), with one shared label beside the trunk instead of two duplicated ones.
    No other node in this model has two same-direction, same-meaning incoming edges.
12. **PASS** — every label sits clear of its line: horizontal-segment labels stack above
    (`label_above`) or below (`label_below`) with a computed baseline gap, vertical-segment
    labels sit offset to the side; every label also carries an opaque white background
    chip as a second line of defense. Two rounds of fixing were needed — see README.

## Boxes

- **B1 PASS** — all 8 leaf boxes share width 260; height = `2×16 + lines×20`. Four
  distinct heights result (112/132/152/172) matching four distinct line counts
  (4/5/6/7); boxes with equal content (Customer & E-Mail System, both 4 lines; Web
  Application & API Application, both 5 lines) are pixel-identical in height.
- **B2 PASS** — one gap constant (60) used for every peer-to-peer spacing: column gaps,
  row gaps, and boundary-to-flanking-box gaps (E-Mail System, Mainframe Banking System).
  The nested-box-to-container margin (40) is a distinct measurement governed by B10, not
  mixed with this value.
- **B3 PASS** — three-column shared grid (x = 400/720/1040) inside the boundary, reused
  vertically by API Application/Database/Customer (all x=720, i.e. col 2). Every
  connected pair that needs a straight line shares the axis: `web_app↔spa` share
  center-y 518, `backend_api↔banking_system` share center-y 730,
  `customer↔spa↔backend_api↔database` share center-x 850.
- **B4 PASS** — all 8 leaf boxes use border stroke-width 3; the boundary alone uses 2.5 +
  dashed, a documented, consistently-applied exception for "grouping construct, not a
  real component."
- **B5 PASS** — every label sits in open canvas space; none overlaps a box outline
  (verified in the same crops as connector rule 12).
- **B6 PASS** — identical internal anchor layout in every box: title top-left, technology
  line below it (when present), then body — governed by one `text_block()` function using
  the same padding/line-height for all 8 boxes.
- **B7 PASS** — every text line (title, technology, body) shares the same left margin
  (`box.x + 16`); padding is 16 on all four sides via the B1 height formula and the fixed
  box width.
- **B8 PASS** — canvas is sized to content bounds + 40u outer margin; no lane sits idle
  with extra unused padding beyond the one shared gap value.
- **B9 PASS** — the web_app/spa/mobile_app row is centered in the boundary: content width
  900, margins 40/40 left/right (boundary spans 360–1340, content spans 400–1300).
- **B10 PASS** — 40u margin between every nested box and the boundary's border on all
  sides (left/right/bottom); the top uses the title band (72) plus one gap (60), well
  clear. Verified visually — no nested box outline touches or coincides with the
  boundary's dashed outline.

## Colors

- **C1 PASS** — palette documented in an SVG `<!-- -->` comment block at the top of
  `final.svg`: navy (Person), gray (externally-maintained, C4 "_Ext"), blue (internally
  owned), boundary (neutral, no fill). Every colored element draws only from these four.
- **C2 PASS** — every box is colored by its semantic class; every arrow (stroke +
  arrowhead fill) is colored by its **destination's** class, per element (e.g.
  `spa→backend_api` is gray because backend_api is externally-maintained; the label text
  matches its arrow's color, per rule text "color an element and its label(s) the same").
- **C3 PASS** — "gray" here is not a neutral fallback; it is one of the three first-class
  documented semantics (externally-maintained), applied only to the four components
  actually carrying the `c4:component.external` token. The boundary's structural
  ink (`#3a4048` text / `#7a828e` border) is a visually distinct, separate neutral used
  only for the grouping box, not reused as a stand-in for the external-system semantic.
- **C4 PASS** — no off-palette colors were introduced; every fill/stroke/text color traces
  to one of the four documented palette entries.
- **C5 PASS** — "externally maintained" (gray) is applied to exactly the four components
  carrying `c4:component.external` in `model.yaml` (E-Mail System, Mainframe Banking
  System, Mobile App, API Application) — usage and documented meaning match exactly.

## Text

- **T1 PASS** — no text overlaps other text or a connector line. Confirmed by rendering,
  cropping every label cluster, and fixing two rounds of line-strikethrough bugs (see
  README).
- **T2 PASS** — body text is wrapped at 28 characters against a 260-wide box with 16
  padding on each side; no glyph touches or crosses a border in the render.
- **T3 PASS (8/8 leaf nodes); N/A (boundary)** — every one of the 8 leaf nodes carries
  body/description text, so all 8 are left-aligned per T3's body-content branch; none is
  "title-only," so the centered case never applies to a content node here. The boundary's
  "Internet Banking / [Boundary]" caption is a container label, not a content node in the
  T3 sense, and is left-aligned by C4/UML convention (also required so its text avoids
  the three vertical connector crossings through the title band — see README).

## Verification

**PASS** — rendered with
`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --screenshot=final.png --window-size=1700,1108 --force-device-scale-factor=2 file://final.svg`,
inspected the full image and 8+ targeted crops, found and fixed 4 label/line collisions
(customer→web_app, backend_api→email_system, backend_api→banking_system, and the
spa/mobile_app merge cluster), re-rendered, and re-inspected clean. Re-rendered again after
the rule-3a corner-rounding pass and re-cropped the `backend_api→email_system` bend at 3x
zoom: smooth corner, arrowhead still lands on the box edge.

**Summary: 31 PASS, 2 N/A, 0 FAIL.** (+1 PASS vs. the previous iteration for the new rule
3a.) `node tools/rules-lint.mjs final.svg` exits 0.
