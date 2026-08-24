import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { run } from '../src/cli.js';
import {
  importSourceFile,
  importSourceText,
  scaffoldCensus,
  serializeCensus,
  serializeSourceInventory,
  sourceLayout,
} from '../src/source-import.js';
import { runCli as runRulesLint } from '../tools/rules-lint.mjs';

const root = path.resolve(import.meta.dirname, '..');
const showcase = (...parts: string[]) => path.join(root, 'examples', 'showcase', ...parts);
const fixture = (...parts: string[]) => path.join(root, 'test', 'fixtures', ...parts);

describe('source import and census scaffolding', () => {
  it('imports the real cloud mxGraph source without losing cells or the edge 38 control point', () => {
    const source = showcase('1-cloud-web-app', 'source.xml');
    const inventory = importSourceFile(source);

    expect(inventory.source.format).toBe('mxgraph');
    expect(inventory.counts).toEqual({ vertices: 28, edges: 23, total: 51 });
    expect(inventory.elements).toHaveLength(51);
    expect(inventory.elements.find((element) => element.source_id === '38')).toMatchObject({
      kind: 'edge',
      from: '40',
      to: '48',
      points: [{ x: 230, y: 760 }],
    });
    expect(serializeSourceInventory(inventory)).not.toContain('"y": 560');
    expect(inventory.diagnostics).toHaveLength(51);
    expect(inventory.diagnostics[0]).toMatchObject({
      code: 'SOURCE_CLASSIFICATION_TODO',
      source_id: '2',
    });
    expect(serializeSourceInventory(importSourceFile(source))).toBe(
      serializeSourceInventory(inventory),
    );
    const layout = sourceLayout(inventory);
    expect(layout.edges.find((edge) => edge.source_id === '38')?.points).toEqual([
      { x: 230, y: 760 },
    ]);
  });

  it('accepts uncompressed .drawio and extracts exact geometry', () => {
    const inventory = importSourceFile(path.join(root, 'examples', 'golden.drawio'));
    expect(inventory.counts).toEqual({ vertices: 2, edges: 1, total: 3 });
    expect(inventory.elements.find((element) => element.source_id === 'api')).toMatchObject({
      kind: 'vertex',
      geometry: { x: 40, y: 40, width: 160, height: 80 },
    });
    expect(inventory.elements.find((element) => element.kind === 'edge')).toMatchObject({
      from: 'api',
      to: 'ledger',
      points: [{ x: 260, y: 80 }],
    });
  });

  it('accepts a compressed .drawio page without changing source ids', () => {
    const graph =
      '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="n1" value="Node" vertex="1" parent="1"><mxGeometry x="10" y="20" width="30" height="40" as="geometry"/></mxCell></root></mxGraphModel>';
    const encoded = deflateRawSync(Buffer.from(encodeURIComponent(graph), 'utf8')).toString(
      'base64',
    );
    const inventory = importSourceText(
      `<mxfile><diagram id="page-1">${encoded}</diagram></mxfile>`,
      'compressed.drawio',
    );
    expect(inventory.counts).toEqual({ vertices: 1, edges: 0, total: 1 });
    expect(inventory.elements[0]).toMatchObject({
      source_id: 'n1',
      geometry: { x: 10, y: 20, width: 30, height: 40 },
    });
  });

  it.each([
    ['2-cicd-flow', 12, 10, 'right'],
    ['3-microservices-c4', 9, 10, 'mixed'],
    ['5-event-pipeline', 6, 5, 'right'],
  ] as const)(
    'imports the supported Mermaid dialect in %s with stable ids and counts',
    (name, vertices, edges, direction) => {
      const source = showcase(name, 'source.mmd');
      const inventory = importSourceFile(source);
      expect(inventory.counts).toEqual({ vertices, edges, total: vertices + edges });
      expect(inventory.flow.direction).toBe(direction);
      expect(new Set(inventory.elements.map((element) => element.source_id)).size).toBe(
        inventory.elements.length,
      );
      expect(serializeSourceInventory(importSourceFile(source))).toBe(
        serializeSourceInventory(inventory),
      );
      if (name === '2-cicd-flow')
        expect(
          inventory.elements.find((element) => element.source_id === 'deploy')?.parent_source_id,
        ).toBe('deploy stage');
    },
  );

  it('emits stable TODO records until classifications are supplied', () => {
    const source = showcase('5-event-pipeline', 'source.mmd');
    const inventory = importSourceFile(source);
    const scaffold = scaffoldCensus(inventory, {
      censusPath: path.join(path.dirname(source), 'generated-census.yaml'),
      sourcePath: source,
      modelPath: showcase('5-event-pipeline', 'model.yaml'),
    });
    expect(scaffold.diagnostics).toHaveLength(11);
    expect(scaffold.census.records[0]).toMatchObject({
      source_id: 'A',
      primary_bucket: 'TODO',
      target_ids: [],
      reason: expect.stringContaining('TODO'),
    });
    expect(serializeCensus(scaffold.census)).toBe(serializeCensus(scaffold.census));
  });

  it('generates a CENSUS_MISMATCH-clean census once classifications are supplied', async () => {
    const source = showcase('5-event-pipeline', 'source.mmd');
    const inventory = importSourceFile(source);
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'source-census-'));
    const censusPath = path.join(temp, 'census.yaml');
    const scaffold = scaffoldCensus(inventory, {
      censusPath,
      sourcePath: source,
      modelPath: showcase('5-event-pipeline', 'model.yaml'),
      classificationsPath: fixture('event-pipeline-classifications.yaml'),
    });
    fs.writeFileSync(censusPath, serializeCensus(scaffold.census));

    expect(scaffold.diagnostics).toEqual([]);
    const lint = await runRulesLint([
      showcase('5-event-pipeline', 'final-reproduce.svg'),
      '--model',
      showcase('5-event-pipeline', 'model.yaml'),
      '--view',
      showcase('5-event-pipeline', 'view-reproduce.yaml'),
      '--census',
      censusPath,
      '--layout',
      showcase('5-event-pipeline', 'layout-reproduce.json'),
      '--format',
      'json',
    ]);
    expect(lint.exitCode).toBe(0);
    const report = JSON.parse(lint.stdout)[0];
    expect(report.checks).toContainEqual(
      expect.objectContaining({ id: 'CENSUS_MISMATCH', status: 'PASS' }),
    );
  });

  it('exposes deterministic import-source and scaffold-census CLI commands', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'source-cli-'));
    const inventoryPath = path.join(temp, 'inventory.json');
    const layoutPath = path.join(temp, 'source-layout.json');
    const censusPath = path.join(temp, 'census.yaml');
    const source = showcase('5-event-pipeline', 'source.mmd');

    const imported = await run([
      'import-source',
      source,
      '--out',
      inventoryPath,
      '--layout-out',
      layoutPath,
    ]);
    expect(imported).toMatchObject({ exitCode: 0, stderr: '' });
    const firstBytes = fs.readFileSync(inventoryPath, 'utf8');
    expect((await run(['import-source', source, '--out', inventoryPath])).exitCode).toBe(0);
    expect(fs.readFileSync(inventoryPath, 'utf8')).toBe(firstBytes);
    expect(JSON.parse(fs.readFileSync(layoutPath, 'utf8'))).toMatchObject({
      kind: 'source-layout',
      flow: { direction: 'right', declared: true },
    });

    const scaffolded = await run([
      'scaffold-census',
      source,
      '--out',
      censusPath,
      '--model',
      showcase('5-event-pipeline', 'model.yaml'),
      '--classifications',
      fixture('event-pipeline-classifications.yaml'),
    ]);
    expect(scaffolded).toMatchObject({ exitCode: 0, stderr: '' });
    expect(fs.readFileSync(censusPath, 'utf8')).toContain('primary_bucket: component');
  });
});
