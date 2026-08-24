# Visual topology validation

Architecture Tokens layout validation now treats geometric topology as part of correctness, not merely presentation. The same model is enforced at two layers:

- `src/topology.ts` validates planner-produced `layout.json` before rendering.
- `tools/rules-lint.mjs` checks the exact straight segments authored in the rendered SVG (`VISUAL_TOPOLOGY`) and closes rule 3a's split-element loophole.

## Blocking diagnostics

| Diagnostic/check                            | Blocking geometry                                                                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_COLLISION`                            | Two peer boxes overlap with positive area.                                                                                                       |
| `CHILD_OUTSIDE_PARENT`                      | A child's resolved box escapes its declared parent container.                                                                                    |
| `EDGE_CROSSING` / `VISUAL_TOPOLOGY`         | Perpendicular connector legs cross in both interiors outside a component attachment area.                                                        |
| `INVALID_EDGE_JUNCTION` / `VISUAL_TOPOLOGY` | One relationship terminates on an unrelated relationship, creating a false T-junction.                                                           |
| rule `3a`                                   | Two or more fan branches on one side of a separately-authored bus form sharp logical elbows, even when every individual SVG element is straight. |

The layout route model reconstructs the orthogonal dogleg between a node boundary and an off-axis waypoint. It chooses the closest box side, so validation does not depend on component names, cloud providers, or diagram-specific ids.

## What is intentionally allowed

- Parent/child containment.
- A non-parented structural overlay that fully contains at least two other boxes. This mechanical rule admits the checked-in AZ × Autoscaling-Group and C4 container geometry without type-name matching; a single accidental containment is still a collision.
- Collinear overlap used as a shared bus.
- Fan-in/fan-out routes whose model relationships share a semantic endpoint.
- A singleton trunk on the opposite side of a fan bus: it is the true T-junction and rule 3a does not demand rounding there.
- Intersections inside a `data-component` box, where relationships legitimately attach.

## Narrow crossing allowance

Reproduce mode can faithfully preserve a source crossing that geometry cannot distinguish from a defect. `layout.json` has one optional, exact-pair escape hatch:

```json
{
  "topology": {
    "allowEdgeCrossings": [{ "edgeIds": ["customer-web_app", "spa-backend_api"] }]
  }
}
```

Both ids must resolve to different model relationships. The allowance applies only to that unordered pair; it does not disable collision, junction, or crossing validation globally. `3-microservices-c4` documents eight source-faithful gutter pairs this way. No cloud-specific allowance exists.

## Regression evidence

- Historical `cloud-web-app` ingress at `y=560`: `EDGE_CROSSING` / `VISUAL_TOPOLOGY` reports crossings at `(259.5, 593)` and `(236.5, 560)`.
- Corrected route at `y=626`: it passes below the Web fan bus at `y=593`.
- Historical reproduce fan geometry: 16 logical elbows were split between branch and bus elements. The generic repeated-junction detector now rejects that shape.
- The detector also found eight remaining restyle fan elbows; `final.svg` now authors them as radius-5 `Q` paths and reports `18 rounded connector(s), 28 bend(s)`.
- All five `final-reproduce.svg --full` gates remain at zero FAIL.

The adversarial public-interface tests live in `test/topology.test.ts` and `test/rules-lint.test.ts`.
