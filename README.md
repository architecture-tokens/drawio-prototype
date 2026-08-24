# Architecture Tokens draw.io prototype

`archtokens` validates an [Architecture Tokens](https://github.com/architecture-tokens/spec) model and produces editable draw.io (`mxGraph`) XML. It is a Node.js 24+ TypeScript CLI released under Apache-2.0.

```sh
npm install
npm run build
archtokens validate examples/payments.yaml --policy examples/policies.yaml
archtokens generate examples/payments.yaml --out payments.drawio --view examples/payments-view.yaml --policy examples/policies.yaml
npm run pipeline -- --example examples/showcase/1-cloud-web-app --out-dir /tmp/cloud-pipeline
```

Validation accepts YAML or JSON and uses the immutable specification dependency commit `207a608684914dc97fac17c5caff044491b2d848`. Built-in libraries are `core`, `security`, `environment`, and `lifecycle`; add YAML libraries and policy sets with repeatable `--library file` and `--policy file` flags. The CLI never fetches libraries at runtime.

## Commands and exit codes

```text
archtokens validate <model.yaml|json> [--library file] [--policy file] [--format human|json]
archtokens generate <model> --out <diagram.drawio> [--view view.yaml|json] [--library file] [--policy file] [--format human|json] [--ai-model name]
archtokens import-source <source.drawio|xml|mmd> --out <inventory.json> [--layout-out <source-layout.json>]
archtokens scaffold-census <source.drawio|xml|mmd> --out <census.yaml> --model <model.yaml> [--classifications <mappings.yaml>] [--inventory-out <inventory.json>] [--layout-out <source-layout.json>]
```

Exit codes are stable: `0` success, `1` schema/semantic validation diagnostics, `2` usage/input/I/O, `3` AI provider error or refusal, `4` invalid AI layout after its one repair attempt, and `5` output generation/write failure. Human reports include severity, code, path, element/rule when supplied, message, and remediation. `--format json` prints the specification report.

Source import accepts uncompressed or compressed draw.io files, bare mxGraph XML, Mermaid flowcharts, and Mermaid C4 diagrams. It writes a byte-deterministic inventory and optional source-layout projection with stable source IDs, exact element counts, declared/inferred direction, containment, mxGraph geometry, and edge control points. `scaffold-census` emits one record for every imported source element. Unclassified semantics remain explicit `primary_bucket: TODO` records and `SOURCE_CLASSIFICATION_TODO` diagnostics; they are never silently dropped. A separate classification mapping turns the scaffold into a normal five-bucket census. See [source import and census scaffolding](docs/source-import.md) for formats and verified examples.

Generation checks every model, library, policy, and optional architecture-view schema before semantic validation. A view is presentation-only and must use version `0.1.0`, declare `reproduce` or `restyle`, resolve its component/relationship attachment owners and visual-element members against the model, and use owner-appropriate anchors. Invalid input never reaches the planner. The planner interface receives only normalized renderer input, the validated optional view, and the local version-0.1 layout schema. Omitting `--view` preserves the original model-only behavior. The default uses the official OpenAI JavaScript SDK Responses API with structured output; model precedence is `--ai-model`, `ARCHTOKENS_OPENAI_MODEL`, then `gpt-5.6`. Set `OPENAI_API_KEY` only for a real generation. Keys, full models/prompts, and full provider responses are not logged.

With `--view`, the renderer maps a closed visual vocabulary to editable built-in draw.io stencils and emits component, relationship, token, attachment, and visual-element trace attributes. Unknown icons or visual group kinds fail explicitly instead of disappearing from output. See the [Architecture View rendering contract](docs/view-rendering.md) for registry precedence, structural-overlay inference, trace metadata, and the offline cloud reproduction command.

The strict layout contract is version `0.1`: it has a positive integer canvas, exactly one finite non-negative integer geometry record for every component, and one edge record for every relationship. `parentId` is always a string or `null`; `waypoints` is always an array. It rejects invented, missing, duplicate, malformed, cyclic, colliding, or topologically invalid geometry before rendering. Orthogonal routes cannot cross or form unrelated T-junctions; shared semantic buses and structural containment remain valid. A reproduce layout may declare an exact relationship pair under optional `topology.allowEdgeCrossings` when the source intentionally contains a crossing that geometry cannot infer. See [visual topology validation](docs/visual-topology.md) for the inference and allowance boundaries. One repair includes the normalized architecture, the prior invalid layout, and only stable `{code,message}` errors. Only a validated layout is rendered, and output writes atomically.

`examples/golden-layout.json` and `examples/golden.drawio` are an offline reproducible demo. `npm run check` runs non-mutating formatting/lint, type checks, tests, and build. The live OpenAI verification is intentionally skipped: tests inject a planner and make no real provider request.

## One-command integration pipeline

`npm run pipeline -- --example <showcase-dir> --out-dir <directory>` is the complete offline boundary. One command builds the CLI, imports the original draw.io/Mermaid source into deterministic inventory evidence, validates the Architecture Tokens model and Architecture View, validates and renders `layout-reproduce.json` into editable draw.io, then runs the cross-layer `rules-lint --full` gate. It never dispatches a provider: the checked-in authored layout is injected as the offline planner result.

Run all five examples and generate the gate matrix from the resulting reports:

```sh
npm run pipeline -- --all --out-dir /tmp/architecture-pipeline --matrix-out docs/gate-matrix.md
```

Each example output contains `source-inventory.json`, `source-layout.json`, `out.drawio`, `gate-report.json`, and `pipeline-report.json`. The source-layout file is extraction evidence; Mermaid has no coordinates, so rendering truthfully uses the separate checked-in `layout-reproduce.json`. See the [pipeline contract](docs/architecture-pipeline.md) and [generated gate matrix](docs/gate-matrix.md).

The five-example [ChatGPT Subscription planner benchmark](./docs/subscription-planner-benchmark.md) is a separate, bounded foreground harness. Its live provider uses local `codex exec` subscription authentication, never `OPENAI_API_KEY`, and publishes only schema-checked redacted layouts and scores. `npm run benchmark:fixture` exercises all five gates without making a live call.
