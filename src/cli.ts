#!/usr/bin/env node
import { renderDrawio, writeAtomic } from './drawio.js';
import { validateLayout } from './layout.js';
import { defaultLayoutSchema, OpenAIPlanner } from './planner.js';
import type { Planner, Report, RunResult } from './types.js';
import { loadAndValidate } from './validate.js';

type Options = {
  libraries: string[];
  policies: string[];
  format: 'human' | 'json';
  out?: string;
  aiModel?: string;
};
const usage =
  'Usage:\n  archtokens validate <model.yaml|json> [--library file] [--policy file] [--format human|json]\n  archtokens generate <model.yaml|json> --out <diagram.drawio> [--library file] [--policy file] [--format human|json] [--ai-model name]';
const formatReport = (report: Report, format: Options['format']) =>
  format === 'json'
    ? JSON.stringify(report, null, 2)
    : report.diagnostics
        .map(
          (d) =>
            `[${d.severity}] ${d.code} ${d.path}${d.elementId ? ` element=${d.elementId}` : ''}${d.ruleId ? ` rule=${d.ruleId}` : ''}: ${d.message}${d.remediation ? ` Remediation: ${d.remediation}` : ''}`,
        )
        .join('\n');

function parse(argv: string[]): {
  command?: string;
  model?: string;
  options: Options;
  error?: string;
} {
  const options: Options = { libraries: [], policies: [], format: 'human' };
  const [command, model, ...rest] = argv;
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i];
    const value = rest[i + 1];
    if (flag === '--library' && value) {
      options.libraries.push(value);
      i += 1;
    } else if (flag === '--policy' && value) {
      options.policies.push(value);
      i += 1;
    } else if (flag === '--out' && value) {
      options.out = value;
      i += 1;
    } else if (flag === '--ai-model' && value) {
      options.aiModel = value;
      i += 1;
    } else if (flag === '--format' && (value === 'human' || value === 'json')) {
      options.format = value;
      i += 1;
    } else return { command, model, options, error: `Unknown or incomplete option: ${flag}` };
  }
  if (
    !['validate', 'generate'].includes(command ?? '') ||
    !model ||
    (command === 'generate' && !options.out)
  )
    return { command, model, options, error: usage };
  return { command, model, options };
}

export async function run(argv: string[], planner?: Planner): Promise<RunResult> {
  const parsed = parse(argv);
  if (parsed.error) return { exitCode: 2, stdout: '', stderr: `${parsed.error}\n` };
  const { command, model, options } = parsed as Required<
    Pick<typeof parsed, 'command' | 'model' | 'options'>
  >;
  const loaded = loadAndValidate(model, options.libraries, options.policies);
  if (!loaded.report.valid) {
    const inputError = loaded.report.diagnostics.some((d) => d.code === 'INPUT_IO');
    return {
      exitCode: inputError ? 2 : 1,
      stdout: options.format === 'json' ? `${formatReport(loaded.report, 'json')}\n` : '',
      stderr: options.format === 'human' ? `${formatReport(loaded.report, 'human')}\n` : '',
    };
  }
  if (command === 'validate')
    return {
      exitCode: 0,
      stdout:
        options.format === 'json'
          ? `${formatReport(loaded.report, 'json')}\n`
          : 'Validation passed.\n',
      stderr: '',
    };
  const activePlanner =
    planner ??
    new OpenAIPlanner(options.aiModel ?? process.env.ARCHTOKENS_OPENAI_MODEL ?? 'gpt-5.6');
  let layout: unknown;
  try {
    layout = await activePlanner.plan(loaded.normalized, defaultLayoutSchema);
  } catch (cause) {
    return {
      exitCode: 3,
      stdout: '',
      stderr: `AI provider error: ${cause instanceof Error ? cause.message : 'unknown provider failure'}\n`,
    };
  }
  let layoutReport = validateLayout(layout, loaded.model);
  if (!layoutReport.valid) {
    try {
      layout = await activePlanner.plan(
        loaded.normalized,
        defaultLayoutSchema,
        layoutReport.diagnostics.map((d) => `${d.code}: ${d.message}`),
      );
    } catch (cause) {
      return {
        exitCode: 3,
        stdout: '',
        stderr: `AI provider error: ${cause instanceof Error ? cause.message : 'unknown provider failure'}\n`,
      };
    }
    layoutReport = validateLayout(layout, loaded.model);
    if (!layoutReport.valid)
      return { exitCode: 4, stdout: '', stderr: `${formatReport(layoutReport, 'human')}\n` };
  }
  try {
    writeAtomic(options.out!, renderDrawio(loaded.model, layout as any));
  } catch (cause) {
    return {
      exitCode: 5,
      stdout: '',
      stderr: `Output error: ${cause instanceof Error ? cause.message : 'could not write output'}\n`,
    };
  }
  return { exitCode: 0, stdout: `Wrote ${options.out}.\n`, stderr: '' };
}

if (process.argv[1]?.endsWith('/cli.js'))
  run(process.argv.slice(2)).then((result) => {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exitCode = result.exitCode;
  });
