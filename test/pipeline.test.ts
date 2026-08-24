import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- tools/architecture-pipeline.mjs is plain JS outside tsconfig include.
import { runAllPipelines, runPipeline } from '../tools/architecture-pipeline.mjs';

const root = path.resolve(import.meta.dirname, '..');
const showcase = (name: string) => path.join(root, 'examples', 'showcase', name);

describe('Architecture Tokens integration pipeline', () => {
  it('imports, validates, renders, and full-gates the real cloud example in one call', async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'archtokens-cloud-pipeline-'));

    const report = await runPipeline({
      exampleDir: showcase('1-cloud-web-app'),
      outDir,
    });

    expect(report).toMatchObject({
      example: '1-cloud-web-app',
      source: { format: 'mxgraph', vertices: 28, edges: 23 },
      generation: { exitCode: 0 },
      gate: { exitCode: 0, summary: { FAIL: 0 } },
    });
    const xml = fs.readFileSync(path.join(outDir, 'out.drawio'), 'utf8');
    expect(xml).toContain('shape=mxgraph.aws4.user;');
    expect(xml).toContain('shape=mxgraph.aws4.ssl_padlock;');
    expect(xml).toContain('data-view-element="az-band-a"');
    expect(xml).toContain('<mxPoint x="259" y="626"/>');
    expect(fs.existsSync(path.join(outDir, 'source-inventory.json'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'source-layout.json'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(outDir, 'pipeline-report.json'), 'utf8'))).toEqual(
      report,
    );
  });

  it('generates the gate matrix from fresh draw.io and Mermaid pipeline results', async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'archtokens-all-pipeline-'));

    const result = await runAllPipelines({
      showcaseRoot: path.join(root, 'examples', 'showcase'),
      outDir,
    });

    expect(result.ok).toBe(true);
    expect(result.reports).toHaveLength(5);
    expect(
      result.reports.find((report: any) => report.example === '1-cloud-web-app'),
    ).toMatchObject({
      source: { format: 'mxgraph' },
      generation: { exitCode: 0 },
      gate: { summary: { FAIL: 0 } },
    });
    expect(
      result.reports.find((report: any) => report.example === '5-event-pipeline'),
    ).toMatchObject({
      source: { format: 'mermaid-flowchart', vertices: 6, edges: 5 },
      generation: { exitCode: 0 },
      gate: { summary: { PASS: 17, FAIL: 0 } },
    });
    expect(fs.readFileSync(path.join(outDir, '5-event-pipeline', 'out.drawio'), 'utf8')).toContain(
      'data-component="producer"',
    );
    const matrix = fs.readFileSync(path.join(outDir, 'gate-matrix.md'), 'utf8');
    expect(matrix).toMatch(
      /\| 1-cloud-web-app\s+\| mxgraph\s+\|\s+28 \/ 23 \|\s+15 \|\s+0 \|\s+1 \|/,
    );
    expect(matrix).toMatch(
      /\| 5-event-pipeline\s+\| mermaid-flowchart \|\s+6 \/ 5 \|\s+17 \|\s+0 \|\s+0 \|/,
    );
    expect(matrix).toContain('generated from actual pipeline reports');
  });
});
