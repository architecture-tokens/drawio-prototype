#!/usr/bin/env node
// Offline stand-in for `archtokens generate` that never touches OpenAI.
//
// `run()` in dist/cli.js only calls the AI provider when no `planner` argument
// is supplied (`planner ?? new OpenAIPlanner(...)`), so passing our own
// `plannerStub` here short-circuits that `??` and `OpenAIPlanner` is never
// constructed — meaning `process.env.OPENAI_API_KEY` is never read and no
// network call is ever made. This lets showcase examples be regenerated
// deterministically from a pre-authored layout.json.
import { readFileSync } from 'node:fs';
import { run } from '../dist/cli.js';

const usage =
  'Usage:\n  node tools/offline-generate.mjs <model.yaml|json> <layout.json> --out <diagram.drawio> [--view view.yaml|json] [--library file] [--policy file]\n';

function parseArgs(argv) {
  const [model, layoutPath, ...rest] = argv;
  const libraries = [];
  const policies = [];
  let out;
  let view;
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i];
    const value = rest[i + 1];
    if (flag === '--out' && value) {
      out = value;
      i += 1;
    } else if (flag === '--library' && value) {
      libraries.push(value);
      i += 1;
    } else if (flag === '--policy' && value) {
      policies.push(value);
      i += 1;
    } else if (flag === '--view' && value) {
      view = value;
      i += 1;
    } else {
      return { error: `Unknown or incomplete option: ${flag}\n${usage}` };
    }
  }
  if (!model || !layoutPath || !out) return { error: usage };
  return { model, layoutPath, out, view, libraries, policies };
}

// Exported so tests can drive the offline harness in-process (same pattern
// as `run()` in src/cli.ts) instead of shelling out to a child process.
export async function runOffline(argv) {
  const parsed = parseArgs(argv);
  if (parsed.error) {
    return { exitCode: 2, stdout: '', stderr: parsed.error };
  }
  const { model, layoutPath, out, view, libraries, policies } = parsed;

  let layout;
  try {
    layout = JSON.parse(readFileSync(layoutPath, 'utf8'));
  } catch (cause) {
    return {
      exitCode: 2,
      stdout: '',
      stderr: `Could not read layout file ${layoutPath}: ${cause instanceof Error ? cause.message : String(cause)}\n`,
    };
  }

  // Returns the same pre-authored layout on every call, including the
  // repair retry `run()` makes when the first attempt fails validation — so
  // an invalid layout.json surfaces as the CLI's normal exit code 4
  // (INVALID_LAYOUT) rather than being silently "fixed" by a second call.
  const plannerStub = {
    async plan() {
      return layout;
    },
  };

  const cliArgv = [
    'generate',
    model,
    '--out',
    out,
    ...(view ? ['--view', view] : []),
    ...libraries.flatMap((file) => ['--library', file]),
    ...policies.flatMap((file) => ['--policy', file]),
  ];

  return run(cliArgv, plannerStub);
}

async function main() {
  const result = await runOffline(process.argv.slice(2));
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}

if (process.argv[1]?.endsWith('/offline-generate.mjs')) await main();
