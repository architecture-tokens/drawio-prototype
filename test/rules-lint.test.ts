import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- tools/rules-lint.mjs is plain JS and outside tsconfig's `include`.
import { runCli } from '../tools/rules-lint.mjs';

const root = path.resolve(import.meta.dirname, '..');
const showcaseDir = path.join(root, 'examples', 'showcase');
const showcaseSvgs = fs
  .readdirSync(showcaseDir)
  .filter((entry) => fs.statSync(path.join(showcaseDir, entry)).isDirectory())
  .map((entry) => path.join(showcaseDir, entry, 'final.svg'))
  .filter((file) => fs.existsSync(file));

// A minimal, self-contained SVG connector that violates rule 4: the arrow
// is a marker-ended <path> whose `d` uses a cubic bezier (C) command
// instead of the required orthogonal <polyline>/<line>.
const bezierConnectorFixture = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="200" height="100">
<!-- Semantic palette (C1): node #FF0000 border/fill/text -->
<defs>
  <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto">
    <path d="M0,0 L10,5 L0,10 Z" fill="#FF0000"/>
  </marker>
</defs>
<rect x="0" y="0" width="200" height="100" fill="#ffffff"/>
<path d="M10,50 C50,10 150,90 190,50" stroke="#FF0000" fill="none" marker-end="url(#arrow)"/>
</svg>
`;

describe('tools/rules-lint.mjs', () => {
  it('finds the five showcase directories (sanity check on the fixture list)', () => {
    expect(showcaseSvgs.length).toBe(5);
  });

  it('exits 0 with 0 FAIL on every hand-verified examples/showcase/*/final.svg', async () => {
    const result = await runCli([...showcaseSvgs, '--format', 'json']);
    expect(result.exitCode).toBe(0);
    const results = JSON.parse(result.stdout) as Array<{
      file: string;
      summary: { PASS: number; FAIL: number; 'NOT-CHECKABLE': number };
    }>;
    expect(results).toHaveLength(5);
    for (const r of results) {
      expect(r.summary.FAIL, `${r.file} should have 0 FAIL`).toBe(0);
    }
  });

  it('exits 1 and names rule 4 for a marker-ended bezier <path> connector', async () => {
    const fixturePath = path.join(os.tmpdir(), `rules-lint-bezier-fixture-${Date.now()}.svg`);
    fs.writeFileSync(fixturePath, bezierConnectorFixture);

    const result = await runCli([fixturePath, '--format', 'json']);
    expect(result.exitCode).toBe(1);
    const [report] = JSON.parse(result.stdout) as Array<{
      checks: Array<{ id: string; status: string; message: string }>;
    }>;
    const rule4 = report.checks.find((c) => c.id === '4');
    expect(rule4).toBeDefined();
    expect(rule4?.status).toBe('FAIL');
    expect(rule4?.message).toMatch(/bezier/i);
  });

  it('exits 2 with usage text when no files are given', async () => {
    const result = await runCli([]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('Usage:');
    expect(result.stderr).toContain('rules-lint.mjs');
  });

  it('exits 0 with usage text for --help', async () => {
    const result = await runCli(['--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('DIRECTION_GEOMETRY_CONFLICT');
  });
});

// ---------------------------------------------------------------------------
// Cross-layer checks (UNKNOWN_ICON_SYMBOL, UNTRACEABLE_VISUAL /
// MISSING_COMPONENT, DIRECTION_GEOMETRY_CONFLICT, CENSUS_MISMATCH)
// ---------------------------------------------------------------------------

type JsonReport = {
  checks: Array<{ id: string; status: string; message: string }>;
};

async function runJson(args: string[]) {
  const result = await runCli([...args, '--format', 'json']);
  const reports = result.exitCode === 2 ? [] : (JSON.parse(result.stdout) as JsonReport[]);
  return { result, reports };
}

// A minimal SVG that satisfies none of the baseline SVG rule checks
// meaningfully (no connectors, no markers, no palette comment) — those are
// irrelevant to the cross-layer fixtures below and are allowed to land as
// FAIL/NOT-CHECKABLE alongside the one check each fixture targets; every
// assertion below looks up its target check by id, not the overall FAIL
// count.
const MINIMAL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
<rect x="0" y="0" width="100" height="100" fill="none"/>
</svg>
`;

describe('tools/rules-lint.mjs cross-layer checks', () => {
  const example1 = path.join(showcaseDir, '1-cloud-web-app');

  it('exits 0 on the full example-1 cross-layer invocation and all four new checks PASS', async () => {
    const { result, reports } = await runJson([
      path.join(example1, 'final.svg'),
      '--model',
      path.join(example1, 'model.yaml'),
      '--view',
      path.join(example1, 'view.yaml'),
      '--census',
      path.join(example1, 'census.yaml'),
      '--layout',
      path.join(example1, 'layout.json'),
    ]);
    expect(result.exitCode).toBe(0);
    expect(reports).toHaveLength(1);
    for (const id of [
      'UNKNOWN_ICON_SYMBOL',
      'UNTRACEABLE_VISUAL / MISSING_COMPONENT',
      'DIRECTION_GEOMETRY_CONFLICT',
      'CENSUS_MISMATCH',
    ]) {
      const check = reports[0].checks.find((c) => c.id === id);
      expect(check, `${id} should be present in the report`).toBeDefined();
      expect(check?.status, `${id}: ${check?.message}`).toBe('PASS');
    }
  });

  it('exits 1 and names UNKNOWN_ICON_SYMBOL when view.yaml references an icon with no matching <symbol>', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rules-lint-icon-'));
    const svgPath = path.join(dir, 'final.svg');
    const viewPath = path.join(dir, 'view.yaml');
    fs.writeFileSync(svgPath, MINIMAL_SVG);
    fs.writeFileSync(
      viewPath,
      'components:\n  a:\n    - icon: nonexistent.glyph\n      anchor: top-center\n',
    );

    const { result, reports } = await runJson([svgPath, '--view', viewPath]);
    expect(result.exitCode).toBe(1);
    const check = reports[0].checks.find((c) => c.id === 'UNKNOWN_ICON_SYMBOL');
    expect(check?.status).toBe('FAIL');
    expect(check?.message).toMatch(/UNKNOWN_ICON_SYMBOL/);
  });

  it('exits 1 and names MISSING_COMPONENT when a model component has no data-component in the SVG', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rules-lint-missing-component-'));
    const svgPath = path.join(dir, 'final.svg');
    const modelPath = path.join(dir, 'model.yaml');
    fs.writeFileSync(svgPath, MINIMAL_SVG); // no data-component attributes at all
    fs.writeFileSync(modelPath, 'components:\n  - id: alpha\n  - id: beta\n');

    const { result, reports } = await runJson([svgPath, '--model', modelPath]);
    expect(result.exitCode).toBe(1);
    const check = reports[0].checks.find((c) => c.id === 'UNTRACEABLE_VISUAL / MISSING_COMPONENT');
    expect(check?.status).toBe('FAIL');
    expect(check?.message).toMatch(/MISSING_COMPONENT/);
  });

  it("exits 1 and names DIRECTION_GEOMETRY_CONFLICT when edges run opposite view.yaml's flow.direction", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rules-lint-direction-'));
    const svgPath = path.join(dir, 'final.svg');
    const modelPath = path.join(dir, 'model.yaml');
    const viewPath = path.join(dir, 'view.yaml');
    const layoutPath = path.join(dir, 'layout.json');
    fs.writeFileSync(svgPath, MINIMAL_SVG);
    fs.writeFileSync(
      modelPath,
      [
        'components:',
        '  - id: a',
        '  - id: b',
        '  - id: c',
        'relationships:',
        '  - id: r1',
        '    from: a',
        '    to: b',
        '  - id: r2',
        '    from: b',
        '    to: c',
        '',
      ].join('\n'),
    );
    // flow.direction: up means arrows should point toward SMALLER y; every
    // node here sits BELOW the one before it, so both edges' net
    // displacement is the opposite of "up" (0/2 compliant, well under the
    // 60% threshold).
    fs.writeFileSync(viewPath, 'flow:\n  direction: up\n');
    fs.writeFileSync(
      layoutPath,
      JSON.stringify({
        version: '0.1',
        canvas: { width: 300, height: 300 },
        nodes: [
          { id: 'a', x: 0, y: 0, width: 10, height: 10, parentId: null },
          { id: 'b', x: 0, y: 100, width: 10, height: 10, parentId: null },
          { id: 'c', x: 0, y: 200, width: 10, height: 10, parentId: null },
        ],
        edges: [],
      }),
    );

    const { result, reports } = await runJson([
      svgPath,
      '--model',
      modelPath,
      '--view',
      viewPath,
      '--layout',
      layoutPath,
    ]);
    expect(result.exitCode).toBe(1);
    const check = reports[0].checks.find((c) => c.id === 'DIRECTION_GEOMETRY_CONFLICT');
    expect(check?.status).toBe('FAIL');
    expect(check?.message).toMatch(/DIRECTION_GEOMETRY_CONFLICT/);
  });

  it("exits 1 and names CENSUS_MISMATCH when census.yaml's record count disagrees with its source", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rules-lint-census-'));
    const svgPath = path.join(dir, 'final.svg');
    const censusPath = path.join(dir, 'census.yaml');
    const sourcePath = path.join(dir, 'source.xml');
    fs.writeFileSync(svgPath, MINIMAL_SVG);
    // source.xml has 2 vertices; census.yaml only accounts for 1 record.
    fs.writeFileSync(
      sourcePath,
      '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>' +
        '<mxCell id="2" vertex="1" parent="1"/><mxCell id="3" vertex="1" parent="1"/>' +
        '</root></mxGraphModel>',
    );
    fs.writeFileSync(
      censusPath,
      [
        'source: source.xml',
        'records:',
        '  - source_id: "2"',
        '    kind: vertex',
        '    label: null',
        '    primary_bucket: component',
        '    target_ids: [a]',
        '',
      ].join('\n'),
    );

    const { result, reports } = await runJson([svgPath, '--census', censusPath]);
    expect(result.exitCode).toBe(1);
    const check = reports[0].checks.find((c) => c.id === 'CENSUS_MISMATCH');
    expect(check?.status).toBe('FAIL');
    expect(check?.message).toMatch(/CENSUS_MISMATCH/);
  });
});
