import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- tools/rules-lint.mjs is plain JS and outside tsconfig's `include`.
import { runCli, parseMermaidSourceElements } from '../tools/rules-lint.mjs';

type SourceElement = { id: string; kind: 'vertex' | 'edge' };

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

// Rule 3a fixtures: two marker-ended <path> connectors, each a single
// straight-Q-straight bend (no consecutive straight commands, so neither
// element itself trips the "mixed sharp+rounded within one element" FAIL
// branch — see checkRule3a's doc comment in rules-lint.mjs). The radius
// checkRule3a reads off a Q bend is the distance from the point reached by
// the preceding straight command to the Q's control point (which is always
// the original sharp corner, by construction — see round-connectors.mjs).
// mixedRadii's two connectors use radius 5 and radius 8; uniformRadii's use
// radius 5 on both.
const mixedRadiiConnectorFixture = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 100" width="220" height="100">
<defs>
  <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto">
    <path d="M0,0 L10,5 L0,10 Z" fill="#FF0000"/>
  </marker>
</defs>
<rect x="0" y="0" width="220" height="100" fill="#ffffff"/>
<path d="M10,10 H45 Q50,10 50,15 V90" stroke="#FF0000" fill="none" marker-end="url(#arrow)"/>
<path d="M100,10 V42 Q100,50 108,50 H190" stroke="#FF0000" fill="none" marker-end="url(#arrow)"/>
</svg>
`;

const uniformRadiiConnectorFixture = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 100" width="220" height="100">
<defs>
  <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto">
    <path d="M0,0 L10,5 L0,10 Z" fill="#FF0000"/>
  </marker>
</defs>
<rect x="0" y="0" width="220" height="100" fill="#ffffff"/>
<path d="M10,10 H45 Q50,10 50,15 V90" stroke="#FF0000" fill="none" marker-end="url(#arrow)"/>
<path d="M100,10 V45 Q100,50 105,50 H190" stroke="#FF0000" fill="none" marker-end="url(#arrow)"/>
</svg>
`;

// Rule 3a clamp-clause fixture: connector 1 is the same unclamped
// radius-5 single bend as the uniform-radii fixture above (legs 40/80,
// well over 2x5=10) -- it establishes the file's uniform radius R=5.
// Connector 2 has TWO bends sharing a short 4-unit middle segment
// (original vertices (100,10)->(100,42)->(100,46)->(190,46), matching the
// real final-reproduce.svg micro-jog this fixture models): since 4 < 2x5,
// both bends clamp to r_eff = min(5, 4/2) = 2. The `d` below is exactly
// what tools/round-connectors.mjs would emit for that geometry at r=5
// (the middle straight run between the two clamped Q's is zero-length,
// "V44", since both r_eff's exactly consume the whole 4-unit segment).
const clampedBendConnectorFixture = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 100" width="220" height="100">
<defs>
  <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto">
    <path d="M0,0 L10,5 L0,10 Z" fill="#FF0000"/>
  </marker>
</defs>
<rect x="0" y="0" width="220" height="100" fill="#ffffff"/>
<path d="M10,10 H45 Q50,10 50,15 V90" stroke="#FF0000" fill="none" marker-end="url(#arrow)"/>
<path d="M100,10 V40 Q100,42 100,44 V44 Q100,46 102,46 H190" stroke="#FF0000" fill="none" marker-end="url(#arrow)"/>
</svg>
`;

describe('tools/rules-lint.mjs', () => {
  it('finds the five showcase directories (sanity check on the fixture list)', () => {
    expect(showcaseSvgs.length).toBe(5);
  });

  // Only 1-cloud-web-app carries model.yaml/view.yaml/census.yaml/layout.json
  // today (see the cross-layer describe block below, including its --full
  // invocation). Examples 2-5 (2-cicd-flow, 3-microservices-c4, 4-kubernetes,
  // 5-event-pipeline) have not been migrated to the cross-layer contract yet
  // — this test intentionally stays SVG-only for all five so it keeps
  // covering the 4 unmigrated ones without requiring inputs they don't have.
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

  it('rule 3a: FAILs when rounded connector bends use different corner radii', async () => {
    const fixturePath = path.join(
      os.tmpdir(),
      `rules-lint-3a-mixed-radii-fixture-${Date.now()}.svg`,
    );
    fs.writeFileSync(fixturePath, mixedRadiiConnectorFixture);

    const result = await runCli([fixturePath, '--format', 'json']);
    expect(result.exitCode).toBe(1);
    const [report] = JSON.parse(result.stdout) as Array<{
      checks: Array<{ id: string; status: string; message: string }>;
    }>;
    const rule3a = report.checks.find((c) => c.id === '3a');
    expect(rule3a).toBeDefined();
    expect(rule3a?.status).toBe('FAIL');
    expect(rule3a?.message).toMatch(/different corner radii/i);
  });

  it('rule 3a: PASSes when every rounded connector bend shares one uniform corner radius', async () => {
    const fixturePath = path.join(
      os.tmpdir(),
      `rules-lint-3a-uniform-radii-fixture-${Date.now()}.svg`,
    );
    fs.writeFileSync(fixturePath, uniformRadiiConnectorFixture);

    const result = await runCli([fixturePath, '--format', 'json']);
    const [report] = JSON.parse(result.stdout) as Array<{
      checks: Array<{ id: string; status: string; message: string }>;
    }>;
    const rule3a = report.checks.find((c) => c.id === '3a');
    expect(rule3a).toBeDefined();
    expect(rule3a?.status).toBe('PASS');
    expect(rule3a?.message).toMatch(/radius 5/);
  });

  it('rule 3a: PASSes and reports the clamped bend count when a short adjacent segment justifies a smaller radius (clamp clause)', async () => {
    const fixturePath = path.join(os.tmpdir(), `rules-lint-3a-clamped-fixture-${Date.now()}.svg`);
    fs.writeFileSync(fixturePath, clampedBendConnectorFixture);

    const result = await runCli([fixturePath, '--format', 'json']);
    const [report] = JSON.parse(result.stdout) as Array<{
      checks: Array<{ id: string; status: string; message: string }>;
    }>;
    const rule3a = report.checks.find((c) => c.id === '3a');
    expect(rule3a).toBeDefined();
    expect(rule3a?.status).toBe('PASS');
    expect(rule3a?.message).toMatch(/radius 5/);
    expect(rule3a?.message).toMatch(/2 bend\(s\) clamped/);
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

const CROSS_LAYER_IDS = [
  'UNKNOWN_ICON_SYMBOL',
  'UNTRACEABLE_VISUAL / MISSING_COMPONENT',
  'VIEW_REF_UNRESOLVED',
  'DIRECTION_GEOMETRY_CONFLICT',
  'CENSUS_MISMATCH',
  'RELATIONSHIP_ATTACHMENT_NOT_RENDERED',
];

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

  it('exits 0 on the full example-1 cross-layer invocation and all six cross-layer checks PASS', async () => {
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
      'VIEW_REF_UNRESOLVED',
      'DIRECTION_GEOMETRY_CONFLICT',
      'CENSUS_MISMATCH',
      'RELATIONSHIP_ATTACHMENT_NOT_RENDERED',
    ]) {
      const check = reports[0].checks.find((c) => c.id === id);
      expect(check, `${id} should be present in the report`).toBeDefined();
      expect(check?.status, `${id}: ${check?.message}`).toBe('PASS');
    }
  });

  it('exits 0 under --full on example 1 (all four inputs present, no NOT-CHECKABLE cross-layer check)', async () => {
    const { result, reports } = await runJson([
      path.join(example1, 'final.svg'),
      '--full',
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
    expect(reports[0].summary.FAIL).toBe(0);
  });

  // The reproduce-mode view (view-reproduce.yaml / layout-reproduce.json /
  // final-reproduce.svg) shares model.yaml and census.yaml with the restyle
  // view above -- one model, two views, per README.md "Conversion modes".
  it('exits 0 under --full on example 1 REPRODUCE mode (final-reproduce.svg / view-reproduce.yaml / layout-reproduce.json)', async () => {
    const { result, reports } = await runJson([
      path.join(example1, 'final-reproduce.svg'),
      '--full',
      '--model',
      path.join(example1, 'model.yaml'),
      '--view',
      path.join(example1, 'view-reproduce.yaml'),
      '--census',
      path.join(example1, 'census.yaml'),
      '--layout',
      path.join(example1, 'layout-reproduce.json'),
    ]);
    expect(result.exitCode).toBe(0);
    expect(reports[0].summary.FAIL).toBe(0);
    const corners = reports[0].checks.find((c) => c.id === '3a');
    expect(corners?.status).toBe('PASS');
    expect(corners?.message).toMatch(/18 rounded connector.*21 bend/);
  });

  it('treats an iconless view as a decisive --full PASS for both attachment checks', async () => {
    const example2 = path.join(showcaseDir, '2-cicd-flow');
    const { result, reports } = await runJson([
      path.join(example2, 'final-reproduce.svg'),
      '--full',
      '--model',
      path.join(example2, 'model.yaml'),
      '--view',
      path.join(example2, 'view-reproduce.yaml'),
      '--census',
      path.join(example2, 'census.yaml'),
      '--layout',
      path.join(example2, 'layout-reproduce.json'),
    ]);
    expect(result.exitCode).toBe(0);
    for (const id of ['UNKNOWN_ICON_SYMBOL', 'RELATIONSHIP_ATTACHMENT_NOT_RENDERED']) {
      const check = reports[0].checks.find((c) => c.id === id);
      expect(check?.status, `${id}: ${check?.message}`).toBe('PASS');
      expect(check?.message).toMatch(/0 .*attachments/);
    }
  });

  it.each(['2-cicd-flow', '3-microservices-c4', '4-kubernetes', '5-event-pipeline'])(
    'keeps showcase reproduce artifact %s green under the complete cross-layer gate',
    async (name) => {
      const dir = path.join(showcaseDir, name);
      const { result, reports } = await runJson([
        path.join(dir, 'final-reproduce.svg'),
        '--full',
        '--model',
        path.join(dir, 'model.yaml'),
        '--view',
        path.join(dir, 'view-reproduce.yaml'),
        '--census',
        path.join(dir, 'census.yaml'),
        '--layout',
        path.join(dir, 'layout-reproduce.json'),
      ]);
      expect(result.exitCode).toBe(0);
      expect(reports[0].summary.FAIL).toBe(0);
      expect(reports[0].summary.WARN).toBe(0);
      for (const id of CROSS_LAYER_IDS) {
        const check = reports[0].checks.find((c) => c.id === id);
        expect(check?.status, `${name} ${id}: ${check?.message}`).toBe('PASS');
      }
    },
  );

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

// ---------------------------------------------------------------------------
// Hardening: one synthetic fixture per new failure mode found by adversarial
// review (view typo, census duplicate-id, incomplete layout, --full with
// missing input), plus two closely-related fixtures (ATTACHMENT_NOT_RENDERED,
// duplicate layout node ids) covering the rest of what VIEW_REF_UNRESOLVED
// and the hardened DIRECTION_GEOMETRY_CONFLICT are now responsible for.
// ---------------------------------------------------------------------------

describe('tools/rules-lint.mjs hardening (adversarial-review fixes)', () => {
  it("exits 1 and names VIEW_REF_UNRESOLVED for a typo'd view.yaml components key (reviewer repro)", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rules-lint-view-typo-'));
    const svgPath = path.join(dir, 'final.svg');
    const modelPath = path.join(dir, 'model.yaml');
    const viewPath = path.join(dir, 'view.yaml');
    fs.writeFileSync(svgPath, MINIMAL_SVG);
    fs.writeFileSync(modelPath, 'components:\n  - id: user\nrelationships: []\n');
    // "components.typo" does not resolve to a model.yaml component id --
    // before this fix, nothing in rules-lint.mjs ever read view.yaml's
    // components/relationships KEYS, only the icon ids inside their
    // attachment lists, so this typo passed silently.
    fs.writeFileSync(
      viewPath,
      'components:\n  components.typo:\n    - icon: actor.user\n      anchor: top-center\n',
    );

    const { result, reports } = await runJson([svgPath, '--model', modelPath, '--view', viewPath]);
    expect(result.exitCode).toBe(1);
    const check = reports[0].checks.find((c) => c.id === 'VIEW_REF_UNRESOLVED');
    expect(check?.status).toBe('FAIL');
    expect(check?.message).toMatch(/VIEW_REF_UNRESOLVED/);
    expect(check?.message).toMatch(/components\.typo/);
  });

  it('exits 1 and names ATTACHMENT_NOT_RENDERED when a declared icon attachment has no matching rendered <use>', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rules-lint-attachment-'));
    const svgPath = path.join(dir, 'final.svg');
    const modelPath = path.join(dir, 'model.yaml');
    const viewPath = path.join(dir, 'view.yaml');
    // The rect is tagged data-component="widget" (so the ref half of
    // VIEW_REF_UNRESOLVED and MISSING_COMPONENT both resolve cleanly) but
    // no <use> for its declared icon is drawn anywhere in its element group.
    fs.writeFileSync(
      svgPath,
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">\n' +
        '<rect x="0" y="0" width="40" height="20" data-component="widget"/>\n' +
        '<text x="5" y="10">Widget</text>\n' +
        '</svg>\n',
    );
    fs.writeFileSync(modelPath, 'components:\n  - id: widget\nrelationships: []\n');
    fs.writeFileSync(
      viewPath,
      'components:\n  widget:\n    - icon: aws.ec2-instance\n      anchor: top-center\n',
    );

    const { result, reports } = await runJson([svgPath, '--model', modelPath, '--view', viewPath]);
    expect(result.exitCode).toBe(1);
    const check = reports[0].checks.find((c) => c.id === 'VIEW_REF_UNRESOLVED');
    expect(check?.status).toBe('FAIL');
    expect(check?.message).toMatch(/ATTACHMENT_NOT_RENDERED/);
  });

  it('exits 1 and names CENSUS_MISMATCH when every census record shares one duplicated source_id (reviewer repro: 51 records at source_id=2)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rules-lint-census-dup-'));
    const svgPath = path.join(dir, 'final.svg');
    const censusPath = path.join(dir, 'census.yaml');
    const sourcePath = path.join(dir, 'source.xml');
    fs.writeFileSync(svgPath, MINIMAL_SVG);
    // 3 source elements (2 vertices + 1 edge); census.yaml has exactly 3
    // records too (so the OLD bare-count check would have passed) but all 3
    // collapse onto source_id "2" -- 2 duplicates, and elements "3"/"4" get
    // no record at all.
    fs.writeFileSync(
      sourcePath,
      '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>' +
        '<mxCell id="2" vertex="1" parent="1"/><mxCell id="3" vertex="1" parent="1"/>' +
        '<mxCell id="4" edge="1" source="2" target="3" parent="1"/>' +
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
        '    primary_bucket: drop',
        '    target_ids: []',
        '    reason: "dup 1"',
        '  - source_id: "2"',
        '    kind: vertex',
        '    label: null',
        '    primary_bucket: drop',
        '    target_ids: []',
        '    reason: "dup 2"',
        '  - source_id: "2"',
        '    kind: vertex',
        '    label: null',
        '    primary_bucket: drop',
        '    target_ids: []',
        '    reason: "dup 3"',
        '',
      ].join('\n'),
    );

    const { result, reports } = await runJson([svgPath, '--census', censusPath]);
    expect(result.exitCode).toBe(1);
    const check = reports[0].checks.find((c) => c.id === 'CENSUS_MISMATCH');
    expect(check?.status).toBe('FAIL');
    expect(check?.message).toMatch(/CENSUS_MISMATCH/);
    expect(check?.message).toMatch(/duplicate/);
  });

  it('exits 1 and names LAYOUT_INCOMPLETE when layout.json is missing nodes for most relationship endpoints (reviewer repro: 2-node layout scored 1/1=100%)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rules-lint-layout-incomplete-'));
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
    fs.writeFileSync(viewPath, 'flow:\n  direction: up\n');
    // layout.json only places 2 of the 3 model components -- r1's endpoints
    // both resolve (a, b) but r2's target "c" does not. The OLD code
    // silently dropped r2 from the denominator and scored 1/1 = 100% PASS
    // on the one relationship it happened to cover.
    fs.writeFileSync(
      layoutPath,
      JSON.stringify({
        version: '0.1',
        canvas: { width: 300, height: 300 },
        nodes: [
          { id: 'a', x: 0, y: 100, width: 10, height: 10, parentId: null },
          { id: 'b', x: 0, y: 0, width: 10, height: 10, parentId: null },
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
    expect(check?.message).toMatch(/LAYOUT_INCOMPLETE/);
  });

  it('exits 1 and names LAYOUT_INCOMPLETE for duplicate layout.json node ids', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rules-lint-layout-dup-'));
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
        'relationships:',
        '  - id: r1',
        '    from: a',
        '    to: b',
        '',
      ].join('\n'),
    );
    fs.writeFileSync(viewPath, 'flow:\n  direction: up\n');
    fs.writeFileSync(
      layoutPath,
      JSON.stringify({
        version: '0.1',
        canvas: { width: 300, height: 300 },
        nodes: [
          { id: 'a', x: 0, y: 100, width: 10, height: 10, parentId: null },
          { id: 'a', x: 50, y: 100, width: 10, height: 10, parentId: null },
          { id: 'b', x: 0, y: 0, width: 10, height: 10, parentId: null },
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
    expect(check?.message).toMatch(/LAYOUT_INCOMPLETE/);
    expect(check?.message).toMatch(/duplicate/);
  });

  it('exits 1 and names FULL_GATE_INCOMPLETE when --full is missing a required input', async () => {
    const example1 = path.join(showcaseDir, '1-cloud-web-app');
    const { result, reports } = await runJson([
      path.join(example1, 'final.svg'),
      '--full',
      '--model',
      path.join(example1, 'model.yaml'),
      '--view',
      path.join(example1, 'view.yaml'),
      // --census and --layout deliberately omitted.
    ]);
    expect(result.exitCode).toBe(1);
    const check = reports[0].checks.find((c) => c.id === 'FULL_GATE');
    expect(check?.status).toBe('FAIL');
    expect(check?.message).toMatch(/FULL_GATE_INCOMPLETE/);
    expect(check?.message).toMatch(/--census/);
    expect(check?.message).toMatch(/--layout/);
  });

  it('exits 1 and promotes a NOT-CHECKABLE cross-layer check to FAIL under --full (flow.direction: mixed)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rules-lint-full-not-checkable-'));
    const svgPath = path.join(dir, 'final.svg');
    const modelPath = path.join(dir, 'model.yaml');
    const viewPath = path.join(dir, 'view.yaml');
    const censusPath = path.join(dir, 'census.yaml');
    const sourcePath = path.join(dir, 'source.xml');
    const layoutPath = path.join(dir, 'layout.json');
    fs.writeFileSync(svgPath, MINIMAL_SVG);
    fs.writeFileSync(modelPath, 'components:\n  - id: a\n  - id: b\nrelationships: []\n');
    // "mixed" normally just skips DIRECTION_GEOMETRY_CONFLICT (NOT-CHECKABLE)
    // -- under --full that must become a blocking FAIL instead.
    fs.writeFileSync(viewPath, 'flow:\n  direction: mixed\n');
    fs.writeFileSync(
      sourcePath,
      '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>' +
        '<mxCell id="2" vertex="1" parent="1"/></root></mxGraphModel>',
    );
    fs.writeFileSync(
      censusPath,
      [
        'source: source.xml',
        'records:',
        '  - source_id: "2"',
        '    kind: vertex',
        '    label: null',
        '    primary_bucket: drop',
        '    target_ids: []',
        '    reason: "n/a"',
        '',
      ].join('\n'),
    );
    fs.writeFileSync(
      layoutPath,
      JSON.stringify({
        version: '0.1',
        canvas: { width: 100, height: 100 },
        nodes: [
          { id: 'a', x: 0, y: 0, width: 10, height: 10, parentId: null },
          { id: 'b', x: 0, y: 50, width: 10, height: 10, parentId: null },
        ],
        edges: [],
      }),
    );

    const { result, reports } = await runJson([
      svgPath,
      '--full',
      '--model',
      modelPath,
      '--view',
      viewPath,
      '--census',
      censusPath,
      '--layout',
      layoutPath,
    ]);
    expect(result.exitCode).toBe(1);
    const check = reports[0].checks.find((c) => c.id === 'DIRECTION_GEOMETRY_CONFLICT');
    expect(check?.status).toBe('FAIL');
    expect(check?.message).toMatch(/FULL_GATE_NOT_CHECKABLE/);
  });

  // RELATIONSHIP_ATTACHMENT_NOT_RENDERED: mutate a COPY of the real example-1
  // final.svg (not a synthetic minimal fixture) so these two adversarial
  // cases exercise the actual data-relationship binding final.svg now
  // carries for user-cdn/user-web-elb, against the example's own real
  // model.yaml/view.yaml/census.yaml/layout.json.
  const example1Dir = path.join(showcaseDir, '1-cloud-web-app');
  const realExample1Svg = fs.readFileSync(path.join(example1Dir, 'final.svg'), 'utf8');

  function fullArgsFor(svgPath: string) {
    return [
      svgPath,
      '--full',
      '--model',
      path.join(example1Dir, 'model.yaml'),
      '--view',
      path.join(example1Dir, 'view.yaml'),
      '--census',
      path.join(example1Dir, 'census.yaml'),
      '--layout',
      path.join(example1Dir, 'layout.json'),
    ];
  }

  it('adversarial (reviewer): --full exits 1 naming RELATIONSHIP_ATTACHMENT_NOT_RENDERED when example 1 is missing its user-cdn padlock <use>', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rules-lint-rel-removed-'));
    const svgPath = path.join(dir, 'final.svg');
    const withPadlockRemoved = realExample1Svg.replace(
      '<use href="#icon-security-ssl-padlock" x="253" y="631" width="18" height="18"/>\n',
      '',
    );
    // Sanity: the replace actually matched something in the real file.
    expect(withPadlockRemoved).not.toBe(realExample1Svg);
    fs.writeFileSync(svgPath, withPadlockRemoved);

    const { result, reports } = await runJson(fullArgsFor(svgPath));
    expect(result.exitCode).toBe(1);
    const check = reports[0].checks.find((c) => c.id === 'RELATIONSHIP_ATTACHMENT_NOT_RENDERED');
    expect(check?.status).toBe('FAIL');
    expect(check?.message).toMatch(/RELATIONSHIP_ATTACHMENT_NOT_RENDERED/);
    expect(check?.message).toMatch(/user-cdn/);
  });

  it('adversarial (reviewer): --full exits 1 naming RELATIONSHIP_ATTACHMENT_NOT_RENDERED when the padlock is bound to the wrong data-relationship', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rules-lint-rel-wrongedge-'));
    const svgPath = path.join(dir, 'final.svg');
    // Re-tag the user-cdn edge group's own data-relationship to the OTHER
    // relationship's id. The padlock <use> still exists in the file, but
    // now only inside user-web-elb's group -- from user-cdn's own
    // declared-attachment point of view its glyph is unrendered.
    const withWrongEdge = realExample1Svg.replace(
      '<g data-relationship="user-cdn" fill="none" stroke-width="1.5">',
      '<g data-relationship="user-web-elb" fill="none" stroke-width="1.5">',
    );
    expect(withWrongEdge).not.toBe(realExample1Svg);
    fs.writeFileSync(svgPath, withWrongEdge);

    const { result, reports } = await runJson(fullArgsFor(svgPath));
    expect(result.exitCode).toBe(1);
    const check = reports[0].checks.find((c) => c.id === 'RELATIONSHIP_ATTACHMENT_NOT_RENDERED');
    expect(check?.status).toBe('FAIL');
    expect(check?.message).toMatch(/RELATIONSHIP_ATTACHMENT_NOT_RENDERED/);
    expect(check?.message).toMatch(/user-cdn/);
  });

  it('real example 1 stays exit 0 under --full with RELATIONSHIP_ATTACHMENT_NOT_RENDERED decisively PASS (never NOT-CHECKABLE)', async () => {
    const { result, reports } = await runJson(fullArgsFor(path.join(example1Dir, 'final.svg')));
    expect(result.exitCode).toBe(0);
    const check = reports[0].checks.find((c) => c.id === 'RELATIONSHIP_ATTACHMENT_NOT_RENDERED');
    expect(check?.status).toBe('PASS');
    expect(check?.message).toMatch(/2 relationship attachment/);
  });
});

// ---------------------------------------------------------------------------
// Mermaid census source parsing (parseMermaidSourceElements / --census-dump)
// -- examples 2 (flowchart, 3 subgraphs), 3 (C4Container), 5 (graph) have
// .mmd sources; census.yaml for those examples does not exist yet, so these
// tests exercise the parser directly against the real source.mmd files plus
// one synthetic round-trip against inline fixtures.
// ---------------------------------------------------------------------------

describe('tools/rules-lint.mjs Mermaid census source parsing', () => {
  function readSource(dir: string) {
    return fs.readFileSync(path.join(showcaseDir, dir, 'source.mmd'), 'utf8');
  }
  function idsByKind(elements: SourceElement[], kind: 'vertex' | 'edge') {
    return new Set(elements.filter((e) => e.kind === kind).map((e) => e.id));
  }

  // 2-cicd-flow/source.mmd: 3 subgraph blocks (deploy stage/test stage/build
  // stage, each itself a vertex) + 9 plain nodes (deploy/deploy_a/deploy_b,
  // test/test_a/test_b, build/build_a/build_b) = 12 vertices. 6 edges inside
  // the subgraphs (2 per stage: stage -> _a, stage -> _b) + 4 dotted
  // cross-stage edges (build_a/build_b -.-> test, test_a/test_b -.-> deploy)
  // = 10 edges. 22 elements total.
  it('parses 2-cicd-flow/source.mmd to exactly 12 vertices (9 nodes + 3 subgraphs) and 10 edges (6 solid + 4 dotted)', () => {
    const elements = parseMermaidSourceElements(readSource('2-cicd-flow')) as SourceElement[];
    expect(elements.filter((e) => e.kind === 'vertex')).toHaveLength(12);
    expect(elements.filter((e) => e.kind === 'edge')).toHaveLength(10);
    expect(elements).toHaveLength(22);
    expect(idsByKind(elements, 'vertex')).toEqual(
      new Set([
        'deploy stage',
        'deploy',
        'deploy_a',
        'deploy_b',
        'test stage',
        'test',
        'test_a',
        'test_b',
        'build stage',
        'build',
        'build_a',
        'build_b',
      ]),
    );
    expect(idsByKind(elements, 'edge')).toEqual(
      new Set([
        'edge:deploy->deploy_a',
        'edge:deploy->deploy_b',
        'edge:test->test_a',
        'edge:test->test_b',
        'edge:build->build_a',
        'edge:build->build_b',
        'edge:build_a->test',
        'edge:build_b->test',
        'edge:test_a->deploy',
        'edge:test_b->deploy',
      ]),
    );
  });

  // 3-microservices-c4/source.mmd: 9 C4 element macro calls are vertices
  // (System_Ext x2, Person, Container_Boundary, Container x2, Container_Ext,
  // ContainerDb, ContainerDb_Ext) -- the 7 UpdateRelStyle calls are layout
  // directives, not elements. 10 Rel/Rel_Back calls are edges; the one
  // Rel_Back (database, backend_api, ...) reverses into backend_api->database.
  it('parses 3-microservices-c4/source.mmd to exactly 9 vertices (C4 element macros) and 10 edges (Rel/Rel_Back, UpdateRelStyle excluded), with Rel_Back reversed', () => {
    const elements = parseMermaidSourceElements(
      readSource('3-microservices-c4'),
    ) as SourceElement[];
    expect(elements.filter((e) => e.kind === 'vertex')).toHaveLength(9);
    expect(elements.filter((e) => e.kind === 'edge')).toHaveLength(10);
    expect(elements).toHaveLength(19);
    expect(idsByKind(elements, 'vertex')).toEqual(
      new Set([
        'email_system',
        'customer',
        'c1',
        'spa',
        'mobile_app',
        'web_app',
        'database',
        'backend_api',
        'banking_system',
      ]),
    );
    const edgeIds = idsByKind(elements, 'edge');
    expect(edgeIds).toEqual(
      new Set([
        'edge:customer->web_app',
        'edge:customer->spa',
        'edge:customer->mobile_app',
        'edge:web_app->spa',
        'edge:spa->backend_api',
        'edge:mobile_app->backend_api',
        'edge:backend_api->database', // Rel_Back(database, backend_api, ...) reversed
        'edge:email_system->customer',
        'edge:backend_api->email_system',
        'edge:backend_api->banking_system',
      ]),
    );
    // The Rel_Back source order (database, backend_api) must NOT survive
    // un-reversed.
    expect(edgeIds.has('edge:database->backend_api')).toBe(false);
  });

  // 5-event-pipeline/source.mmd: 6 plain nodes (A-F), 5 solid edges
  // (A->B, B->C, C->D, C->E, C->F). 11 elements total, no subgraphs.
  it('parses 5-event-pipeline/source.mmd to exactly 6 vertices (A-F) and 5 edges (A->B, B->C, C->D/E/F)', () => {
    const elements = parseMermaidSourceElements(readSource('5-event-pipeline')) as SourceElement[];
    expect(elements.filter((e) => e.kind === 'vertex')).toHaveLength(6);
    expect(elements.filter((e) => e.kind === 'edge')).toHaveLength(5);
    expect(elements).toHaveLength(11);
    expect(idsByKind(elements, 'vertex')).toEqual(new Set(['A', 'B', 'C', 'D', 'E', 'F']));
    expect(idsByKind(elements, 'edge')).toEqual(
      new Set(['edge:A->B', 'edge:B->C', 'edge:C->D', 'edge:C->E', 'edge:C->F']),
    );
  });

  it('--census-dump prints the parsed element list and counts for a .mmd source (5-event-pipeline)', async () => {
    const { exitCode, stdout } = await runCli([
      '--census-dump',
      path.join(showcaseDir, '5-event-pipeline', 'source.mmd'),
      '--format',
      'json',
    ]);
    expect(exitCode).toBe(0);
    const dump = JSON.parse(stdout) as {
      vertexCount: number;
      edgeCount: number;
      elements: SourceElement[];
    };
    expect(dump.vertexCount).toBe(6);
    expect(dump.edgeCount).toBe(5);
    expect(dump.elements).toHaveLength(11);
  });

  // Synthetic round-trip: a small inline .mmd fixture with a duplicate
  // (from, to) pair, to exercise the "n disambiguates parallel duplicates"
  // edge-id rule end to end through CENSUS_MISMATCH (not just the parser).
  const roundTripMmd = ['graph LR', '  X --> Y', '  X --> Y', ''].join('\n');
  // Elements: vertex X, vertex Y, edge:X->Y (1st X->Y), edge:X->Y:2 (2nd).

  it('CENSUS_MISMATCH exits 0 (PASS) when a census.yaml bijects onto a synthetic .mmd fixture, including a disambiguated parallel-duplicate edge id', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rules-lint-mmd-census-pass-'));
    const svgPath = path.join(dir, 'final.svg');
    const sourcePath = path.join(dir, 'source.mmd');
    const censusPath = path.join(dir, 'census.yaml');
    fs.writeFileSync(svgPath, MINIMAL_SVG);
    fs.writeFileSync(sourcePath, roundTripMmd);
    fs.writeFileSync(
      censusPath,
      [
        'source: source.mmd',
        'records:',
        '  - source_id: X',
        '    kind: vertex',
        '    label: null',
        '    primary_bucket: component',
        '    target_ids: [x]',
        '  - source_id: Y',
        '    kind: vertex',
        '    label: null',
        '    primary_bucket: component',
        '    target_ids: [y]',
        '  - source_id: "edge:X->Y"',
        '    kind: edge',
        '    label: null',
        '    primary_bucket: relationship',
        '    target_ids: [x-y-1]',
        '  - source_id: "edge:X->Y:2"',
        '    kind: edge',
        '    label: null',
        '    primary_bucket: relationship',
        '    target_ids: [x-y-2]',
        '',
      ].join('\n'),
    );

    // MINIMAL_SVG fails unrelated baseline checks (e.g. C1's palette
    // comment) on its own, so — same convention as the other cross-layer
    // fixtures above — this looks up CENSUS_MISMATCH by id rather than
    // asserting the overall exit code/FAIL count.
    const { reports } = await runJson([svgPath, '--census', censusPath]);
    const check = reports[0].checks.find((c) => c.id === 'CENSUS_MISMATCH');
    expect(check?.status).toBe('PASS');
    expect(check?.message).toMatch(/4 census record\(s\)/);
    expect(check?.message).toMatch(/bijects onto 4 source element/);
  });

  it('CENSUS_MISMATCH exits 1 (FAIL) when a census.yaml against a synthetic .mmd fixture is missing a record for one source id', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rules-lint-mmd-census-fail-'));
    const svgPath = path.join(dir, 'final.svg');
    const sourcePath = path.join(dir, 'source.mmd');
    const censusPath = path.join(dir, 'census.yaml');
    fs.writeFileSync(svgPath, MINIMAL_SVG);
    fs.writeFileSync(sourcePath, roundTripMmd);
    // Missing the record for the second (disambiguated) parallel edge,
    // "edge:X->Y:2" -- 3 records for 4 source elements.
    fs.writeFileSync(
      censusPath,
      [
        'source: source.mmd',
        'records:',
        '  - source_id: X',
        '    kind: vertex',
        '    label: null',
        '    primary_bucket: component',
        '    target_ids: [x]',
        '  - source_id: Y',
        '    kind: vertex',
        '    label: null',
        '    primary_bucket: component',
        '    target_ids: [y]',
        '  - source_id: "edge:X->Y"',
        '    kind: edge',
        '    label: null',
        '    primary_bucket: relationship',
        '    target_ids: [x-y-1]',
        '',
      ].join('\n'),
    );

    const { result, reports } = await runJson([svgPath, '--census', censusPath]);
    expect(result.exitCode).toBe(1);
    const check = reports[0].checks.find((c) => c.id === 'CENSUS_MISMATCH');
    expect(check?.status).toBe('FAIL');
    expect(check?.message).toMatch(/CENSUS_MISMATCH/);
    expect(check?.message).toMatch(/edge:X->Y:2/);
  });
});
