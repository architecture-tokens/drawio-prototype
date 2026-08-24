import type { Diagnostic, Layout, LayoutNode, Point } from './types.js';

type Box = {
  id: string;
  node: LayoutNode;
  x: number;
  y: number;
  x2: number;
  y2: number;
};

type Segment = {
  edgeId: string;
  a: Point;
  b: Point;
  axis: 'horizontal' | 'vertical';
};

const EPSILON = 0.01;

const diagnostic = (
  code: string,
  message: string,
  elementId: string,
  path: string,
  relatedIds: string[] = [],
): Diagnostic => ({
  severity: 'error',
  code,
  layer: 'layout',
  path,
  message,
  elementId,
  ...(relatedIds.length ? { relatedIds } : {}),
});

function resolveBoxes(layout: Layout): Map<string, Box> {
  const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
  const origins = new Map<string, { x: number; y: number }>();
  const resolveOrigin = (id: string, seen = new Set<string>()): { x: number; y: number } | null => {
    const cached = origins.get(id);
    if (cached) return cached;
    const node = nodes.get(id);
    if (!node || seen.has(id)) return null;
    seen.add(id);
    const parentOrigin = node.parentId ? resolveOrigin(node.parentId, seen) : { x: 0, y: 0 };
    if (!parentOrigin) return null;
    const result = { x: parentOrigin.x + node.x, y: parentOrigin.y + node.y };
    origins.set(id, result);
    return result;
  };
  const boxes = new Map<string, Box>();
  for (const node of layout.nodes) {
    const origin = resolveOrigin(node.id);
    if (!origin) continue;
    boxes.set(node.id, {
      id: node.id,
      node,
      x: origin.x,
      y: origin.y,
      x2: origin.x + node.width,
      y2: origin.y + node.height,
    });
  }
  return boxes;
}

const positiveAreaOverlap = (a: Box, b: Box) =>
  Math.min(a.x2, b.x2) - Math.max(a.x, b.x) > EPSILON &&
  Math.min(a.y2, b.y2) - Math.max(a.y, b.y) > EPSILON;

const contains = (outer: Box, inner: Box) =>
  outer.x <= inner.x + EPSILON &&
  outer.y <= inner.y + EPSILON &&
  outer.x2 >= inner.x2 - EPSILON &&
  outer.y2 >= inner.y2 - EPSILON &&
  (outer.x < inner.x - EPSILON ||
    outer.y < inner.y - EPSILON ||
    outer.x2 > inner.x2 + EPSILON ||
    outer.y2 > inner.y2 + EPSILON);

const encloses = (outer: Box, inner: Box) =>
  outer.x <= inner.x + EPSILON &&
  outer.y <= inner.y + EPSILON &&
  outer.x2 >= inner.x2 - EPSILON &&
  outer.y2 >= inner.y2 - EPSILON;

function isAncestor(ancestorId: string, node: LayoutNode, byId: Map<string, LayoutNode>): boolean {
  let parentId = node.parentId;
  const seen = new Set<string>();
  while (parentId && !seen.has(parentId)) {
    if (parentId === ancestorId) return true;
    seen.add(parentId);
    parentId = byId.get(parentId)?.parentId ?? null;
  }
  return false;
}

const center = (box: Box): Point => ({ x: (box.x + box.x2) / 2, y: (box.y + box.y2) / 2 });

const dedupeAdjacent = (points: Point[]): Point[] =>
  points.filter(
    (point, index) =>
      index === 0 ||
      Math.abs(point.x - points[index - 1].x) > EPSILON ||
      Math.abs(point.y - points[index - 1].y) > EPSILON,
  );

/**
 * Reconstructs the orthogonal dogleg draw.io inserts between a box and an
 * off-axis waypoint. The closest box side determines the attachment side;
 * this is vocabulary-independent and mirrors the checked-in layouts.
 */
function boxToWaypoint(box: Box, waypoint: Point): Point[] {
  const c = center(box);
  const outside = [
    { side: 'left', distance: Math.max(0, box.x - waypoint.x) },
    { side: 'right', distance: Math.max(0, waypoint.x - box.x2) },
    { side: 'top', distance: Math.max(0, box.y - waypoint.y) },
    { side: 'bottom', distance: Math.max(0, waypoint.y - box.y2) },
  ].filter((candidate) => candidate.distance > EPSILON);
  const closest = outside.sort((a, b) => a.distance - b.distance)[0];
  const side =
    closest?.side ??
    ([
      { side: 'left', distance: Math.abs(waypoint.x - box.x) },
      { side: 'right', distance: Math.abs(waypoint.x - box.x2) },
      { side: 'top', distance: Math.abs(waypoint.y - box.y) },
      { side: 'bottom', distance: Math.abs(waypoint.y - box.y2) },
    ].sort((a, b) => a.distance - b.distance)[0]?.side as string);
  if (side === 'top' || side === 'bottom') {
    const attachment = { x: c.x, y: side === 'top' ? box.y : box.y2 };
    return dedupeAdjacent([attachment, { x: c.x, y: waypoint.y }, waypoint]);
  }
  const attachment = { x: side === 'left' ? box.x : box.x2, y: c.y };
  return dedupeAdjacent([attachment, { x: waypoint.x, y: c.y }, waypoint]);
}

function routePoints(edge: Layout['edges'][number], relationship: any, boxes: Map<string, Box>) {
  if (!relationship || edge.waypoints.length === 0) return [];
  const source = boxes.get(String(relationship.from));
  const target = boxes.get(String(relationship.to));
  if (!source || !target) return [];
  const first = edge.waypoints[0];
  const last = edge.waypoints[edge.waypoints.length - 1];
  return dedupeAdjacent([
    ...boxToWaypoint(source, first),
    ...edge.waypoints.slice(1),
    ...boxToWaypoint(target, last).reverse().slice(1),
  ]);
}

function routeSegments(layout: Layout, model: any, boxes: Map<string, Box>): Segment[] {
  const relationships = new Map<string, any>(
    (model.relationships ?? []).map((relationship: any) => [String(relationship.id), relationship]),
  );
  const segments: Segment[] = [];
  for (const edge of layout.edges) {
    const points = routePoints(edge, relationships.get(edge.id), boxes);
    for (let index = 0; index + 1 < points.length; index += 1) {
      const a = points[index];
      const b = points[index + 1];
      const horizontal = Math.abs(a.y - b.y) <= 1;
      const vertical = Math.abs(a.x - b.x) <= 1;
      if (!horizontal && !vertical) continue;
      segments.push({
        edgeId: edge.id,
        a: horizontal ? { x: a.x, y: (a.y + b.y) / 2 } : { x: (a.x + b.x) / 2, y: a.y },
        b: horizontal ? { x: b.x, y: (a.y + b.y) / 2 } : { x: (a.x + b.x) / 2, y: b.y },
        axis: horizontal ? 'horizontal' : 'vertical',
      });
    }
  }
  return segments;
}

const between = (value: number, a: number, b: number) =>
  value >= Math.min(a, b) - EPSILON && value <= Math.max(a, b) + EPSILON;
const strictlyBetween = (value: number, a: number, b: number) =>
  value > Math.min(a, b) + EPSILON && value < Math.max(a, b) - EPSILON;

function perpendicularIntersection(a: Segment, b: Segment) {
  if (a.axis === b.axis) return null;
  const horizontal = a.axis === 'horizontal' ? a : b;
  const vertical = a.axis === 'vertical' ? a : b;
  const point = { x: vertical.a.x, y: horizontal.a.y };
  if (
    !between(point.x, horizontal.a.x, horizontal.b.x) ||
    !between(point.y, vertical.a.y, vertical.b.y)
  )
    return null;
  return {
    point,
    horizontalInterior: strictlyBetween(point.x, horizontal.a.x, horizontal.b.x),
    verticalInterior: strictlyBetween(point.y, vertical.a.y, vertical.b.y),
  };
}

const pointInsideBox = (point: Point, box: Box) =>
  between(point.x, box.x, box.x2) && between(point.y, box.y, box.y2);

function relationshipEndpoints(model: any): Map<string, Set<string>> {
  return new Map<string, Set<string>>(
    (model.relationships ?? []).map((relationship: any) => [
      String(relationship.id),
      new Set([String(relationship.from), String(relationship.to)]),
    ]),
  );
}

function shareEndpoint(a: string, b: string, endpoints: Map<string, Set<string>>): boolean {
  const left = endpoints.get(a);
  const right = endpoints.get(b);
  return Boolean(left && right && [...left].some((id) => right.has(id)));
}

/** Renderer-independent geometry checks which complement layout schema/identity validation. */
export function validateVisualTopology(layout: Layout, model: any): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const boxMap = resolveBoxes(layout);
  const boxes = [...boxMap.values()];
  const byId = new Map(layout.nodes.map((item) => [item.id, item]));
  for (const child of boxes) {
    if (!child.node.parentId) continue;
    const parent = boxMap.get(child.node.parentId);
    if (!parent || encloses(parent, child)) continue;
    diagnostics.push(
      diagnostic(
        'CHILD_OUTSIDE_PARENT',
        `${child.id} is not geometrically contained by its declared parent ${parent.id}`,
        child.id,
        `/layout/nodes/${layout.nodes.indexOf(child.node)}`,
        [parent.id],
      ),
    );
  }
  // A non-parented band is still mechanically recognizable as structural
  // when it completely contains two or more component boxes. This covers
  // crossing overlays (for example AZ x deployment-group bands) without a
  // vocabulary-specific id/type allowlist. One accidental containment is
  // not enough to waive collision detection.
  const inferredStructural = new Set(
    boxes
      .filter(
        (outer) => boxes.filter((inner) => outer !== inner && contains(outer, inner)).length >= 2,
      )
      .map((box) => box.id),
  );
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      if (!positiveAreaOverlap(a, b)) continue;
      const aContainsB = contains(a, b);
      const bContainsA = contains(b, a);
      if (
        (aContainsB && (isAncestor(a.id, b.node, byId) || inferredStructural.has(a.id))) ||
        (bContainsA && (isAncestor(b.id, a.node, byId) || inferredStructural.has(b.id)))
      )
        continue;
      diagnostics.push(
        diagnostic(
          'NODE_COLLISION',
          `Nodes ${a.id} and ${b.id} overlap with positive painted area`,
          a.id,
          `/layout/nodes/${layout.nodes.indexOf(a.node)}`,
          [b.id],
        ),
      );
    }
  }
  const segments = routeSegments(layout, model, boxMap);
  const endpoints = relationshipEndpoints(model);
  const allowedCrossings = new Set(
    (layout.topology?.allowEdgeCrossings ?? []).map(({ edgeIds }) =>
      [...edgeIds].sort().join('\0'),
    ),
  );
  const reported = new Set<string>();
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const a = segments[i];
      const b = segments[j];
      if (a.edgeId === b.edgeId) continue;
      const intersection = perpendicularIntersection(a, b);
      if (!intersection || boxes.some((box) => pointInsideBox(intersection.point, box))) continue;
      const pair = [a.edgeId, b.edgeId].sort();
      const key = pair.join('\0');
      if (reported.has(key)) continue;
      const properCrossing = intersection.horizontalInterior && intersection.verticalInterior;
      // Fan-in/fan-out routes which share a semantic model endpoint may
      // overlap or meet anywhere along their shared bus. That is topology,
      // not an unrelated edge crossing.
      if (shareEndpoint(a.edgeId, b.edgeId, endpoints)) continue;
      if (properCrossing && allowedCrossings.has(key)) continue;
      reported.add(key);
      const code = properCrossing ? 'EDGE_CROSSING' : 'INVALID_EDGE_JUNCTION';
      diagnostics.push(
        diagnostic(
          code,
          `${pair[0]} and ${pair[1]} ${properCrossing ? 'cross' : 'form an unrelated T-junction'} at (${intersection.point.x}, ${intersection.point.y})`,
          pair[0],
          `/layout/edges/${layout.edges.findIndex((edge) => edge.id === pair[0])}`,
          [pair[1]],
        ),
      );
    }
  }
  return diagnostics;
}
