import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  benchmarkExampleIds,
  runBenchmarkCase,
  type BenchmarkExampleId,
  type BenchmarkProviderName,
  type FullGateReport,
  type FullGateRunner,
} from './benchmark.js';
import {
  BenchmarkProviderError,
  CodexSubscriptionPlanner,
  DEFAULT_CODEX_CHUNK_SECONDS,
  MAX_CODEX_CHUNK_SECONDS,
} from './codex-provider.js';
import { writeAtomic } from './drawio.js';
import { layoutSchema } from './layout.js';
import type { ArchitectureView, Layout, Planner, RunResult } from './types.js';
import { loadAndValidate } from './validate.js';
import { loadAndValidateView } from './view.js';

const root = path.resolve(import.meta.dirname, '..');
const reportSchemaFile = path.join(root, 'benchmark', 'report.schema.json');
const outputSchemaFile = path.join(root, 'benchmark', 'layout-output.schema.json');
const Ajv = Ajv2020 as unknown as new (options: object) => any;
const validateReport = new Ajv({ allErrors: true, strict: true }).compile(
  JSON.parse(fs.readFileSync(reportSchemaFile, 'utf8')),
);

type Options = {
  provider?: BenchmarkProviderName;
  example?: BenchmarkExampleId;
  all: boolean;
  out?: string;
  outDir?: string;
  timeoutSeconds: number;
};

const usage = `Usage:
  node tools/subscription-benchmark.mjs --provider codex --example <id> --out <report.json> [--timeout-seconds 1..600]
  node tools/subscription-benchmark.mjs --provider fixture --all --out-dir <directory>

Live runs accept exactly one example per foreground codex exec chunk. Example ids:
  ${benchmarkExampleIds.join(', ')}`;

function parse(argv: string[]): { options: Options; error?: string } {
  const options: Options = { all: false, timeoutSeconds: DEFAULT_CODEX_CHUNK_SECONDS };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === '--provider' && (value === 'codex' || value === 'fixture')) {
      options.provider = value === 'codex' ? 'codex-subscription' : 'fixture';
      index += 1;
    } else if (flag === '--example' && benchmarkExampleIds.includes(value as BenchmarkExampleId)) {
      options.example = value as BenchmarkExampleId;
      index += 1;
    } else if (flag === '--all') options.all = true;
    else if (flag === '--out' && value) {
      options.out = value;
      index += 1;
    } else if (flag === '--out-dir' && value) {
      options.outDir = value;
      index += 1;
    } else if (flag === '--timeout-seconds' && value && /^\d+$/.test(value)) {
      options.timeoutSeconds = Number(value);
      index += 1;
    } else return { options, error: usage };
  }
  if (
    !options.provider ||
    options.timeoutSeconds < 1 ||
    options.timeoutSeconds > MAX_CODEX_CHUNK_SECONDS ||
    options.all === Boolean(options.example) ||
    (options.all && !options.outDir) ||
    (options.example && !options.out) ||
    (options.provider === 'codex-subscription' && options.all)
  )
    return { options, error: usage };
  return { options };
}

const filesFor = (example: BenchmarkExampleId) => {
  const directory = path.join(root, 'examples', 'showcase', example);
  return {
    directory,
    model: path.join(directory, 'model.yaml'),
    view: path.join(directory, 'view-reproduce.yaml'),
    library: path.join(directory, 'tokens.yaml'),
    fixtureLayout: path.join(directory, 'layout-reproduce.json'),
    svg: path.join(directory, 'final-reproduce.svg'),
    census: path.join(directory, 'census.yaml'),
  };
};

function rulesGate(example: BenchmarkExampleId): FullGateRunner {
  const files = filesFor(example);
  const sourceLayout = JSON.parse(fs.readFileSync(files.fixtureLayout, 'utf8')) as Layout;
  return async (layout: Layout): Promise<FullGateReport> => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'archtokens-benchmark-'));
    const layoutFile = path.join(temporaryDirectory, 'layout.json');
    // The fixed reproduce SVG may contain crossings whose intent comes only from
    // the source diagram (C4 is the current example). Candidate geometry is
    // validated independently before this gate, so preserve the verified source
    // allowance solely while linting that fixed SVG instead of asking the model
    // to guess source-only intent from model + view.
    const gateLayout = applySourceTopologyContract(layout, sourceLayout);
    fs.writeFileSync(layoutFile, `${JSON.stringify(gateLayout, null, 2)}\n`, 'utf8');
    try {
      const result = spawnSync(
        process.execPath,
        [
          path.join(root, 'tools', 'rules-lint.mjs'),
          files.svg,
          '--full',
          '--model',
          files.model,
          '--view',
          files.view,
          '--census',
          files.census,
          '--layout',
          layoutFile,
          '--format',
          'json',
        ],
        { encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024 },
      );
      if (result.error || (result.status !== 0 && result.status !== 1))
        throw new BenchmarkProviderError('BENCHMARK_FULL_GATE_FAILED');
      const reports = JSON.parse(result.stdout);
      if (!Array.isArray(reports) || reports.length !== 1)
        throw new BenchmarkProviderError('BENCHMARK_FULL_GATE_INVALID_REPORT');
      return reports[0] as FullGateReport;
    } catch (cause) {
      if (cause instanceof BenchmarkProviderError) throw cause;
      throw new BenchmarkProviderError('BENCHMARK_FULL_GATE_INVALID_REPORT');
    } finally {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  };
}

export function applySourceTopologyContract(candidate: Layout, sourceLayout: Layout): Layout {
  if (!sourceLayout.topology) return candidate;
  return {
    ...candidate,
    topology: {
      allowEdgeCrossings: sourceLayout.topology.allowEdgeCrossings.map(({ edgeIds }) => ({
        edgeIds: [...edgeIds] as [string, string],
      })),
    },
  };
}

type Dependencies = {
  providerFactory?: (input: {
    provider: BenchmarkProviderName;
    example: BenchmarkExampleId;
    timeoutSeconds: number;
  }) => Planner;
  gateFactory?: (example: BenchmarkExampleId) => FullGateRunner;
};

const fixturePlanner = (file: string): Planner => ({
  async plan() {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  },
});

function defaultProvider(input: {
  provider: BenchmarkProviderName;
  example: BenchmarkExampleId;
  timeoutSeconds: number;
}): Planner {
  const files = filesFor(input.example);
  return input.provider === 'fixture'
    ? fixturePlanner(files.fixtureLayout)
    : new CodexSubscriptionPlanner({
        cwd: root,
        outputSchemaFile,
        timeoutSeconds: input.timeoutSeconds,
      });
}

async function runOne(
  example: BenchmarkExampleId,
  providerName: BenchmarkProviderName,
  timeoutSeconds: number,
  output: string,
  dependencies: Dependencies,
) {
  const files = filesFor(example);
  const loaded = loadAndValidate(files.model, [files.library], []);
  if (!loaded.report.valid || !loaded.model || !loaded.normalized)
    throw new BenchmarkProviderError('BENCHMARK_MODEL_INVALID');
  const loadedView = loadAndValidateView(files.view, files.model, loaded.model);
  if (!loadedView.report.valid || !loadedView.view)
    throw new BenchmarkProviderError('BENCHMARK_VIEW_INVALID');
  const provider = (dependencies.providerFactory ?? defaultProvider)({
    provider: providerName,
    example,
    timeoutSeconds,
  });
  const report = await runBenchmarkCase({
    example,
    providerName,
    provider,
    architecture: loaded.normalized,
    model: loaded.model,
    view: loadedView.view as ArchitectureView,
    schema: layoutSchema,
    fullGate: (dependencies.gateFactory ?? rulesGate)(example),
  });
  if (!validateReport(report)) throw new BenchmarkProviderError('BENCHMARK_REPORT_SCHEMA_INVALID');
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  writeAtomic(output, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

export async function runBenchmarkCli(
  argv: string[],
  dependencies: Dependencies = {},
): Promise<RunResult> {
  const parsed = parse(argv);
  if (parsed.error) return { exitCode: 2, stdout: '', stderr: `${parsed.error}\n` };
  const { provider, timeoutSeconds } = parsed.options;
  const examples = parsed.options.all ? [...benchmarkExampleIds] : [parsed.options.example!];
  const lines: string[] = [];
  let failed = false;
  try {
    for (const example of examples) {
      const output = parsed.options.all
        ? path.join(parsed.options.outDir!, `${example}.report.json`)
        : parsed.options.out!;
      const report = await runOne(example, provider!, timeoutSeconds, output, dependencies);
      failed ||= report.status === 'failed';
      lines.push(
        `${example}: ${report.status}, score=${report.score.total}/100, repairs=${report.repairCount}`,
      );
    }
  } catch (cause) {
    const code =
      cause instanceof BenchmarkProviderError ? cause.code : 'BENCHMARK_INTERNAL_FAILURE';
    return { exitCode: 3, stdout: '', stderr: `Benchmark failed: ${code}.\n` };
  }
  return { exitCode: failed ? 1 : 0, stdout: `${lines.join('\n')}\n`, stderr: '' };
}

export const benchmarkLayoutSchema = layoutSchema;
