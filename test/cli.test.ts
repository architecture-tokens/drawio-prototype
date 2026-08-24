import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';
import { run } from '../src/cli.js';
import { validateLayout } from '../src/layout.js';
import { defaultLayoutSchema, OpenAIPlanner, resolveModel } from '../src/planner.js';
import { loadAndValidate } from '../src/validate.js';
import type { Planner, PlannerRequest } from '../src/types.js';

const root = path.resolve(import.meta.dirname, '..');
const fixture = (...parts: string[]) => path.join(root, 'examples', ...parts);
const validLayout = {
  version: '0.1',
  canvas: { width: 600, height: 240 },
  nodes: [
    { id: 'api', x: 40, y: 40, width: 160, height: 80, parentId: null },
    { id: 'ledger', x: 320, y: 40, width: 160, height: 80, parentId: null },
  ],
  edges: [{ id: 'api-ledger', waypoints: [{ x: 260, y: 80 }] }],
};
const planner = (
  responses: unknown[],
): Planner & { calls: number; requests: PlannerRequest[] } => ({
  calls: 0,
  requests: [],
  async plan(request) {
    this.calls += 1;
    this.requests.push(request);
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
    const jsonDiagnostic = await run(['validate', invalid, '--format', 'json']);
    expect(JSON.parse(jsonDiagnostic.stdout)).toMatchObject({
      valid: false,
      diagnostics: [
        {
          severity: 'error',
          code: expect.any(String),
          path: expect.any(String),
          message: expect.any(String),
        },
      ],
    });
    expect((await run(['validate', fixture('payments.yaml'), '--unknown'])).exitCode).toBe(2);
    expect((await run(['generate', fixture('payments.yaml'), '--out'])).exitCode).toBe(2);
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

  it('validates a view before planning and passes a valid view to the planner', async () => {
    const output = path.join(os.tmpdir(), `view-${Date.now()}.drawio`);
    const mock = planner([validLayout]);
    const result = await run(
      [
        'generate',
        fixture('payments.yaml'),
        '--out',
        output,
        '--view',
        fixture('payments-view.yaml'),
      ],
      mock,
    );
    expect(result.exitCode).toBe(0);
    expect(mock.calls).toBe(1);
    expect(mock.requests[0].view).toMatchObject({
      kind: 'view',
      version: '0.1.0',
      mode: 'restyle',
      flow: { direction: 'right' },
    });
  });

  it('returns stable view diagnostics and never calls the planner for an invalid view', async () => {
    const base = {
      kind: 'view',
      version: '0.1.0',
      id: 'payments-test',
      model: 'payments.yaml',
      mode: 'restyle',
      flow: { direction: 'right' },
      components: {},
      relationships: {},
      visualElements: [],
    };
    const cases = [
      {
        mutate: (value: any) => {
          value.mode = 'enhance';
        },
        code: 'SCHEMA_INVALID_ARCHITECTURE_VIEW',
        path: '/mode',
      },
      {
        mutate: (value: any) => {
          value.model = 'local-model.yaml';
        },
        code: 'VIEW_MODEL_MISMATCH',
        path: '/model',
      },
      {
        mutate: (value: any) => {
          value.components.missing = [{ icon: 'api', anchor: 'middle-center' }];
        },
        code: 'UNRESOLVED_VIEW_ATTACHMENT_OWNER',
        path: '/components/missing',
      },
      {
        mutate: (value: any) => {
          value.visualElements = [{ id: 'zone', members: ['missing'] }];
        },
        code: 'UNRESOLVED_VIEW_MEMBER',
        path: '/visualElements/0/members/0',
      },
      {
        mutate: (value: any) => {
          value.visualElements = [
            { id: 'zone', members: ['api'] },
            { id: 'zone', members: ['ledger'] },
          ];
        },
        code: 'DUPLICATE_VIEW_ELEMENT_ID',
        path: '/visualElements/1/id',
      },
      {
        mutate: (value: any) => {
          value.relationships['api-ledger'] = [{ icon: 'lock', anchor: 'top-left' }];
        },
        code: 'INVALID_VIEW_ATTACHMENT_ANCHOR',
        path: '/relationships/api-ledger/0/anchor',
      },
    ];
    for (const [index, testCase] of cases.entries()) {
      const view = structuredClone(base);
      testCase.mutate(view);
      const viewFile = path.join(root, 'examples', `invalid-view-${Date.now()}-${index}.json`);
      fs.writeFileSync(viewFile, JSON.stringify(view));
      try {
        const mock = planner([validLayout]);
        const result = await run(
          [
            'generate',
            fixture('payments.yaml'),
            '--out',
            `${viewFile}.drawio`,
            '--view',
            viewFile,
            '--format',
            'json',
          ],
          mock,
        );
        expect(result.exitCode).toBe(1);
        expect(JSON.parse(result.stdout).diagnostics).toContainEqual(
          expect.objectContaining({ code: testCase.code, path: testCase.path }),
        );
        expect(mock.calls).toBe(0);
      } finally {
        fs.unlinkSync(viewFile);
      }
    }
  });

  it('enforces layout identity, finite geometry, parents, waypoints, and accepts valid layout', () => {
    const model = loadAndValidate(fixture('payments.yaml'), [], []).model;
    expect(validateLayout(validLayout, model).valid).toBe(true);
    const schemaInvalid = validateLayout({ ...validLayout, unexpected: true }, model);
    expect(schemaInvalid).toMatchObject({
      valid: false,
      diagnostics: [{ code: 'INVALID_LAYOUT_SCHEMA' }],
    });
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
    expect(oneRepair.requests[1]).toMatchObject({
      architecture: expect.objectContaining({ kind: 'renderer-input' }),
      previousLayout: { ...validLayout, nodes: validLayout.nodes.slice(0, 1) },
      errors: [{ code: 'OMITTED_LAYOUT_ID', message: expect.any(String) }],
    });
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

  it('returns output error 5 without creating a target in a missing directory', async () => {
    const absent = path.join(os.tmpdir(), `absent-${Date.now()}`, 'output.drawio');
    const result = await run(
      ['generate', fixture('payments.yaml'), '--out', absent],
      planner([validLayout]),
    );
    expect(result).toMatchObject({ exitCode: 5 });
    expect(fs.existsSync(absent)).toBe(false);
  });

  it('uses strict Responses payloads with architecture on initial and repair calls only', async () => {
    const payloads: any[] = [];
    const client = {
      responses: {
        create: async (payload: any) => {
          payloads.push(payload);
          return { output_text: JSON.stringify(validLayout) };
        },
      },
    };
    const openAiPlanner = new OpenAIPlanner('cli-choice', 'test-key', () => client);
    const architecture = { kind: 'renderer-input', model: { id: 'safe' } };
    const previousLayout = { version: 'wrong' };
    await openAiPlanner.plan({ architecture, schema: defaultLayoutSchema });
    await openAiPlanner.plan({
      architecture,
      schema: defaultLayoutSchema,
      previousLayout,
      errors: [{ code: 'INVALID_LAYOUT_SCHEMA', message: 'type: must be integer' }],
    });
    expect(
      resolveModel('flag', { ARCHTOKENS_OPENAI_MODEL: 'environment' } as NodeJS.ProcessEnv),
    ).toBe('flag');
    expect(
      resolveModel(undefined, { ARCHTOKENS_OPENAI_MODEL: 'environment' } as NodeJS.ProcessEnv),
    ).toBe('environment');
    expect(payloads[0]).toMatchObject({
      model: 'cli-choice',
      text: { format: { type: 'json_schema', strict: true, schema: defaultLayoutSchema } },
    });
    expect(JSON.parse(payloads[0].input)).toMatchObject({ architecture });
    expect(JSON.parse(payloads[0].input)).not.toHaveProperty('previousLayout');
    expect(JSON.parse(payloads[1].input)).toMatchObject({
      architecture,
      previousLayout,
      errors: [{ code: 'INVALID_LAYOUT_SCHEMA', message: 'type: must be integer' }],
    });
    const refusal = new OpenAIPlanner('no-output', 'test-key', () => ({
      responses: { create: async () => ({ output_text: '' }) },
    }));
    await expect(
      refusal.plan({ architecture: { secret: 'not-logged' }, schema: defaultLayoutSchema }),
    ).rejects.toThrow('Provider returned no layout');
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
