# ChatGPT Subscription planner benchmark

This harness evaluates planner-produced layouts for the five checked-in
Architecture Tokens showcase models. It does not use the OpenAI SDK or
`OPENAI_API_KEY`. Live calls use the machine's existing ChatGPT Subscription
login through a foreground `codex exec` process.

## What is scored

Each example receives a score out of 100:

| Check                       | Points | Evidence                                                                  |
| --------------------------- | -----: | ------------------------------------------------------------------------- |
| Complete model IDs          |     20 | No missing, invented, or duplicate component/relationship layout IDs      |
| Declared direction          |     15 | Full gate agrees with `view-reproduce.yaml`'s `flow.direction`            |
| No unintended crossings     |     20 | No `EDGE_CROSSING` or unrelated `INVALID_EDGE_JUNCTION`                   |
| No collisions               |     20 | No `NODE_COLLISION` or `CHILD_OUTSIDE_PARENT`                             |
| Uniform connector treatment |     10 | Render baseline passes rules 3a (uniform radius) and 8 (uniform width)    |
| Cross-layer full gate       |     15 | `rules-lint --full` reports zero failures across model/view/census/layout |

The layout is validated before scoring. Any invalid layout or failed score/gate
causes exactly one repair request. The repaired result is evaluated once and the
run then stops: a second failure writes a failed report and exits `1`.

Planner prompts make the geometry contract explicit: root coordinates are
canvas-absolute, child coordinates are parent-relative, and every child must fit
fully inside its parent. Unrelated boxes may not overlap. Connector waypoints
use absolute canvas coordinates and orthogonal segments which must follow the
declared flow direction while avoiding boxes, unintended crossings, and
unrelated T-junctions. Crossing allowances may express verified source intent;
they are never a mechanism for hiding a newly created crossing.

Repair prompts receive only stable, local diagnostics. Each item has a sanitized
code, path, and generic message, plus a model-whitelisted `elementId` and up to
eight `relatedIds` when the validator can identify the involved elements. For
example, a child containment failure can identify
`/layout/nodes/2`, `build_a`, and its related parent `build_stage`; a collision
identifies both node IDs. Raw linter messages and provider content are never
forwarded.

The full gate uses the example's checked-in `final-reproduce.svg` as the
renderer baseline and substitutes the candidate layout for the layout-dependent
checks. Candidate geometry is validated independently first. When the fixed SVG
contains a crossing whose intent exists only in the verified source (the C4
fixture is the current case), the SVG gate reuses that checked-in source-intent
allowlist; the planner is not asked to guess information absent from model +
view. This keeps line radius/width a renderer responsibility while evaluating
the planner's IDs, direction, topology, and geometry from its own layout.

## Offline five-example gate

No subscription call is made by the fixture provider:

```shell
npm run benchmark:fixture
```

This runs all five examples using their checked-in `layout-reproduce.json`
files. Every generated `*.report.json` must conform to
`benchmark/report.schema.json` and score 100 with zero full-gate failures.

## Live command contract

First verify the existing local subscription login:

```shell
codex login status
# Required result: Logged in using ChatGPT
```

Run one example per foreground chunk. The default timeout is 540 seconds and
the CLI rejects values above 600 seconds:

```shell
npm run build
node tools/subscription-benchmark.mjs \
  --provider codex \
  --example 1-cloud-web-app \
  --timeout-seconds 540 \
  --out .benchmark-results/live/1-cloud-web-app.report.json
```

Repeat as separate guarded foreground commands for `2-cicd-flow`,
`3-microservices-c4`, `4-kubernetes`, and `5-event-pipeline`. Live `--all` is
intentionally rejected so no command can silently become a multi-call,
long-running subscription job.

Internally each attempt uses this fixed execution shape:

```text
codex exec -C <repo> --sandbox workspace-write \
  -c model_reasoning_effort='"medium"' --json --ephemeral \
  --output-schema benchmark/layout-output.schema.json \
  -o <private-temporary-file> '<prompt>' < /dev/null
```

The child has ignored/closed stdin. JSONL stdout and stderr are drained and
discarded. Only the final-output private file is read; it lives in a mode-0700
temporary directory, is bounded to 2 MiB, overwritten, and removed in `finally`.
Provider timeout, auth, start, output-limit, non-JSON, and gate failures surface
only stable error codes.

## Published-artifact safety

Reports contain only:

- a model-ID-filtered layout with numeric geometry;
- stable, sanitized diagnostics;
- repair count, score checks, and aggregate gate counts.

Unknown response fields and unresolved IDs are removed. Raw prompts, raw model
responses, Codex JSONL events, stderr, authentication material, and provider
exception messages are never written to reports or printed by the harness.
Environment variables whose names match OpenAI API-key forms are excluded from
the child process without consulting their values.
