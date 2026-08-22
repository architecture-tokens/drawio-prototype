import type { Layout, Report } from './types.js';

export const layoutSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['version', 'nodes', 'edges'],
  properties: {
    version: { const: '0.1' },
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'x', 'y', 'width', 'height'],
        properties: {
          id: { type: 'string' },
          x: { type: 'integer', minimum: 0 },
          y: { type: 'integer', minimum: 0 },
          width: { type: 'integer', minimum: 0 },
          height: { type: 'integer', minimum: 0 },
          parentId: { type: 'string' },
        },
      },
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id'],
        properties: {
          id: { type: 'string' },
          waypoints: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['x', 'y'],
              properties: {
                x: { type: 'integer', minimum: 0 },
                y: { type: 'integer', minimum: 0 },
              },
            },
          },
        },
      },
    },
  },
} as const;

const error = (code: string, message: string): Report['diagnostics'][number] => ({
  severity: 'error',
  code,
  path: '/layout',
  message,
  layer: 'layout',
});

export function validateLayout(value: unknown, model: any): Report {
  const diagnostics: Report['diagnostics'] = [];
  if (!value || typeof value !== 'object')
    return { valid: false, diagnostics: [error('INVALID_LAYOUT', 'Layout must be an object')] };
  const layout = value as Partial<Layout>;
  if (layout.version !== '0.1' || !Array.isArray(layout.nodes) || !Array.isArray(layout.edges))
    return {
      valid: false,
      diagnostics: [
        error('INVALID_LAYOUT', 'Layout must be version 0.1 with nodes and edges arrays'),
      ],
    };
  const expectedNodes = new Set<string>((model.components ?? []).map((x: any) => String(x.id)));
  const expectedEdges = new Set<string>((model.relationships ?? []).map((x: any) => String(x.id)));
  const checkIds = (items: any[], expected: Set<string>, kind: string) => {
    const seen = new Set<string>();
    for (const item of items) {
      if (!item || typeof item.id !== 'string') {
        diagnostics.push(error('INVALID_LAYOUT_ID', `${kind} has no string id`));
        continue;
      }
      if (seen.has(item.id))
        diagnostics.push(error('DUPLICATE_LAYOUT_ID', `Duplicate ${kind} id ${item.id}`));
      seen.add(item.id);
      if (!expected.has(item.id))
        diagnostics.push(error('INVENTED_LAYOUT_ID', `Unknown ${kind} id ${item.id}`));
    }
    for (const id of expected)
      if (!seen.has(id)) diagnostics.push(error('OMITTED_LAYOUT_ID', `Missing ${kind} id ${id}`));
  };
  checkIds(layout.nodes, expectedNodes, 'node');
  checkIds(layout.edges, expectedEdges, 'edge');
  const nodeIds = new Set(layout.nodes.map((x) => x.id));
  for (const node of layout.nodes) {
    for (const key of ['x', 'y', 'width', 'height'] as const)
      if (!Number.isInteger(node[key]) || node[key] < 0)
        diagnostics.push(
          error('INVALID_GEOMETRY', `${node.id}.${key} must be a non-negative integer`),
        );
    if (node.parentId !== undefined && (!nodeIds.has(node.parentId) || node.parentId === node.id))
      diagnostics.push(error('INVALID_PARENT', `${node.id}.parentId must name another component`));
  }
  const parent = new Map(
    layout.nodes
      .filter((n) => n.parentId && nodeIds.has(n.parentId) && n.parentId !== n.id)
      .map((n) => [n.id, n.parentId!]),
  );
  for (const id of parent.keys()) {
    const seen = new Set<string>();
    let cursor: string | undefined = id;
    while (cursor) {
      if (seen.has(cursor)) {
        diagnostics.push(error('CYCLIC_PARENT', `Parent cycle at ${id}`));
        break;
      }
      seen.add(cursor);
      cursor = parent.get(cursor);
    }
  }
  for (const edge of layout.edges)
    for (const point of edge.waypoints ?? [])
      if (!Number.isInteger(point?.x) || !Number.isInteger(point?.y) || point.x < 0 || point.y < 0)
        diagnostics.push(
          error('INVALID_WAYPOINT', `${edge.id} waypoint must use non-negative integers`),
        );
  return { valid: !diagnostics.length, diagnostics };
}
