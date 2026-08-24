import { describe, expect, it } from 'vitest';
import { renderDrawio } from '../src/drawio.js';
import type { ArchitectureView, Layout } from '../src/types.js';

const model = {
  id: 'renderer-contract',
  components: [
    {
      id: 'service',
      type: 'core:component.service',
      metadata: { name: 'Service' },
      tokens: [{ token: 'environment:environment.production' }],
    },
  ],
  relationships: [],
};

const layout: Layout = {
  version: '0.1',
  canvas: { width: 320, height: 180 },
  nodes: [{ id: 'service', x: 80, y: 50, width: 160, height: 80, parentId: null }],
  edges: [],
};

const view: ArchitectureView = {
  kind: 'view',
  version: '0.1.0',
  id: 'renderer-contract-view',
  model: 'model.yaml',
  mode: 'reproduce',
  flow: { direction: 'right' },
  components: {
    service: [{ icon: 'vendor.icon-that-does-not-exist', anchor: 'middle-center' }],
  },
  relationships: {},
  visualElements: [],
};

describe('Architecture View draw.io renderer', () => {
  it('fails explicitly when a view attachment uses unknown visual vocabulary', () => {
    expect(() => renderDrawio(model, layout, view)).toThrowError(
      'Unknown Architecture View icon "vendor.icon-that-does-not-exist" at components.service[0]',
    );
  });

  it('fails explicitly when a visual element kind is not registered', () => {
    const unknownGroupView: ArchitectureView = {
      ...view,
      components: {},
      visualElements: [
        {
          id: 'mystery-group',
          kind: 'vendor.shape-that-does-not-exist',
          members: ['service'],
        },
      ],
    };

    expect(() => renderDrawio(model, layout, unknownGroupView)).toThrowError(
      'Unknown Architecture View visual element kind "vendor.shape-that-does-not-exist" at visualElements[0].kind',
    );
  });
});
