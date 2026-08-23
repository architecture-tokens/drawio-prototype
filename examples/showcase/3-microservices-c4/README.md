# microservices-c4 — Container diagram for Internet Banking System

## Source

- URL: https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/c4.md
- Repo: `mermaid-js/mermaid`
- License: MIT
- Fetched: 2026-08-24T06:34:00Z
- The canonical `C4Container` example from mermaid's own docs, itself adapted from the
  well-known Structurizr/C4-model "Internet Banking System" reference example.

`meta.json` estimates 8 nodes / 11 edges. The actual source has **8 leaf nodes** (as
estimated) but **10** `Rel()`/`Rel_Back()` relationships, not 11 — counted directly with
`grep -nE "^(Rel|Rel_Back)\(" source.mmd`; the model below captures all 10.

## What the semantic model captures

`model.yaml` has **9 components** (the 8 source nodes plus one 9th: the `Internet
Banking` `Container_Boundary` itself, modeled as a real component — see "Boundary as a
component" below) and all **10 relationships**, using:

- `core@0.1.0` for the two people/systems that are directly the built-in types
  (`component.external-actor` for Customer/E-Mail System/Mainframe Banking System,
  `component.service` for the four service-shaped containers, `component.database` for
  Database) and one straightforward relationship (`relationship.call.sync` for the three
  plain synchronous HTTPS calls).
- `security@0.1.0` — `security.encryption.in-transit`, applied only to the 3 edges typed
  `core:relationship.call.sync` whose label states `HTTPS` (its `appliesTo` restricts it
  to `call.sync`/`data.read`, so it cannot legally attach to the async-call edges — see
  "Local token library" below). `security.tls.v13`/`tls.1-3` were **not** used: the source
  never states a TLS version, only "HTTPS", and asserting TLS 1.3 specifically would be
  fabricating a detail the source doesn't give.
- `environment@0.1.0` and `lifecycle@0.1.0` are **not used at all** — the source makes no
  environment (prod/staging/dev) or change-history claim about any element, so applying
  either would be inventing information not in the source. `libraries:` in model.yaml
  only declares the three libraries actually referenced (`core`, `security`, `c4`).
- `c4@0.1.0` (`tokens.yaml`, this example's local library) — five concepts C4 modeling
  needs that the built-ins don't cover; see below.

## Local token library (`tokens.yaml`, namespace `c4`)

The built-in `core` library only has `component.database`, `component.service`,
`component.external-actor`, and `relationship.call.sync` / `data.read` / `belongs.to` —
enough for a generic system diagram, but not for this C4 container diagram's specific
vocabulary. Added:

- `c4:component.boundary` — a system/container boundary grouping construct with no
  runtime behavior (C4's `Container_Boundary`). **This is why the boundary is a
  component, not just a layout artifact**: `src/layout.ts`'s `validateLayout()` checks
  `layout.nodes` ids against `model.components` ids **exactly** (`INVENTED_LAYOUT_ID` /
  `OMITTED_LAYOUT_ID`, checked bijectively) — there is no way to add a boundary box to
  `layout.json` that isn't also a real `model.yaml` component. The task brief anticipated
  this ("C4 boundary boxes become containers") and it is exactly what the schema forces.
- `c4:component.external` (applied) — the C4 `_Ext` marker (`System_Ext`, `Container_Ext`,
  `ContainerDb_Ext`): "maintained by a separate team," as distinct from components this
  model's own team owns. Drives the gray/blue color split in `final.svg` (rule C2) on top
  of the base component-type, which alone can't distinguish e.g. Mobile App (external
  service) from Single-Page App (internal service) — both are `core:component.service`.
- `c4:relationship.call.async` — an async request/response call (`spa`/`mobile_app` →
  `backend_api`, labeled "async, JSON/HTTPS"), distinct from `core:relationship.call.sync`.
- `c4:relationship.delivers` — one component serving/delivering content to another
  (`web_app` → `spa`, "Delivers"), not a request/response call.
- `c4:relationship.data.readwrite` — combined read+write data access (`backend_api` →
  `database`), since `core:relationship.data.read` is read-only and the source's label is
  explicitly "Reads from **and writes to**."
- `c4:relationship.notifies` — a fire-and-forget notification (`email_system` ↔
  `customer`, `backend_api` → `email_system`), distinct from a request/response call.

## Simplification / judgment-call decisions

1. **`ContainerDb_Ext(backend_api, "API Application", ...)` modeled as a `service`, not a
   `database`.** The source's mermaid macro literally tags API Application as
   `ContainerDb_Ext`, but its description ("Provides Internet banking functionality via
   API") and its role in the diagram (an API layer sitting between the client containers
   and the actual `Database` node) are a service, not a data store. This reads as a
   likely copy/paste artifact in the source (the reference Structurizr "Big Bank plc"
   diagram this is adapted from typically tags its API layer `Container_Ext`, not
   `ContainerDb_Ext`) — not something I can verify against Structurizr's original, so it
   is stated here as a judgment call, not a checked fact.
2. **`Rel_Back(database, backend_api, "Reads from and writes to", "sync, JDBC")` direction
   resolved from the rendered pixels, not the macro name.** Read literally, mermaid's
   `Rel_Back(a, b, …)` is documented as reversing the arrow from `Rel(a, b, …)`'s usual
   direction, which would suggest the arrowhead lands on `database`. A tight crop of
   `source.png` around that connector (`database`'s bottom edge vs. `backend_api`'s top
   edge) shows the arrowhead unambiguously entering **Database's** bottom edge, i.e. the
   line runs `backend_api → database`. Modeled as `from: backend_api, to: database` on
   that direct pixel evidence, overriding the macro-name inference.
3. **No C4 stereotype badges** (`<<container>>`, `<<external_system>>`, etc.) in
   `final.svg`. The source renders these above every title; they're dropped here and the
   same information is carried entirely by the palette (C1–C5) plus `c4Stereotype` in
   each component's `model.yaml` metadata, which keeps every box to a uniform 3-line
   header (title, technology, spacer) instead of a 4th line, and avoids a fifth,
   redundant color-coding channel.
4. **Customer is left-aligned with body text, not a centered person-icon+title.** The
   source draws Customer as a centered icon + bold title with a description block below
   it — inconsistent internally (T3 requires: title-only → centered; body present →
   left-align). Since Customer carries body text ("A customer of the bank…"), it follows
   the same left-aligned layout as every other box for consistency; no person icon is
   drawn (color alone, navy, distinguishes it as the sole `Person`).
5. **Boundary title left-aligned within its title band, not centered.** Three of the
   customer/email/database-column connectors cross vertically through the boundary's
   title band at x≈530/850/1170 (web_app's, spa/customer's, and mobile_app's columns).
   The title text is placed in the one open horizontal gap between those crossings
   (x≈580–800) so no connector line strikes through a glyph (T1) — a routing constraint,
   not a stylistic default.

## What the layout improved over the source

The source (`source.png`) is a single narrow column ~2000px tall with every container
stacked vertically regardless of its actual relationships, so most connectors run the
full height of the canvas as long diagonal lines crossing several unrelated boxes (see
e.g. the five nearly-parallel diagonal lines all converging on API Application from
Customer, Database, etc.). `layout.json`/`final.svg` instead:

- Lay the three C4 containers that Customer talks to directly (Web Application,
  Single-Page App, Mobile App) on one shared row/grid inside the boundary (B1–B3), with
  API Application and Database stacked in the middle column below Single-Page App.
- Reduce canvas height from source's ~2023px (8 nodes stacked in one column) to a
  1108-unit canvas with the same 8 nodes plus the boundary, by using the actual
  call-graph topology instead of declaration order (B8).
- Merge the two same-meaning, same-destination edges (`spa→backend_api`,
  `mobile_app→backend_api`) into one visual trunk with one arrowhead (rule 11) — the
  source draws these as two separate near-parallel diagonal lines.
- Every connector is an orthogonal polyline with a single 90° bend at most (two for the
  two edges that must route around the boundary's outer edge); the source uses
  freeform diagonal lines throughout, several of which visually cross unrelated boxes.
- Uniform box width (260) and a height formula quantized to line count (B1), vs. the
  source's ad hoc heights (each box sized independently to its own content with no shared
  formula, e.g. Mobile App and Database render at visibly different heights than boxes
  with the same number of description lines).

## Files

| File                        | Contents                                                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `source.mmd` / `source.png` | Original mermaid C4Container source and its render                                                               |
| `tokens.yaml`               | Local `c4@0.1.0` token library (boundary, external marker, async/delivers/readwrite/notifies relationship types) |
| `model.yaml`                | Architecture Tokens semantic model — 9 components, 10 relationships                                              |
| `validate.txt`              | `node dist/cli.js validate` output (exit 0)                                                                      |
| `layout.json`               | Layout contract v0.1 — hand-authored grid layout (see "What the layout improved")                                |
| `generate.txt`              | `node tools/offline-generate.mjs` output (exit 0, first try, no repair)                                          |
| `out.drawio`                | Generated draw.io XML                                                                                            |
| `final.svg`                 | Hand-authored SVG applying diagram-rules.md in full                                                              |
| `final.png`                 | 2x-scale headless-Chrome render of `final.svg`, visually verified                                                |
| `RULES-CHECK.md`            | Rule-by-rule compliance checklist (30 PASS, 2 N/A, 0 FAIL)                                                       |

## Iteration log (verification step)

First render had 4 label/line collisions, all in the same failure mode (a multi-line
label's later lines drifted onto the connector it was meant to clear): `customer→web_app`
("[HTTPS]"), `backend_api→email_system` ("[sync, SMTP]"), `backend_api→banking_system`
("[sync/async, XML/HTTPS]"), and the `spa`/`mobile_app→backend_api` merge cluster (two
labels overlapping each other, one striking its own line). Fixed by computing label
baselines from the line's y-coordinate outward (last line N units clear of the line, not
"the first line is offset and the rest cascade toward it") and consolidating the merge
cluster to one shared label per rule 11. Re-rendered and re-inspected clean — see
`RULES-CHECK.md` for the per-rule detail.
