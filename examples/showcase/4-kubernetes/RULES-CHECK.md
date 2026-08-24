# Diagram rules check -- 4-kubernetes

Applicability: orthogonal box layout (cluster/zone groupings as nested
containers), so both tiers apply -- Connectors 1-12, all Box rules B1-B10,
Colors C1-C5, Text T1-T3.

## Connectors

1. **Exit toward target / direct orthogonal route.** PASS -- every edge leaves
   the source box's face pointing at the target (right-mid for the same-row
   pairs; a fan-out/fan-in via a shared vertical trunk for the offset pairs)
   and turns exactly once per hop, no wraps or grazing.
2. **Anchor at edge midpoint; distribute or merge only when shared.** PASS --
   all 9 edges anchor at `lmid`/`rmid` (left/right edge vertical midpoint) of
   their box. No badge sits under a midpoint, so no offset was needed.
3. **Departure/arrival mirror each other, perpendicular.** PASS -- every
   final segment is horizontal into a left/right edge (verified by crop on
   all fan points: `hub-service`->firefox pair, firefox pair->
   `frontend-service`, `ui-servers-rc`/`backend-servers-rc`->
   `backend-service`).
4. **Orthogonal polylines, not curves.** PASS -- every connector routes in
   horizontal/vertical segments; the 5 single-segment straight connectors
   stay `<polyline>`, and the 7 connectors with a bend are now `<path>`
   (M/L/H/V plus the rule-3a corner arc -- see below), never a smooth
   bezier route.
   3a. **Uniform small corner-rounding radius.** PASS (rule adopted
   2026-08-24) -- the 7 bent connectors (8 bends total: the workload/
   network fan splits and both converge points into `frontend-service`/
   `backend-service`) were converted from sharp `<polyline>` elbows to
   `<path>` with a 5-unit `Q` arc at every bend, one radius uniform across
   the file (`rules-lint` rule 3a: 7 rounded connectors, 8 bends, radius
   5, PASS). Re-rendered and cropped the `hub-service`->firefox fan bend
   at 3x zoom: smooth corner, `stroke-linecap="round"` unaffected,
   arrowhead still lands exactly on the box edge.
5. **Arrowhead follows the final segment's direction.** PASS -- every
   terminal segment is horizontal, every arrowhead is right-pointing; no
   vertical-then-down-arrow kink exists.
6. **Land clear of badges/labels.** N/A -- no node carries a number
   badge; the workload icon sits at a fixed left position clear of the entry
   edge (edges always enter mid-right, icons sit mid-left).
7. **Whitespace around boxes merely passed by.** PASS -- the two fan
   trunks (x=702 and x=998 in `hub-service`'s and `firefox`'s gaps; x=1258
   and x=1554 in `frontend-service`'s and the ui/backend pair's gaps) run
   through the open gap between columns, verified by crop
   (`crop_fanout.png`, `crop_merge2.png`) not to graze any box outline they
   don't connect to. Two edges necessarily cross the platform/namespace
   container _boundary_ lines perpendicular (Tester->Selenium Hub RC; the
   inter-namespace merge into Frontend Service) -- that is a deliberate
   boundary crossing, not grazing a box the edge doesn't connect to.
8. **Uniform arrowhead size, decoupled from stroke width.** PASS -- one
   pair of `<marker>` defs (`arrow-workload`, `arrow-network`),
   `markerUnits="userSpaceOnUse"`, fixed `markerWidth`/`markerHeight="13"`,
   independent of the connector `stroke-width="2"`.
9. **Uniform connector stroke width.** PASS -- every connector
   (`<polyline>` and the rule-3a `<path>`s alike) uses `stroke-width="2"`,
   no exceptions.Coverage note resolved 2026-08-24: rule 8 scans `<polyline>`/`<line>` AND marker-ended `<path>` connectors, so the rule-3a rounded paths stay inside its uniform-stroke-width guarantee.
10. **Arrowhead tip lands exactly at the edge.** PASS -- `refX="10"` on a
    `0 0 10 10` viewBox triangle `M0,0 L10,5 L0,10` places the reference
    point at the tip; verified by crop (`crop_arrow2.png`) showing the tip
    sitting exactly on the target box's left border, not overshooting in.
11. **Solid lines by default.** PASS -- every connector is solid; no dash
    is used anywhere (no two distinct transition kinds exist in this
    diagram to justify one).
12. **Converging same-direction edges merge into one trunk / one
    arrowhead.** PASS, both converge points: `firefox-nodes-attribute` +
    `firefox-nodes-rc` -> `frontend-service` share one final segment and one
    arrowhead; `ui-servers-rc` + `backend-servers-rc` -> `backend-service`
    likewise. Applied symmetrically to the two fan-OUT points too
    (`hub-service` -> firefox pair; `frontend-service` -> only
    `ui-servers-rc`, a single edge so no merge was needed there) for visual
    parity with the source, though the rule's literal text addresses
    convergence.
13. **Edge label never struck by its line.** N/A -- no edge in this
    diagram carries a text label (the source diagram doesn't label its
    connectors either).

## Boxes

- **B1 Quantized height, shared width.** PASS -- one formula per peer
  group: workload boxes (icon + 2-line title + 1-line subtitle) are all
  232x104; service boxes (title-only) are all 140x56; the actor box (its
  own single-member group) is 110x70. No hand-tuned one-off sizes.
- **B2 One uniform gap.** PASS -- `GAP_X=64` between every peer column,
  `GAP_Y=40` between the two stacked rows, used everywhere (the wider
  `GAP_NS=64` inter-namespace gap and `GAP_TESTER=100`(effective 44 after
  the namespace-gap correction) external-actor gap are each their own
  single constant, applied once, not mixed values for the same kind of
  gap).
- **B3 Shared grid; connector-axis alignment.** PASS -- Tester,
  `selenium-hub-rc`, `hub-service`, `frontend-service`, `backend-service`
  all share one row-center (`ROW_CENTER`, y=324) so every same-row
  connector is a straight horizontal line; the two paired columns
  (`firefox-nodes-attribute`/`firefox-nodes-rc`,
  `ui-servers-rc`/`backend-servers-rc`) share `TOP_ROW_Y`/`BOTTOM_ROW_Y`
  and each pair's own column x, so their vertical arrows are straight.
- **B4 Uniform border weight.** PASS -- every node box uses
  `stroke-width="2"`; the two container tiers use their own uniform
  weight (`1.5`) distinct from node borders, applied consistently.
- **B5 Labels never overlap a box.** N/A -- no floating labels/pills
  exist in this diagram (the namespace/platform labels are container
  headers, not floating).
- **B6 Consistent internal layout, fixed anchors.** PASS within each peer
  group -- all 5 workload boxes place the icon at the same left offset and
  the same vertical center, title block starting at the same
  `x = PAD_LEFT+ICON_SIZE+TEXT_GAP` offset; all 3 service boxes center
  their single line the same way; the single actor box has its own
  consistent icon-above-label layout. The literal "number badge /
  action-hint" language in B6 doesn't apply to this genre (no step
  badges or next-step hints exist here) -- the icon+title anchor is the
  genre-appropriate analog, applied consistently.
- **B7 Shared text margins, even padding.** PASS -- within the workload
  group, title and subtitle share one left x (`text_x`); `PAD_LEFT`,
  `TEXT_GAP`, `PAD_RIGHT` are one constant set applied to all 5 boxes.
- **B8 Compress empty space.** PASS -- canvas height (528) is exactly
  `top-margin + 2 rows + row-gap + bottom-margin`, no padded dead space;
  the single-row items sit vertically centered against the pair rows
  rather than floating in extra vertical slack.
- **B9 Center a nested box within its container, equal margins.** N/A as
  literally stated -- both namespace containers hold a 2D grid (a single
  box plus a stacked pair side by side), not "one column of nested boxes
  per container," which is the rule's own stated precondition for when
  B3's grid governs instead. B3's grid alignment (above) is what actually
  governs here, per the rule's own carve-out.
- **B10 Nested box never touches its container's border.** PASS -- every
  node keeps margin from its namespace container (`NS_SIDE_MARGIN=28`,
  `NS_TOP_PAD=40`, `NS_BOTTOM_MARGIN=28`), and every namespace container
  keeps margin from the platform container
  (`PLAT_SIDE_MARGIN=28`, `PLAT_TOP_PAD=56`, `PLAT_BOTTOM_MARGIN=28`);
  verified by crop that no node border and its container border ever
  coincide.

## Colors

- **C1 One documented semantic palette.** PASS -- the palette (ACTOR,
  WORKLOAD, NETWORK, STRUCTURE/platform, STRUCTURE/namespace, CHROME),
  each with border/background/text tints, is documented in a
  `<!-- -->` comment block at the top of `final.svg`.
- **C2 Color by meaning; arrows colored by destination.** PASS -- every
  node is colored by its component-type domain (workload=blue,
  network=teal, actor=purple); every arrow is colored by the domain of
  the node it enters (verified against the model: e.g.
  `hub-service-to-firefox-attribute` targets a `workload.
replication-controller` -> blue; `firefox-attribute-to-frontend`
  targets a `network.service` -> teal), producing the alternating
  blue/teal chain documented in the palette comment.
- **C3 Neutral for absence of meaning, not habit.** PASS -- the platform
  and namespace containers (structural grouping, not a domain state) and
  the title bar (UI chrome) use the neutral/dark-ink STRUCTURE/CHROME
  tints, not an invented or borrowed domain color.
- **C4 Palette membership, not neighbor contrast.** PASS -- the
  namespace tint intentionally reads close to the workload tint (both
  blue-family, since a namespace is a Kubernetes concept adjacent to its
  workloads) -- that's a documented, intentional relationship, not an
  accidental off-palette clash.
- **C5 Documented meaning matches usage.** PASS -- WORKLOAD is used only
  for `k8s:workload.replication-controller` components and edges
  entering them; NETWORK only for `k8s:network.service` components and
  edges entering them; no drift.

## Text

- **T1 No text overlaps other text.** PASS -- verified by crop
  inspection; namespace labels sit in their own header band above all
  node content: no title/subtitle pair collides, no label crosses a line.
- **T2 Text stays inside the box, no overflow.** PASS -- required a fix:
  the initial 216-wide workload box overflowed "(Replication Controller)"
  past the right border (see deviation note in README). Widened to 232
  and title font trimmed to 12.5px; re-measured budget is 152 units
  against the widest line's rendered width, confirmed clean by crop
  (`crop_backend3.png`).
- **T3 Center title-only nodes; left-align nodes with body content.**
  PASS -- the 3 service boxes and the actor box are title-only and
  centered; the 5 workload boxes carry a body/subtitle line
  ("Kubernetes Engine") and are left-aligned, title and subtitle sharing
  one left margin.

## Summary

Connectors: 12 PASS, 2 N/A (rules 6, 13). Boxes: 8 PASS, 2 N/A (B5, B9).
Colors: 5 PASS. Text: 3 PASS.

**28 PASS, 4 N/A, 0 FAIL** (32 applicable rules total; +1 PASS vs. the
previous iteration for the new rule 3a). `node tools/rules-lint.mjs
final.svg` exits 0.
