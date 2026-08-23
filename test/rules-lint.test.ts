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
});
