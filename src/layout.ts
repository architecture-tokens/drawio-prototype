import Ajv2020 from 'ajv/dist/2020.js';
import type { Layout, Report } from './types.js';
import { validateVisualTopology } from './topology.js';

/** Strict-schema-compatible wire contract sent to OpenAI and validated locally. */
export const layoutSchema = {
  type: 'object',
  description:
    'Renderer-independent, non-overlapping architecture layout. Every model component and relationship appears exactly once; geometry stays inside the finite canvas.',
  additionalProperties: false,
  required: ['version', 'canvas', 'nodes', 'edges'],
  properties: {
    version: { const: '0.1' },
    canvas: {
      type: 'object',
      description:
        'Finite absolute drawing surface. Root nodes and every absolute edge waypoint must remain within these width and height bounds.',
      additionalProperties: false,
      required: ['width', 'height'],
      properties: {
        width: { type: 'integer', minimum: 1 },
        height: { type: 'integer', minimum: 1 },
      },
    },
    nodes: {
      type: 'array',
      description:
        'Exactly one geometry record per model component. Unrelated nodes must not overlap, and children must be fully contained by their parent.',
      items: {
        type: 'object',
        description:
          'Component box. For a child, x/y are parent-relative offsets; width/height must fit fully inside the parent.',
        additionalProperties: false,
        required: ['id', 'x', 'y', 'width', 'height', 'parentId'],
        properties: {
          id: { type: 'string', description: 'Exact model component id; never invent an id.' },
          x: {
            type: 'integer',
            minimum: 0,
            description:
              'Horizontal position: absolute canvas x when parentId is null, otherwise a parent-relative offset from the parent left edge.',
          },
          y: {
            type: 'integer',
            minimum: 0,
            description:
              'Vertical position: absolute canvas y when parentId is null, otherwise a parent-relative offset from the parent top edge.',
          },
          width: {
            type: 'integer',
            minimum: 0,
            description: 'Box width; x + width must not exceed the containing canvas or parent.',
          },
          height: {
            type: 'integer',
            minimum: 0,
            description: 'Box height; y + height must not exceed the containing canvas or parent.',
          },
          parentId: {
            type: ['string', 'null'],
            description:
              'Containing model component id, or null for a root. A non-null value creates strict geometric containment and makes x/y parent-relative.',
          },
        },
      },
    },
    edges: {
      type: 'array',
      description:
        'Exactly one orthogonally routed connector record per model relationship. Routes must avoid nodes and unrelated connectors.',
      items: {
        type: 'object',
        description: 'Relationship route using absolute-canvas waypoints.',
        additionalProperties: false,
        required: ['id', 'waypoints'],
        properties: {
          id: {
            type: 'string',
            description: 'Exact model relationship id; never invent an id.',
          },
          waypoints: {
            type: 'array',
            description:
              'Absolute-canvas orthogonal routing points. Consecutive points must share x or y; route around boxes and avoid crossings or unrelated T-junctions.',
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
      description:
        'Source-intent topology exceptions only. Never invent an allowance to hide a crossing; use a pair only when verified source intent supplied with the input requires it.',
      additionalProperties: false,
      required: ['allowEdgeCrossings'],
      properties: {
        allowEdgeCrossings: {
          type: 'array',
          description:
            'Exact relationship-id pairs whose crossing is explicitly verified from source intent; otherwise return an empty array.',
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

const error = (
  code: string,
  message: string,
  path = '/layout',
  elementId?: string,
  relatedIds: string[] = [],
): Report['diagnostics'][number] => ({
  severity: 'error',
  code,
  path,
  message,
  layer: 'layout',
  ...(elementId ? { elementId } : {}),
  ...(relatedIds.length ? { relatedIds } : {}),
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
  const checkIds = (
    items: Array<{ id: string }>,
    expected: Set<string>,
    kind: string,
    collection: 'nodes' | 'edges',
  ) => {
    const seen = new Set<string>();
    for (const [index, item] of items.entries()) {
      if (seen.has(item.id))
        diagnostics.push(
          error(
            'DUPLICATE_LAYOUT_ID',
            `Duplicate ${kind} id ${item.id}`,
            `/layout/${collection}/${index}/id`,
            item.id,
          ),
        );
      seen.add(item.id);
      if (!expected.has(item.id))
        diagnostics.push(
          error(
            'INVENTED_LAYOUT_ID',
            `Unknown ${kind} id ${item.id}`,
            `/layout/${collection}/${index}/id`,
            item.id,
          ),
        );
    }
    for (const id of expected)
      if (!seen.has(id))
        diagnostics.push(
          error('OMITTED_LAYOUT_ID', `Missing ${kind} id ${id}`, `/layout/${collection}`, id),
        );
  };
  checkIds(layout.nodes, expectedNodes, 'node', 'nodes');
  checkIds(layout.edges, expectedEdges, 'edge', 'edges');
  for (const [index, allowance] of (layout.topology?.allowEdgeCrossings ?? []).entries()) {
    const [left, right] = allowance.edgeIds;
    if (left === right || !expectedEdges.has(left) || !expectedEdges.has(right))
      diagnostics.push(
        error(
          'INVALID_TOPOLOGY_ALLOWANCE',
          `allowEdgeCrossings must name two different model relationships; got ${left}, ${right}`,
          `/layout/topology/allowEdgeCrossings/${index}/edgeIds`,
          expectedEdges.has(left) ? left : expectedEdges.has(right) ? right : undefined,
          [left, right],
        ),
      );
  }
  const nodeIds = new Set(layout.nodes.map((node) => node.id));
  for (const [index, node] of layout.nodes.entries())
    if (node.parentId !== null && (!nodeIds.has(node.parentId) || node.parentId === node.id))
      diagnostics.push(
        error(
          'INVALID_PARENT',
          `${node.id}.parentId must name another component or null`,
          `/layout/nodes/${index}/parentId`,
          node.id,
          [node.parentId],
        ),
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
        diagnostics.push(
          error(
            'CYCLIC_PARENT',
            `Parent cycle at ${id}`,
            `/layout/nodes/${layout.nodes.findIndex((node) => node.id === id)}/parentId`,
            id,
            [...seen].filter((seenId) => seenId !== id),
          ),
        );
        break;
      }
      seen.add(cursor);
      cursor = parent.get(cursor);
    }
  }
  if (!diagnostics.length) diagnostics.push(...validateVisualTopology(layout, model));
  return { valid: !diagnostics.length, diagnostics };
}
