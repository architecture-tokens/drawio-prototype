#!/usr/bin/env node
import { renderDrawio, writeAtomic } from './drawio.js';
import { validateLayout } from './layout.js';
import { defaultLayoutSchema, OpenAIPlanner, resolveModel } from './planner.js';
import { writeSourceArtifacts } from './source-import.js';
import type { Planner, Report, RunResult } from './types.js';
import { loadAndValidate } from './validate.js';
import { loadAndValidateView } from './view.js';

type Options = {
  libraries: string[];
  policies: string[];
  format: 'human' | 'json';
  out?: string;
  aiModel?: string;
  view?: string;
};
const usage =
  'Usage:\n  archtokens validate <model.yaml|json> [--library file] [--policy file] [--format human|json]\n  archtokens generate <model.yaml|json> --out <diagram.drawio> [--view view.yaml|json] [--library file] [--policy file] [--format human|json] [--ai-model name]\n  archtokens import-source <source.drawio|xml|mmd> --out <inventory.json> [--layout-out <source-layout.json>]\n  archtokens scaffold-census <source.drawio|xml|mmd> --out <census.yaml> --model <model.yaml> [--classifications <mappings.yaml>] [--inventory-out <inventory.json>] [--layout-out <source-layout.json>]';
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
    } else if (flag === '--view' && value) {
      options.view = value;
      i += 1;
    } else if (flag === '--format' && (value === 'human' || value === 'json')) {
      options.format = value;
      i += 1;
    } else return { command, model, options, error: `Unknown or incomplete option: ${flag}` };
  }
  if (
    !['validate', 'generate'].includes(command ?? '') ||
    !model ||
    (command === 'generate' && !options.out) ||
    (command === 'validate' && options.view !== undefined)
  )
    return { command, model, options, error: usage };
  return { command, model, options };
}

type SourceCommandOptions = {
  out?: string;
  model?: string;
  classifications?: string;
  inventoryOut?: string;
  layoutOut?: string;
};

function parseSourceCommand(argv: string[]): {
  command: 'import-source' | 'scaffold-census';
  source?: string;
  options: SourceCommandOptions;
  error?: string;
} {
  const [rawCommand, source, ...rest] = argv;
  const command = rawCommand as 'import-source' | 'scaffold-census';
  const options: SourceCommandOptions = {};
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!value) return { command, source, options, error: usage };
    if (flag === '--out') options.out = value;
    else if (flag === '--model') options.model = value;
    else if (flag === '--classifications') options.classifications = value;
    else if (flag === '--inventory-out') options.inventoryOut = value;
    else if (flag === '--layout-out') options.layoutOut = value;
    else return { command, source, options, error: `Unknown or incomplete option: ${flag}` };
    index += 1;
  }
  if (
    !source ||
    !options.out ||
    (command === 'scaffold-census' && !options.model) ||
    (command === 'import-source' &&
      (options.model || options.classifications || options.inventoryOut))
  )
    return { command, source, options, error: usage };
  return { command, source, options };
}

function runSourceCommand(argv: string[]): RunResult {
  const parsed = parseSourceCommand(argv);
  if (parsed.error) return { exitCode: 2, stdout: '', stderr: `${parsed.error}\n` };
  try {
    if (parsed.command === 'import-source') {
      const result = writeSourceArtifacts({
        sourcePath: parsed.source!,
        inventoryOut: parsed.options.out,
        ...(parsed.options.layoutOut ? { layoutOut: parsed.options.layoutOut } : {}),
      });
      return {
        exitCode: 0,
        stdout: `Wrote ${parsed.options.out}: ${result.inventory.counts.vertices} vertices, ${result.inventory.counts.edges} edges, ${result.todoCount} classification TODOs.\n`,
        stderr: '',
      };
    }
    const result = writeSourceArtifacts({
      sourcePath: parsed.source!,
      censusOut: parsed.options.out,
      modelPath: parsed.options.model,
      ...(parsed.options.classifications
        ? { classificationsPath: parsed.options.classifications }
        : {}),
      ...(parsed.options.inventoryOut ? { inventoryOut: parsed.options.inventoryOut } : {}),
      ...(parsed.options.layoutOut ? { layoutOut: parsed.options.layoutOut } : {}),
    });
    return {
      exitCode: 0,
      stdout: `Wrote ${parsed.options.out}: ${result.inventory.counts.total} source records, ${result.todoCount} classification TODOs.\n`,
      stderr: '',
    };
  } catch (cause) {
    return {
      exitCode: 2,
      stdout: '',
      stderr: `Source import error: ${cause instanceof Error ? cause.message : String(cause)}\n`,
    };
  }
}

export async function run(argv: string[], planner?: Planner): Promise<RunResult> {
  if (argv[0] === 'import-source' || argv[0] === 'scaffold-census') return runSourceCommand(argv);
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
  let view;
  if (options.view) {
    const loadedView = loadAndValidateView(options.view, model, loaded.model);
    if (!loadedView.report.valid) {
      const inputError = loadedView.report.diagnostics.some((d) => d.code === 'VIEW_INPUT_IO');
      return {
        exitCode: inputError ? 2 : 1,
        stdout: options.format === 'json' ? `${formatReport(loadedView.report, 'json')}\n` : '',
        stderr: options.format === 'human' ? `${formatReport(loadedView.report, 'human')}\n` : '',
      };
    }
    view = loadedView.view;
  }
  const activePlanner = planner ?? new OpenAIPlanner(resolveModel(options.aiModel));
  let layout: unknown;
  try {
    layout = await activePlanner.plan({
      architecture: loaded.normalized,
      ...(view ? { view } : {}),
      schema: defaultLayoutSchema,
    });
  } catch {
    return {
      exitCode: 3,
      stdout: '',
      stderr: 'AI provider error.\n',
    };
  }
  let layoutReport = validateLayout(layout, loaded.model);
  if (!layoutReport.valid) {
    try {
      layout = await activePlanner.plan({
        architecture: loaded.normalized,
        ...(view ? { view } : {}),
        schema: defaultLayoutSchema,
        previousLayout: layout,
        errors: layoutReport.diagnostics.map(({ code, message }) => ({ code, message })),
      });
    } catch {
      return {
        exitCode: 3,
        stdout: '',
        stderr: 'AI provider error.\n',
      };
    }
    layoutReport = validateLayout(layout, loaded.model);
    if (!layoutReport.valid)
      return { exitCode: 4, stdout: '', stderr: `${formatReport(layoutReport, 'human')}\n` };
  }
  try {
    writeAtomic(options.out!, renderDrawio(loaded.model, layout as any, view));
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
