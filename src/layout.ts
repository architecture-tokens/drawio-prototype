import Ajv2020 from 'ajv/dist/2020.js';
import type { Layout, Report } from './types.js';
import { validateVisualTopology } from './topology.js';

/** Strict-schema-compatible wire contract sent to OpenAI and validated locally. */
export const layoutSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['version', 'canvas', 'nodes', 'edges'],
  properties: {
    version: { const: '0.1' },
    canvas: {
      type: 'object',
      additionalProperties: false,
      required: ['width', 'height'],
      properties: {
        width: { type: 'integer', minimum: 1 },
        height: { type: 'integer', minimum: 1 },
      },
    },
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'x', 'y', 'width', 'height', 'parentId'],
        properties: {
          id: { type: 'string' },
          x: { type: 'integer', minimum: 0 },
          y: { type: 'integer', minimum: 0 },
          width: { type: 'integer', minimum: 0 },
          height: { type: 'integer', minimum: 0 },
          parentId: { type: ['string', 'null'] },
        },
      },
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'waypoints'],
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
    topology: {
      type: 'object',
      additionalProperties: false,
      required: ['allowEdgeCrossings'],
      properties: {
        allowEdgeCrossings: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['edgeIds'],
            properties: {
              edgeIds: {
                type: 'array',
                minItems: 2,
                maxItems: 2,
                prefixItems: [{ type: 'string' }, { type: 'string' }],
              },
            },
          },
        },
      },
    },
  },
} as const;

type AjvValidator = {
  (value: unknown): boolean;
  errors?: Array<{ instancePath?: string; keyword: string; message?: string }>;
};
const Ajv = Ajv2020 as unknown as new (options: object) => {
  validateSchema(schema: object): boolean;
  errors?: AjvValidator['errors'];
  compile(schema: object): AjvValidator;
};
const ajv = new Ajv({ allErrors: true, strict: true });
if (!ajv.validateSchema(layoutSchema)) throw new Error('The local layout schema is invalid');
export const validateLayoutSchema = ajv.compile(layoutSchema);

const error = (code: string, message: string, path = '/layout'): Report['diagnostics'][number] => ({
  severity: 'error',
  code,
  path,
  message,
  layer: 'layout',
});

/** Runs JSON Schema before renderer-independent identity and hierarchy semantics. */
export function validateLayout(value: unknown, model: any): Report {
  if (!validateLayoutSchema(value))
    return {
      valid: false,
      diagnostics: (validateLayoutSchema.errors ?? []).map((item) =>
        error(
          'INVALID_LAYOUT_SCHEMA',
          `${item.keyword}: ${item.message ?? 'invalid layout'}`,
          item.instancePath || '/layout',
        ),
      ),
    };
  const layout = value as Layout;
  const diagnostics: Report['diagnostics'] = [];
  const expectedNodes = new Set<string>((model.components ?? []).map((x: any) => String(x.id)));
  const expectedEdges = new Set<string>((model.relationships ?? []).map((x: any) => String(x.id)));
  const checkIds = (items: Array<{ id: string }>, expected: Set<string>, kind: string) => {
    const seen = new Set<string>();
    for (const item of items) {
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
  for (const [index, allowance] of (layout.topology?.allowEdgeCrossings ?? []).entries()) {
    const [left, right] = allowance.edgeIds;
    if (left === right || !expectedEdges.has(left) || !expectedEdges.has(right))
      diagnostics.push(
        error(
          'INVALID_TOPOLOGY_ALLOWANCE',
          `allowEdgeCrossings must name two different model relationships; got ${left}, ${right}`,
          `/layout/topology/allowEdgeCrossings/${index}/edgeIds`,
        ),
      );
  }
  const nodeIds = new Set(layout.nodes.map((node) => node.id));
  for (const node of layout.nodes)
    if (node.parentId !== null && (!nodeIds.has(node.parentId) || node.parentId === node.id))
      diagnostics.push(
        error('INVALID_PARENT', `${node.id}.parentId must name another component or null`),
      );
  const parent = new Map(
    layout.nodes
      .filter(
        (node) => node.parentId !== null && nodeIds.has(node.parentId) && node.parentId !== node.id,
      )
      .map((node) => [node.id, node.parentId!]),
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
  if (!diagnostics.length) diagnostics.push(...validateVisualTopology(layout, model));
  return { valid: !diagnostics.length, diagnostics };
}
