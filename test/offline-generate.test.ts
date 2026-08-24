import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
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
