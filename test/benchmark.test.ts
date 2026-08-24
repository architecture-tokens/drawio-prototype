import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { applySourceTopologyContract, runBenchmarkCli } from '../src/benchmark-cli.js';
import type { FullGateReport } from '../src/benchmark.js';
import type { Planner, PlannerRequest } from '../src/types.js';

const root = path.resolve(import.meta.dirname, '..');
const fixtureGate: FullGateReport = {
  checks: [
    { id: '3a', status: 'PASS' },
    { id: '8', status: 'PASS' },
    { id: 'DIRECTION_GEOMETRY_CONFLICT', status: 'PASS' },
  ],
  summary: { PASS: 3, FAIL: 0, WARN: 0, 'NOT-CHECKABLE': 0 },
};

const sequencePlanner = (responses: unknown[]): Planner & { calls: PlannerRequest[] } => ({
  calls: [],
  async plan(request) {
    this.calls.push(request);
    return responses.shift();
  },
});

describe('subscription planner benchmark', () => {
  it('uses verified source-only crossing intent for the fixed SVG gate', () => {
    const candidate = {
      version: '0.1',
      canvas: { width: 10, height: 10 },
      nodes: [],
      edges: [],
      topology: { allowEdgeCrossings: [] },
    } as any;
    const source = {
      ...candidate,
      topology: { allowEdgeCrossings: [{ edgeIds: ['source-a', 'source-b'] }] },
    } as any;
    expect(applySourceTopologyContract(candidate, source).topology).toEqual(source.topology);
    expect(candidate.topology.allowEdgeCrossings).toEqual([]);
  });

  it('repairs a schema-valid full-gate failure once and accepts the repaired attempt', async () => {
    const layout = JSON.parse(
      fs.readFileSync(
        path.join(root, 'examples/showcase/5-event-pipeline/layout-reproduce.json'),
        'utf8',
      ),
    );
    const provider = sequencePlanner([layout, layout]);
    let gates = 0;
    const output = path.join(os.tmpdir(), `benchmark-gate-repair-${Date.now()}.json`);
    const result = await runBenchmarkCli(
      ['--provider', 'fixture', '--example', '5-event-pipeline', '--out', output],
      {
        providerFactory: () => provider,
        gateFactory: () => async () => {
          gates += 1;
          return gates === 1
            ? {
                checks: [
                  {
                    id: '3a',
                    status: 'FAIL',
                    message: 'Relationship channel-consumer-a has a connector corner mismatch.',
                  },
                  { id: '8', status: 'PASS' },
                  { id: 'DIRECTION_GEOMETRY_CONFLICT', status: 'PASS' },
                ],
                summary: { PASS: 2, FAIL: 1, WARN: 0, 'NOT-CHECKABLE': 0 },
              }
            : fixtureGate;
        },
      },
    );
    expect(result.exitCode).toBe(0);
    expect(provider.calls).toHaveLength(2);
    expect(provider.calls[1].errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'FULL_GATE_3A',
          message: 'Benchmark validation failed.',
          elementId: 'channel-consumer-a',
          relatedIds: ['channel', 'consumer-a'],
        }),
      ]),
    );
    expect(JSON.parse(fs.readFileSync(output, 'utf8'))).toMatchObject({
      status: 'passed',
      repairCount: 1,
      score: { total: 100 },
    });
  });

  it('identifies a child and its parent when containment needs repair', async () => {
    const layout = JSON.parse(
      fs.readFileSync(
        path.join(root, 'examples/showcase/2-cicd-flow/layout-reproduce.json'),
        'utf8',
      ),
    );
    const invalid = structuredClone(layout);
    invalid.nodes[2].x = 400;
    const provider = sequencePlanner([invalid, layout]);
    const output = path.join(os.tmpdir(), `benchmark-containment-${Date.now()}.json`);
    const result = await runBenchmarkCli(
      ['--provider', 'fixture', '--example', '2-cicd-flow', '--out', output],
      {
        providerFactory: () => provider,
        gateFactory: () => async () => fixtureGate,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(provider.calls).toHaveLength(2);
    expect(provider.calls[1].errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CHILD_OUTSIDE_PARENT',
          path: '/layout/nodes/2',
          elementId: 'build_a',
          relatedIds: ['build_stage'],
        }),
      ]),
    );
  });

  it('repairs a schema-valid visual collision exactly once and exits nonzero after a second failure', async () => {
    const layout = JSON.parse(
      fs.readFileSync(
        path.join(root, 'examples/showcase/5-event-pipeline/layout-reproduce.json'),
        'utf8',
      ),
    );
    const invalid = structuredClone(layout);
    Object.assign(invalid.nodes[1], {
      x: invalid.nodes[0].x,
      y: invalid.nodes[0].y,
      width: invalid.nodes[0].width,
      height: invalid.nodes[0].height,
    });
    const provider = sequencePlanner([invalid, invalid]);
    const output = path.join(os.tmpdir(), `benchmark-collision-${Date.now()}.json`);
    const result = await runBenchmarkCli(
      ['--provider', 'fixture', '--example', '5-event-pipeline', '--out', output],
      {
        providerFactory: () => provider,
        gateFactory: () => async () => fixtureGate,
      },
    );
    expect(result.exitCode).toBe(1);
    expect(provider.calls).toHaveLength(2);
    expect(provider.calls[1]).toMatchObject({
      previousLayout: invalid,
      errors: expect.arrayContaining([
        expect.objectContaining({
          code: 'NODE_COLLISION',
          message: 'Two unrelated nodes overlap.',
          path: '/layout/nodes/0',
          elementId: 'producer',
          relatedIds: ['message'],
        }),
      ]),
    });
    const report = JSON.parse(fs.readFileSync(output, 'utf8'));
    expect(report).toMatchObject({
      status: 'failed',
      repairCount: 1,
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'NODE_COLLISION' })]),
      score: { checks: { zeroCollisions: { passed: false } } },
    });
  });

  it('never publishes unknown response fields, provider secrets, prompts, or raw failures', async () => {
    const secret = 'sk-live-never-publish-this';
    const malicious = {
      version: '0.1',
      canvas: { width: 10, height: 10 },
      nodes: [],
      edges: [],
      rawResponse: secret,
    };
    const provider = sequencePlanner([malicious, malicious]);
    const output = path.join(os.tmpdir(), `benchmark-redaction-${Date.now()}.json`);
    const result = await runBenchmarkCli(
      ['--provider', 'fixture', '--example', '5-event-pipeline', '--out', output],
      {
        providerFactory: () => provider,
        gateFactory: () => async () => fixtureGate,
      },
    );
    expect(result.exitCode).toBe(1);
    expect(provider.calls).toHaveLength(2);
    expect(JSON.stringify(provider.calls[1].errors)).not.toContain(secret);
    expect(provider.calls[1].errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'INVALID_LAYOUT_SCHEMA',
          path: '/layout',
        }),
      ]),
    );
    const published = fs.readFileSync(output, 'utf8');
    expect(published).not.toContain(secret);
    expect(published).not.toContain('rawResponse');
    expect(JSON.parse(published)).toMatchObject({ redactedLayout: null, repairCount: 1 });

    const throwing = await runBenchmarkCli(
      ['--provider', 'fixture', '--example', '5-event-pipeline', '--out', `${output}.failure`],
      {
        providerFactory: () => ({
          async plan() {
            throw new Error(secret);
          },
        }),
      },
    );
    expect(`${throwing.stdout}${throwing.stderr}`).not.toContain(secret);
    expect(throwing).toMatchObject({
      exitCode: 3,
      stderr: 'Benchmark failed: BENCHMARK_INTERNAL_FAILURE.\n',
    });
  });

  it('keeps the provider output schema strict-compatible and validates fixture reports', async () => {
    const outputSchema = JSON.parse(
      fs.readFileSync(path.join(root, 'benchmark/layout-output.schema.json'), 'utf8'),
    );
    const { benchmarkLayoutSchema } = await import('../src/benchmark-cli.js');
    expect(outputSchema.properties.version).toEqual({ type: 'string', const: '0.1' });
    expect(outputSchema.required).toContain('topology');
    expect(benchmarkLayoutSchema.properties.topology.type).toBe('object');
    expect(outputSchema.properties.topology.properties.allowEdgeCrossings.type).toBe('array');
    const validateProviderLayout = new (Ajv2020 as any)({ allErrors: true, strict: true }).compile(
      outputSchema,
    );
    const fixtureLayout = JSON.parse(
      fs.readFileSync(
        path.join(root, 'examples/showcase/5-event-pipeline/layout-reproduce.json'),
        'utf8',
      ),
    );
    expect(
      validateProviderLayout({
        ...fixtureLayout,
        topology: fixtureLayout.topology ?? { allowEdgeCrossings: [] },
      }),
    ).toBe(true);

    const directory = path.join(os.tmpdir(), `benchmark-five-${Date.now()}`);
    const result = await runBenchmarkCli([
      '--provider',
      'fixture',
      '--all',
      '--out-dir',
      directory,
    ]);
    expect(result.exitCode).toBe(0);
    const reportSchema = JSON.parse(
      fs.readFileSync(path.join(root, 'benchmark/report.schema.json'), 'utf8'),
    );
    const validate = new (Ajv2020 as any)({ allErrors: true, strict: true }).compile(reportSchema);
    for (const file of fs.readdirSync(directory)) {
      const report = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
      expect(validate(report), `${file}: ${JSON.stringify(validate.errors)}`).toBe(true);
      expect(report).toMatchObject({ status: 'passed', score: { total: 100 } });
    }
  });

  it('rejects unbounded or multi-example live invocations before provider dispatch', async () => {
    expect(
      await runBenchmarkCli(['--provider', 'codex', '--all', '--out-dir', '/tmp/never']),
    ).toMatchObject({ exitCode: 2 });
    expect(
      await runBenchmarkCli([
        '--provider',
        'codex',
        '--example',
        '1-cloud-web-app',
        '--out',
        '/tmp/never.json',
        '--timeout-seconds',
        '601',
      ]),
    ).toMatchObject({ exitCode: 2 });
  });
});
