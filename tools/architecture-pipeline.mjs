#!/usr/bin/env node
// Offline integration pipeline: source evidence -> validated model/view/layout ->
// editable draw.io -> cross-layer full gate. A planner is always injected, so
// this tool never reads OPENAI_API_KEY and never makes a provider call.
import fs from 'node:fs';
import path from 'node:path';
import { run as runArchitectureCli } from '../dist/cli.js';
import { writeAtomic } from '../dist/drawio.js';
import {
  importSourceFile,
  serializeSourceInventory,
  serializeSourceLayout,
  sourceLayout,
} from '../dist/source-import.js';
import { runCli as runRulesLint } from './rules-lint.mjs';

const usage =
  'Usage:\n  node tools/architecture-pipeline.mjs --example <showcase-dir> --out-dir <directory>\n  node tools/architecture-pipeline.mjs --all --out-dir <directory> [--showcase-root <directory>] [--matrix-out <gate-matrix.md>]\n';

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

const required = (file, label) => {
  if (!fs.existsSync(file)) throw new Error(`Missing ${label}: ${file}`);
  return file;
};

const sourceIn = (exampleDir) => {
  for (const name of ['source.drawio', 'source.xml', 'source.mmd']) {
    const candidate = path.join(exampleDir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`Missing source.drawio, source.xml, or source.mmd in ${exampleDir}`);
};

export async function runPipeline({ exampleDir, outDir }) {
  const resolvedExample = path.resolve(exampleDir);
  const resolvedOut = path.resolve(outDir);
  fs.mkdirSync(resolvedOut, { recursive: true });

  const model = required(path.join(resolvedExample, 'model.yaml'), 'model');
  const view = required(path.join(resolvedExample, 'view-reproduce.yaml'), 'view');
  const layoutPath = required(
    path.join(resolvedExample, 'layout-reproduce.json'),
    'reproduce layout',
  );
  const census = required(path.join(resolvedExample, 'census.yaml'), 'census');
  const svg = required(path.join(resolvedExample, 'final-reproduce.svg'), 'reproduce SVG');
  const source = sourceIn(resolvedExample);
  const library = path.join(resolvedExample, 'tokens.yaml');
  const outputDrawio = path.join(resolvedOut, 'out.drawio');
  const inventoryOutput = path.join(resolvedOut, 'source-inventory.json');
  const sourceLayoutOutput = path.join(resolvedOut, 'source-layout.json');
  const gateOutput = path.join(resolvedOut, 'gate-report.json');
  const pipelineOutput = path.join(resolvedOut, 'pipeline-report.json');

  const inventory = importSourceFile(source);
  writeAtomic(inventoryOutput, serializeSourceInventory(inventory));
  writeAtomic(sourceLayoutOutput, serializeSourceLayout(sourceLayout(inventory)));

  const layout = JSON.parse(fs.readFileSync(layoutPath, 'utf8'));
  const planner = {
    async plan() {
      return layout;
    },
  };
  const generation = await runArchitectureCli(
    [
      'generate',
      model,
      '--out',
      outputDrawio,
      '--view',
      view,
      ...(fs.existsSync(library) ? ['--library', library] : []),
    ],
    planner,
  );

  const gate = await runRulesLint([
    svg,
    '--full',
    '--model',
    model,
    '--view',
    view,
    '--census',
    census,
    '--layout',
    layoutPath,
    '--format',
    'json',
  ]);
  const gateReport = JSON.parse(gate.stdout)[0];
  writeAtomic(gateOutput, json(gateReport));

  const report = {
    kind: 'architecture-pipeline-report',
    version: '0.1',
    example: path.basename(resolvedExample),
    source: {
      format: inventory.source.format,
      vertices: inventory.counts.vertices,
      edges: inventory.counts.edges,
      total: inventory.counts.total,
      inventory: path.basename(inventoryOutput),
      layout: path.basename(sourceLayoutOutput),
    },
    generation: {
      exitCode: generation.exitCode,
      stderr: generation.stderr.trim(),
      output: path.basename(outputDrawio),
      layout: path.basename(layoutPath),
    },
    gate: {
      exitCode: gate.exitCode,
      summary: gateReport.summary,
      output: path.basename(gateOutput),
    },
    ok: generation.exitCode === 0 && gate.exitCode === 0,
  };
  writeAtomic(pipelineOutput, json(report));
  return report;
}

export const gateMatrixMarkdown = (reports) => {
  const header = [
    'Example',
    'Source format',
    'Vertices / edges',
    'PASS',
    'FAIL',
    'WARN',
    'NOT-CHECKABLE',
    'Generate',
  ];
  const rows = reports.map((report) => [
    report.example,
    report.source.format,
    `${report.source.vertices} / ${report.source.edges}`,
    String(report.gate.summary.PASS),
    String(report.gate.summary.FAIL),
    String(report.gate.summary.WARN),
    String(report.gate.summary['NOT-CHECKABLE']),
    report.generation.exitCode === 0 ? 'PASS' : 'FAIL',
  ]);
  const widths = header.map((value, index) =>
    Math.max(value.length, ...rows.map((row) => row[index].length)),
  );
  const rightAligned = new Set([2, 3, 4, 5, 6]);
  const markdownRow = (row) =>
    `| ${row
      .map((value, index) =>
        rightAligned.has(index) ? value.padStart(widths[index]) : value.padEnd(widths[index]),
      )
      .join(' | ')} |`;
  const lines = [
    '# Architecture Tokens gate matrix',
    '',
    '> This file is generated from actual pipeline reports; do not edit gate counts by hand.',
    '',
    markdownRow(header),
    `| ${widths
      .map((width, index) =>
        rightAligned.has(index) ? `${'-'.repeat(width - 1)}:` : '-'.repeat(width),
      )
      .join(' | ')} |`,
  ];
  for (const row of rows) lines.push(markdownRow(row));
  lines.push(
    '',
    'Each row was produced by importing the checked-in source, validating the model and Architecture View, rendering with `layout-reproduce.json`, and running `rules-lint --full` against the cross-layer evidence.',
    '',
  );
  return lines.join('\n');
};

export async function runAllPipelines({ showcaseRoot, outDir, matrixOut }) {
  const root = path.resolve(showcaseRoot);
  const output = path.resolve(outDir);
  fs.mkdirSync(output, { recursive: true });
  const exampleDirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+-/.test(entry.name))
    .map((entry) => path.join(root, entry.name))
    .sort();
  const reports = [];
  for (const exampleDir of exampleDirs)
    reports.push(
      await runPipeline({
        exampleDir,
        outDir: path.join(output, path.basename(exampleDir)),
      }),
    );
  const result = {
    kind: 'architecture-pipeline-matrix',
    version: '0.1',
    reports,
    ok: reports.every((report) => report.ok),
  };
  writeAtomic(path.join(output, 'gate-matrix.json'), json(result));
  writeAtomic(
    matrixOut ? path.resolve(matrixOut) : path.join(output, 'gate-matrix.md'),
    gateMatrixMarkdown(reports),
  );
  return result;
}

function parse(argv) {
  let exampleDir;
  let outDir;
  let all = false;
  let showcaseRoot = 'examples/showcase';
  let matrixOut;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === '--all') all = true;
    else if (flag === '--example' && value) {
      exampleDir = value;
      index += 1;
    } else if (flag === '--out-dir' && value) {
      outDir = value;
      index += 1;
    } else if (flag === '--showcase-root' && value) {
      showcaseRoot = value;
      index += 1;
    } else if (flag === '--matrix-out' && value) {
      matrixOut = value;
      index += 1;
    } else return { error: `Unknown or incomplete option: ${flag}\n${usage}` };
  }
  if (!outDir || all === Boolean(exampleDir)) return { error: usage };
  return all ? { all, showcaseRoot, outDir, matrixOut } : { exampleDir, outDir };
}

export async function runCommand(argv) {
  const parsed = parse(argv);
  if (parsed.error) return { exitCode: 2, stdout: '', stderr: parsed.error };
  try {
    if (parsed.all) {
      const result = await runAllPipelines(parsed);
      const failures = result.reports.reduce(
        (total, report) => total + report.gate.summary.FAIL,
        0,
      );
      return {
        exitCode: result.ok ? 0 : 1,
        stdout: `${result.reports.length} examples: ${failures} full-gate FAIL; wrote ${path.resolve(parsed.matrixOut ?? path.join(parsed.outDir, 'gate-matrix.md'))}\n`,
        stderr: '',
      };
    }
    const report = await runPipeline(parsed);
    return {
      exitCode: report.ok ? 0 : 1,
      stdout: `${report.example}: ${report.gate.summary.PASS} PASS, ${report.gate.summary.FAIL} FAIL; wrote ${path.resolve(parsed.outDir, 'out.drawio')}\n`,
      stderr: report.generation.stderr ? `${report.generation.stderr}\n` : '',
    };
  } catch (cause) {
    return {
      exitCode: 2,
      stdout: '',
      stderr: `Pipeline error: ${cause instanceof Error ? cause.message : String(cause)}\n`,
    };
  }
}

if (process.argv[1]?.endsWith('/architecture-pipeline.mjs')) {
  const result = await runCommand(process.argv.slice(2));
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}
