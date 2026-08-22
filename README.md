# Architecture Tokens draw.io prototype

`archtokens` validates an [Architecture Tokens](https://github.com/architecture-tokens/spec) model and produces editable draw.io (`mxGraph`) XML. It is a Node.js 24+ TypeScript CLI released under Apache-2.0.

```sh
npm install
npm run build
archtokens validate examples/payments.yaml --policy examples/policies.yaml
archtokens generate examples/payments.yaml --out payments.drawio --policy examples/policies.yaml
```

Validation accepts YAML or JSON and uses the immutable specification dependency commit `50729a0912e190979a122e1c2b31fdf3c367f2e5`. Built-in libraries are `core`, `security`, `environment`, and `lifecycle`; add YAML libraries and policy sets with repeatable `--library file` and `--policy file` flags. The CLI never fetches libraries at runtime.

## Commands and exit codes

```text
archtokens validate <model.yaml|json> [--library file] [--policy file] [--format human|json]
archtokens generate <model> --out <diagram.drawio> [--library file] [--policy file] [--format human|json] [--ai-model name]
```

Exit codes are stable: `0` success, `1` schema/semantic validation diagnostics, `2` usage/input/I/O, `3` AI provider error or refusal, `4` invalid AI layout after its one repair attempt, and `5` output generation/write failure. Human reports include severity, code, path, element/rule when supplied, message, and remediation. `--format json` prints the specification report.

Generation checks every model, library, and policy schema before semantic validation. Invalid input never reaches the planner. The planner interface receives only normalized renderer input and the local version-0.1 layout schema. The default uses the official OpenAI JavaScript SDK Responses API with structured output; model precedence is `--ai-model`, `ARCHTOKENS_OPENAI_MODEL`, then `gpt-5.6`. Set `OPENAI_API_KEY` only for a real generation. Keys, full models/prompts, and full provider responses are not logged.

The strict layout contract is version `0.1`: it has a positive integer canvas, exactly one finite non-negative integer geometry record for every component, and one edge record for every relationship. `parentId` is always a string or `null`; `waypoints` is always an array. It rejects invented, missing, duplicate, malformed, or cyclic IDs/parents/waypoints. One repair includes the normalized architecture, the prior invalid layout, and only stable `{code,message}` errors. Only a validated layout is rendered, and output writes atomically.

`examples/golden-layout.json` and `examples/golden.drawio` are an offline reproducible demo. `npm run check` runs non-mutating formatting/lint, type checks, tests, and build. The live OpenAI verification is intentionally skipped: tests inject a planner and make no real provider request.
