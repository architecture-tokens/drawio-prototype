import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
// @ts-expect-error -- tools/offline-generate.mjs is plain JS and outside tsconfig's `include`.
import { runOffline } from '../tools/offline-generate.mjs';

const root = path.resolve(import.meta.dirname, '..');
const fixture = (...parts: string[]) => path.join(root, 'examples', ...parts);

describe('tools/offline-generate.mjs', () => {
  it('regenerates the golden example byte-for-byte and exits 0', async () => {
    const out = path.join(os.tmpdir(), `offline-golden-${Date.now()}.drawio`);
    const result = await runOffline([
      fixture('payments.yaml'),
      fixture('golden-layout.json'),
      '--out',
      out,
    ]);
    expect(result.exitCode).toBe(0);
    expect(fs.readFileSync(out, 'utf8')).toBe(fs.readFileSync(fixture('golden.drawio'), 'utf8'));
  });

  it('regenerates cloud-web-app from model + view + layout with editable visual bindings', async () => {
    const cloud = (...parts: string[]) => fixture('showcase', '1-cloud-web-app', ...parts);
    const out = path.join(os.tmpdir(), `offline-cloud-view-${Date.now()}.drawio`);

    const result = await runOffline([
      cloud('model.yaml'),
      cloud('layout-reproduce.json'),
      '--view',
      cloud('view-reproduce.yaml'),
      '--library',
      cloud('tokens.yaml'),
      '--out',
      out,
    ]);

    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
    const xml = fs.readFileSync(out, 'utf8');
    const cloudModel = parse(fs.readFileSync(cloud('model.yaml'), 'utf8'));
    for (const component of cloudModel.components)
      expect(xml, `missing component binding ${component.id}`).toContain(
        `data-component="${component.id}"`,
      );
    for (const relationship of cloudModel.relationships)
      expect(xml, `missing relationship binding ${relationship.id}`).toContain(
        `data-relationship="${relationship.id}"`,
      );
    for (const visualId of ['az-band-a', 'az-band-b', 'web-asg-band', 'app-asg-band'])
      expect(xml, `missing visual binding ${visualId}`).toContain(
        `data-view-element="${visualId}"`,
      );

    expect(xml).toContain('shape=mxgraph.aws4.user;');
    expect(xml).toContain('resIcon=mxgraph.aws4.cloudfront;');
    expect(xml).toContain('shape=mxgraph.aws4.m4_instance;');
    expect(xml).toContain('shape=mxgraph.aws4.ssl_padlock;');
    expect(xml).toContain('grIcon=mxgraph.aws4.group_availability_zone;');
    expect(xml).toContain('grIcon=mxgraph.aws4.group_auto_scaling_group;');
    expect(xml).toContain('<mxPoint x="259" y="626"/>');
    expect(xml).not.toContain('<mxPoint x="259" y="560"/>');
  });

  it('exits 4 and writes no output for a layout missing a component geometry', async () => {
    const golden = JSON.parse(fs.readFileSync(fixture('golden-layout.json'), 'utf8'));
    // Drop the `ledger` node entirely: the layout contract requires exactly
    // one geometry record per model component, so this is invalid and the
    // offline planner stub returns it unchanged on the repair retry too.
    const missingGeometry = {
      ...golden,
      nodes: golden.nodes.filter((node: { id: string }) => node.id !== 'ledger'),
    };
    const layoutPath = path.join(os.tmpdir(), `offline-missing-geometry-${Date.now()}.json`);
    fs.writeFileSync(layoutPath, JSON.stringify(missingGeometry));
    const out = path.join(os.tmpdir(), `offline-missing-geometry-${Date.now()}.drawio`);

    const result = await runOffline([fixture('payments.yaml'), layoutPath, '--out', out]);

    expect(result.exitCode).toBe(4);
    expect(fs.existsSync(out)).toBe(false);
  });

  it('exits 2 with usage text when --out is missing', async () => {
    const result = await runOffline([fixture('payments.yaml'), fixture('golden-layout.json')]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('Usage:');
    expect(result.stderr).toContain('offline-generate.mjs');
  });
});
