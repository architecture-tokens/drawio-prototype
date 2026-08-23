# 5-event-pipeline

**Source:** https://raw.githubusercontent.com/asyncapi/website/master/markdown/docs/concepts/channel.md
(`asyncapi/website` repo — the "Channel" concept page on the official AsyncAPI documentation site).
**License:** Apache-2.0 (permissive; no share-alike attribution clause applies — this is not a
CC-BY-SA source).
**Fetched:** 2026-08-24T06:35:00Z (per `meta.json`).

**Genre:** event/streaming pipeline — one producer publishes onto one broker channel, which
delivers to multiple independent consumers. Chosen specifically to showcase connector rule 11
(see below), since it is the only genre in this batch with a genuine one-to-many fan-out.

## What the source diagram shows

A Mermaid `graph LR` with 6 nodes and 5 edges:

```
Producer -> message -> Channel -> Consumer
                            |----> Consumer
                            |----> Consumer
```

`Producer` publishes a `message`, which lands on the addressable `Channel` (AsyncAPI's term for a
broker topic/queue), which is independently consumed by three `Consumer`s. The original
`source.png` draws the three Channel-to-Consumer edges as three separate curved beziers.

## What the semantic model captures

`core`/`security`/`environment`/`lifecycle` (the built-in libraries) have no concept for a message
broker, an addressable channel, a producer/consumer application role, or an in-flight message —
their component types are limited to `database`, `service`, and `external-actor`. None of those
map cleanly onto this genre without losing meaning (a channel is not a database; a producer/
consumer is a role, not a generic service). So this example adds a local `tokens.yaml`
(namespace `eventing`, version `0.1.0`) with four component-types (`producer`, `consumer`,
`channel`, `message`) and two relationship-types (`publish` — an element moving onward toward the
channel that will carry it; `deliver` — the channel routing to one subscribing consumer).

`model.yaml` captures all 6 source nodes as components and all 5 source edges as relationships,
1:1 with the source — nothing added, nothing dropped. No component or relationship applies any
built-in token (no environment/security/lifecycle facts are stated anywhere in the source, so none
were invented).

**No flattening was needed.** The source has no groups/subgraphs, so containment is moot; for the
record, the Architecture Tokens Core v0.1 `architecture-model` schema itself has no `parentId`/
containment concept on components at all (see `node_modules/@architecture-tokens/spec/schema/
architecture-model.schema.json`), so even a source with containers would have had to flatten here
regardless of this example's content.

## What the layout improved over the source

- **Orthogonal connectors, not curves.** The source's three Channel-to-Consumer edges are smooth
  bezier curves; `final.svg` uses only right-angle `<polyline>`s per the rules.
- **Shared grid + uniform gaps (B2/B3).** Producer/message/Channel/consumer-b share one row
  (centre-y=170); the three Consumer boxes share one 40px vertical rhythm; every column uses the
  same 80px horizontal gap.
- **Quantized, uniform box sizing (B1).** All 6 boxes use the same height (60 = 20+20 padding +
  1x20 line-height) and the same width (140, fit to the longest label), replacing the source's
  visually-similar-but-untied sizing.
- **Rule 11 showcase — merged trunk instead of three near-duplicate lines.** The source's three
  curves leave Channel at three different angles from three different points on its border. This
  layout is the point of the exercise: **connector rule 11** ("multiple connectors converging on
  one node ... merge into a single trunk") is written for the fan-**in** case (many sources, one
  destination, one shared arrowhead). This diagram has the mirror-image shape — one source
  (Channel), three destinations (the Consumers) — so a literal one-arrowhead merge is impossible
  (each consumer must show its own incoming arrow). Instead, the merge happens on the shared
  _exit_ side: all three `channel-consumer-*` edges leave Channel from the exact same point and
  travel the identical first segment (`620,170` -> `660,170`), so the three overdrawn strokes read
  as one trunk line, splitting into three individually-arrowheaded branches only at the bus point
  (x=660) where they must diverge to reach distinct boxes. This is called out in detail, rule by
  rule, in `RULES-CHECK.md` (rules 2 and 11).
- **Semantic color (C1-C5), which the source has none of.** `producer` = origin blue, `message` =
  neutral grey (raw payload, per rule C3), `channel` = broker violet, `consumer` = destination
  green; every connector is colored by its destination, and its arrowhead inherits that color via
  `fill="context-stroke"` on a single shared `<marker>` def.

## Files

- `tokens.yaml` — local `eventing@0.1.0` token library (4 component-types, 2 relationship-types).
- `model.yaml` — the architecture model (6 components, 5 relationships).
- `validate.txt` — `node dist/cli.js validate` output, exit 0, first try.
- `layout.json` — layout contract v0.1 geometry for all 6 nodes and 5 edges.
- `generate.txt` — `node tools/offline-generate.mjs` output, exit 0, first try, no repair.
- `out.drawio` — generated draw.io XML (gate artifact, not the showcase deliverable).
- `final.svg` — hand-authored standalone SVG applying diagram-rules.md in full.
- `final.png` — 2x-scale headless-Chrome render of final.svg, visually inspected.
- `RULES-CHECK.md` — rule-by-rule PASS/N/A verdicts (25 PASS, 5 N/A, 0 FAIL).
