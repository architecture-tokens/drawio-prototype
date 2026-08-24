import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { validateLayout } from '../src/layout.js';

const root = path.resolve(import.meta.dirname, '..');

const model = (componentIds: string[], relationships: any[] = []) => ({
  components: componentIds.map((id) => ({ id, type: 'core:component.service' })),
  relationships,
});

const node = (id: string, x: number, y: number, width = 80, height = 50) => ({
  id,
  x,
  y,
  width,
  height,
  parentId: null,
});

describe('layout visual topology', () => {
  it('rejects two peer nodes whose painted areas collide', () => {
    const layout = {
      version: '0.1',
      canvas: { width: 400, height: 200 },
      nodes: [node('left', 40, 40), node('right', 100, 60)],
      edges: [],
    };

    const report = validateLayout(layout, model(['left', 'right']));

    expect(report.valid).toBe(false);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'NODE_COLLISION',
        elementId: 'left',
      }),
    );
  });

  it('allows containment used as a structural overlay instead of treating it as a collision', () => {
    const layout = {
      version: '0.1',
      canvas: { width: 500, height: 240 },
      nodes: [
        node('group-band', 20, 20, 360, 160),
        node('member-a', 60, 70),
        node('member-b', 240, 70),
      ],
      edges: [],
    };

    expect(validateLayout(layout, model(['group-band', 'member-a', 'member-b']))).toEqual({
      valid: true,
      diagnostics: [],
    });
  });

  it('rejects a child whose relative geometry escapes its declared parent container', () => {
    const parent = node('parent', 20, 20, 120, 100);
    const child = { ...node('child', 140, 20, 40, 30), parentId: 'parent' };
    const layout = {
      version: '0.1',
      canvas: { width: 400, height: 240 },
      nodes: [parent, child],
      edges: [],
    };

    expect(validateLayout(layout, model(['parent', 'child'])).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'CHILD_OUTSIDE_PARENT', elementId: 'child' }),
    );
  });

  it('rejects a crossing allowance unless it names two different model relationships', () => {
    const architecture = model(
      ['a', 'b'],
      [{ id: 'a-b', from: 'a', to: 'b', type: 'core:relationship.call.sync' }],
    );
    const layout = {
      version: '0.1',
      canvas: { width: 400, height: 200 },
      nodes: [node('a', 20, 50), node('b', 260, 50)],
      edges: [{ id: 'a-b', waypoints: [] }],
      topology: { allowEdgeCrossings: [{ edgeIds: ['a-b', 'missing'] }] },
    };

    expect(validateLayout(layout, architecture).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'INVALID_TOPOLOGY_ALLOWANCE' }),
    );
  });

  it('rejects the historical cloud route crossing at y=560 and accepts its y=626 correction', () => {
    const directory = path.join(root, 'examples/showcase/1-cloud-web-app');
    const cloudModel = parseYaml(fs.readFileSync(path.join(directory, 'model.yaml'), 'utf8'));
    const corrected = JSON.parse(
      fs.readFileSync(path.join(directory, 'layout-reproduce.json'), 'utf8'),
    );
    const broken = structuredClone(corrected);
    const ingress = broken.edges.find((edge: any) => edge.id === 'user-cdn');
    ingress.waypoints[1].y = 560;
    ingress.waypoints[2].y = 560;

    const brokenReport = validateLayout(broken, cloudModel);
    expect(brokenReport.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'EDGE_CROSSING', elementId: 'user-cdn' }),
    );
    expect(validateLayout(corrected, cloudModel)).toEqual({ valid: true, diagnostics: [] });
  });

  it('keeps all five checked-in reproduce layouts collision and crossing free', () => {
    const showcase = path.join(root, 'examples/showcase');
    const directories = fs
      .readdirSync(showcase)
      .filter((entry) => /^\d+-/.test(entry))
      .map((entry) => path.join(showcase, entry));
    expect(directories).toHaveLength(5);
    for (const directory of directories) {
      const architecture = parseYaml(fs.readFileSync(path.join(directory, 'model.yaml'), 'utf8'));
      const layout = JSON.parse(
        fs.readFileSync(path.join(directory, 'layout-reproduce.json'), 'utf8'),
      );
      expect(validateLayout(layout, architecture), path.basename(directory)).toEqual({
        valid: true,
        diagnostics: [],
      });
    }
  });
});
