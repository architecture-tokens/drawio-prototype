import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';
import { run } from '../src/cli.js';
import { validateLayout } from '../src/layout.js';
import { loadAndValidate } from '../src/validate.js';
import type { Planner } from '../src/types.js';

const root = path.resolve(import.meta.dirname, '..');
const fixture = (...parts: string[]) => path.join(root, 'examples', ...parts);
const validLayout = {
  version: '0.1',
  nodes: [
    { id: 'api', x: 40, y: 40, width: 160, height: 80 },
    { id: 'ledger', x: 320, y: 40, width: 160, height: 80 },
  ],
  edges: [{ id: 'api-ledger', waypoints: [{ x: 260, y: 80 }] }],
};
const planner = (responses: unknown[]): Planner & { calls: number } => ({
  calls: 0,
  async plan() {
    this.calls += 1;
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  },
});

describe('archtokens public CLI', () => {
  it('validates YAML and JSON with human and exact JSON reports', async () => {
    const yaml = await run([
      'validate',
      fixture('payments.yaml'),
      '--policy',
      fixture('policies.yaml'),
    ]);
    expect(yaml).toMatchObject({ exitCode: 0, stdout: 'Validation passed.\n' });
    const jsonPath = path.join(os.tmpdir(), `archtokens-${Date.now()}.json`);
    fs.writeFileSync(
      jsonPath,
      JSON.stringify({
        kind: 'architecture-model',
        id: 'json-model',
        libraries: ['core@0.1.0'],
        components: [{ id: 'json-api', type: 'core:component.service', tokens: [] }],
        relationships: [],
      }),
    );
    const json = await run(['validate', jsonPath, '--format', 'json']);
    expect(json.exitCode).toBe(0);
    expect(JSON.parse(json.stdout)).toMatchObject({ valid: true });
  });

  it('reports schema, semantic, and missing-input errors with stable codes', async () => {
    const invalid = path.join(os.tmpdir(), `invalid-${Date.now()}.yaml`);
    fs.writeFileSync(
      invalid,
      'kind: architecture-model\nid: bad\nlibraries: []\ncomponents: []\nrelationships: []\n',
    );
    expect((await run(['validate', invalid])).exitCode).toBe(1);
    const semantic = path.join(os.tmpdir(), `semantic-${Date.now()}.yaml`);
    fs.writeFileSync(
      semantic,
      'kind: architecture-model\nid: bad\nlibraries: [core@0.1.0]\ncomponents: [{id: x, type: core:component.service, tokens: []}]\nrelationships: [{id: x, type: core:relationship.call.sync, from: x, to: no, tokens: []}]\n',
    );
    const report = await run(['validate', semantic]);
    expect(report.exitCode).toBe(1);
    expect(report.stderr).toContain('DUPLICATE_ELEMENT_ID');
    expect(report.stderr).toContain('UNRESOLVED_ELEMENT');
    expect((await run(['validate', '/definitely/missing.yaml'])).exitCode).toBe(2);
  });

  it('does not call a planner for invalid input and accepts local library/policy flags', async () => {
    const bad = path.join(os.tmpdir(), `bad-${Date.now()}.yaml`);
    fs.writeFileSync(bad, 'kind: no\n');
    const mock = planner([validLayout]);
    expect(
      (
        await run(
          ['generate', bad, '--out', `${bad}.drawio`, '--library', fixture('payments.yaml')],
          mock,
        )
      ).exitCode,
    ).toBe(1);
    expect(mock.calls).toBe(0);
    const good = await run([
      'validate',
      fixture('local-model.yaml'),
      '--library',
      fixture('local-library.yaml'),
    ]);
    expect(good.exitCode).toBe(0);
  });

  it('enforces layout identity, finite geometry, parents, waypoints, and accepts valid layout', () => {
    const model = loadAndValidate(fixture('payments.yaml'), [], []).model;
    expect(validateLayout(validLayout, model).valid).toBe(true);
    for (const mutate of [
      (v: any) => v.nodes.push({ id: 'invented', x: 0, y: 0, width: 1, height: 1 }),
      (v: any) => v.nodes.pop(),
      (v: any) => {
        v.nodes[1].id = 'api';
      },
      (v: any) => {
        v.nodes[0].x = -1;
      },
      (v: any) => {
        v.nodes[0].x = 1.2;
      },
      (v: any) => {
        v.nodes[0].parentId = 'none';
      },
      (v: any) => {
        v.nodes[0].parentId = 'ledger';
        v.nodes[1].parentId = 'api';
      },
      (v: any) => {
        v.edges[0].id = 'wrong';
      },
      (v: any) => {
        v.edges[0].waypoints[0].x = -2;
      },
    ]) {
      const value = structuredClone(validLayout);
      mutate(value);
      expect(validateLayout(value, model).valid).toBe(false);
    }
  });

  it('repairs invalid layout once, maps provider failures to 3 and second invalid layout to 4', async () => {
    const oneRepair = planner([
      { ...validLayout, nodes: validLayout.nodes.slice(0, 1) },
      validLayout,
    ]);
    const output = path.join(os.tmpdir(), `repair-${Date.now()}.drawio`);
    expect(
      (await run(['generate', fixture('payments.yaml'), '--out', output], oneRepair)).exitCode,
    ).toBe(0);
    expect(oneRepair.calls).toBe(2);
    const provider = planner([new Error('refusal')]);
    expect(
      (await run(['generate', fixture('payments.yaml'), '--out', output], provider)).exitCode,
    ).toBe(3);
    const invalid = planner([
      { ...validLayout, nodes: [] },
      { ...validLayout, nodes: [] },
    ]);
    expect(
      (await run(['generate', fixture('payments.yaml'), '--out', output], invalid)).exitCode,
    ).toBe(4);
    expect(invalid.calls).toBe(2);
  });

  it('creates deterministic XML with escaped labels and preserves IDs/endpoints atomically', async () => {
    const output = path.join(os.tmpdir(), `output-${Date.now()}.drawio`);
    const result = await run(
      ['generate', fixture('payments.yaml'), '--out', output],
      planner([validLayout]),
    );
    expect(result.exitCode).toBe(0);
    const xml = fs.readFileSync(output, 'utf8');
    expect(xml).toBe(fs.readFileSync(fixture('golden.drawio'), 'utf8'));
    expect(
      new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('parsererror'),
    ).toHaveLength(0);
    expect(xml).toContain('API &lt;gateway&gt;');
    expect(xml).toContain('id="api"');
    expect(xml).toContain('id="api-ledger"');
    expect(xml).toContain('source="api" target="ledger"');
    expect(xml).toContain('shape=cylinder');
    const unchanged = fs.readFileSync(output, 'utf8');
    expect(
      await run(
        ['generate', fixture('payments.yaml'), '--out', output],
        planner([
          { ...validLayout, nodes: [] },
          { ...validLayout, nodes: [] },
        ]),
      ),
    ).toMatchObject({ exitCode: 4 });
    expect(fs.readFileSync(output, 'utf8')).toBe(unchanged);
  });
});
