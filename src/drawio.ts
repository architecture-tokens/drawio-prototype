import fs from 'node:fs';
import path from 'node:path';
import {
  assertKnownVisualVocabulary,
  attachmentRegistry,
  visualElementRegistry,
} from './renderer-registry.js';
import type { ArchitectureView, Layout, LayoutNode, ViewAnchor, ViewAttachment } from './types.js';

const escapeXml = (value: unknown) =>
  String(value ?? '').replace(
    /[<>&"']/g,
    (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]!,
  );
const styleFor = (type: string) =>
  type === 'core:component.database'
    ? 'shape=cylinder;whiteSpace=wrap;html=1;boundedLbl=1;'
    : type === 'core:component.external-actor'
      ? 'shape=actor;whiteSpace=wrap;html=1;'
      : type === 'core:component.service'
        ? 'rounded=1;whiteSpace=wrap;html=1;'
        : 'whiteSpace=wrap;html=1;';
const edgeStyle = (type: string) =>
  type === 'core:relationship.belongs.to'
    ? 'endArrow=open;dashed=1;html=1;'
    : 'endArrow=block;html=1;';
const attrs = (pairs: Record<string, string | undefined>) =>
  Object.entries(pairs)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ` ${key}="${escapeXml(value)}"`)
    .join('');

const graph = (model: any, cells: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net" version="24.7.17"><diagram id="${escapeXml(model.id)}" name="${escapeXml(model.id)}"><mxGraphModel><root>${cells.join('')}</root></mxGraphModel></diagram></mxfile>\n`;

/** The pre-view renderer is intentionally isolated to preserve its byte contract. */
function renderLegacyDrawio(model: any, layout: Layout): string {
  const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
  const edges = new Map(layout.edges.map((edge) => [edge.id, edge]));
  const components = [...model.components].sort((a, b) => a.id.localeCompare(b.id));
  const relationships = [...model.relationships].sort((a, b) => a.id.localeCompare(b.id));
  const cells = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>'];
  for (const component of components) {
    const node = nodes.get(component.id)!;
    const label = component.metadata?.name ?? component.metadata?.label ?? component.id;
    cells.push(
      `<mxCell${attrs({ id: component.id, value: label, style: styleFor(component.type), vertex: '1', parent: node.parentId ?? '1' })}><mxGeometry${attrs({ x: String(node.x), y: String(node.y), width: String(node.width), height: String(node.height) })} as="geometry"/></mxCell>`,
    );
  }
  for (const relationship of relationships) {
    const edge = edges.get(relationship.id)!;
    const points = edge.waypoints.length
      ? `<Array as="points">${edge.waypoints.map((point) => `<mxPoint x="${point.x}" y="${point.y}"/>`).join('')}</Array>`
      : '';
    cells.push(
      `<mxCell${attrs({ id: relationship.id, value: relationship.metadata?.label ?? relationship.id, style: edgeStyle(relationship.type), edge: '1', parent: '1', source: relationship.from, target: relationship.to })}><mxGeometry relative="1" as="geometry">${points}</mxGeometry></mxCell>`,
    );
  }
  return graph(model, cells);
}

type Box = { x: number; y: number; width: number; height: number };
type ResolvedVisual = {
  element: ArchitectureView['visualElements'][number];
  cellId: string;
  box: Box;
  structuralComponentId?: string;
};

const tokenRefs = (item: any): string[] =>
  (item.tokens ?? []).map((application: any) => application.token).sort();

const semanticComponentStyle = (component: any) => {
  const tokens = new Set(tokenRefs(component));
  const fragments = [styleFor(component.type)];
  if (tokens.has('environment:environment.production'))
    fragments.push('fillColor=#F5F8FC;strokeColor=#5A6C86;');
  if (tokens.has('environment:environment.development'))
    fragments.push('fillColor=#F0FDF4;strokeColor=#3F8F5B;');
  if (tokens.has('infra:deployment.multi-az'))
    fragments.push('dashed=1;strokeWidth=2;container=1;pointerEvents=0;');
  if (tokens.has('c4:component.external')) fragments.push('dashed=1;');
  return fragments.join('');
};

const semanticRelationshipStyle = (relationship: any) => {
  const tokens = new Set(tokenRefs(relationship));
  const fragments = [
    edgeStyle(relationship.type),
    'edgeStyle=orthogonalEdgeStyle;orthogonalLoop=1;rounded=1;jettySize=auto;',
  ];
  if (tokens.has('security:security.encryption.in-transit'))
    fragments.push('strokeColor=#505863;strokeWidth=2;');
  if (tokens.has('cicd:pipeline.stage-transition'))
    fragments.push('strokeColor=#4F46E5;strokeWidth=2;');
  return fragments.join('');
};

const absoluteNodeBoxes = (layout: Layout): Map<string, Box> => {
  const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
  const resolved = new Map<string, Box>();
  const resolving = new Set<string>();
  const resolve = (node: LayoutNode): Box => {
    const prior = resolved.get(node.id);
    if (prior) return prior;
    if (resolving.has(node.id)) throw new Error(`Layout parent cycle at ${node.id}`);
    resolving.add(node.id);
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    const parentBox = parent ? resolve(parent) : { x: 0, y: 0, width: 0, height: 0 };
    const box = {
      x: parentBox.x + node.x,
      y: parentBox.y + node.y,
      width: node.width,
      height: node.height,
    };
    resolving.delete(node.id);
    resolved.set(node.id, box);
    return box;
  };
  layout.nodes.forEach(resolve);
  return resolved;
};

const contains = (outer: Box, inner: Box) =>
  outer.x <= inner.x &&
  outer.y <= inner.y &&
  outer.x + outer.width >= inner.x + inner.width &&
  outer.y + outer.height >= inner.y + inner.height;

const union = (boxes: Box[]): Box => {
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

const padded = (box: Box, kind?: string): Box => {
  const horizontal = kind === 'availability-zone-band' ? 18 : 20;
  const vertical = kind === 'availability-zone-band' ? 10 : 20;
  return {
    x: box.x - horizontal,
    y: box.y - vertical,
    width: box.width + horizontal * 2,
    height: box.height + vertical * 2,
  };
};

const resolveVisualElements = (
  view: ArchitectureView,
  layout: Layout,
  componentIds: Set<string>,
): ResolvedVisual[] => {
  const boxes = absoluteNodeBoxes(layout);
  return view.visualElements.map((element) => {
    const members = element.members.map((id) => boxes.get(id)!);
    if (!members.length) {
      const height = element.kind === 'title-band' ? 54 : 60;
      return {
        element,
        cellId: `view:${element.id}`,
        box: { x: 20, y: 20, width: Math.max(layout.canvas.width - 40, 1), height },
      };
    }
    const candidates = layout.nodes
      .filter(
        (node) =>
          componentIds.has(node.id) &&
          !element.members.includes(node.id) &&
          members.every((member) => contains(boxes.get(node.id)!, member)),
      )
      .sort((a, b) => {
        const aBox = boxes.get(a.id)!;
        const bBox = boxes.get(b.id)!;
        return aBox.width * aBox.height - bBox.width * bBox.height || a.id.localeCompare(b.id);
      });
    const structural = candidates[0];
    if (structural)
      return {
        element,
        cellId: structural.id,
        box: boxes.get(structural.id)!,
        structuralComponentId: structural.id,
      };
    return { element, cellId: `view:${element.id}`, box: padded(union(members), element.kind) };
  });
};

const anchorPosition = (
  anchor: ViewAnchor,
  container: Pick<Box, 'width' | 'height'>,
  size: number,
  offset: ViewAttachment['offset'],
) => {
  const horizontal = anchor.endsWith('left')
    ? 6
    : anchor.endsWith('right')
      ? container.width - size - 6
      : (container.width - size) / 2;
  const vertical = anchor.startsWith('top')
    ? 6
    : anchor.startsWith('bottom')
      ? container.height - size - 6
      : (container.height - size) / 2;
  return { x: horizontal + (offset?.dx ?? 0), y: vertical + (offset?.dy ?? 0) };
};

const attachmentCell = (
  id: string,
  ownerId: string,
  attachment: ViewAttachment,
  index: number,
  box: Box,
) => {
  const size = 28;
  const position = anchorPosition(attachment.anchor, box, size, attachment.offset);
  return `<mxCell${attrs({ id, value: '', style: attachmentRegistry[attachment.icon].style, vertex: '1', parent: ownerId, 'data-view-attachment': attachment.icon, 'data-view-attachment-index': String(index) })}><mxGeometry${attrs({ x: String(position.x), y: String(position.y), width: String(size), height: String(size) })} as="geometry"/></mxCell>`;
};

const pointAlongRoute = (points: Array<{ x: number; y: number }>, ratio: number) => {
  const lengths = points
    .slice(1)
    .map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
  const target = lengths.reduce((total, length) => total + length, 0) * ratio;
  let travelled = 0;
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index];
    if (travelled + length >= target) {
      const local = length === 0 ? 0 : (target - travelled) / length;
      return {
        x: points[index].x + (points[index + 1].x - points[index].x) * local,
        y: points[index].y + (points[index + 1].y - points[index].y) * local,
      };
    }
    travelled += length;
  }
  return points.at(-1)!;
};

function renderViewDrawio(model: any, layout: Layout, view: ArchitectureView): string {
  const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
  const edges = new Map(layout.edges.map((edge) => [edge.id, edge]));
  const components = [...model.components].sort((a, b) => a.id.localeCompare(b.id));
  const relationships = [...model.relationships].sort((a, b) => a.id.localeCompare(b.id));
  const visuals = resolveVisualElements(
    view,
    layout,
    new Set(components.map((component) => component.id)),
  );
  const absoluteBoxes = absoluteNodeBoxes(layout);
  const structuralVisuals = new Map(
    visuals
      .filter((visual) => visual.structuralComponentId)
      .map((visual) => [visual.structuralComponentId!, visual]),
  );
  const cells = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>'];

  // View-only groups are emitted first so they remain behind model nodes.
  for (const visual of visuals.filter((item) => !item.structuralComponentId)) {
    const { element, box } = visual;
    const style = element.kind
      ? visualElementRegistry[element.kind].style
      : 'rounded=1;strokeColor=#6B7280;fillColor=none;dashed=1;html=1;pointerEvents=0;';
    cells.push(
      `<mxCell${attrs({ id: visual.cellId, value: element.label ?? element.id, style, vertex: '1', parent: '1', 'data-view-element': element.id, 'data-view-kind': element.kind, 'data-view-members': [...element.members].sort().join(',') })}><mxGeometry${attrs({ x: String(box.x), y: String(box.y), width: String(box.width), height: String(box.height) })} as="geometry"/></mxCell>`,
    );
    (element.attachments ?? []).forEach((attachment, index) =>
      cells.push(
        attachmentCell(`${visual.cellId}:attachment:${index}`, visual.cellId, attachment, index, {
          x: 0,
          y: 0,
          width: box.width,
          height: box.height,
        }),
      ),
    );
  }

  for (const component of components) {
    const node = nodes.get(component.id)!;
    const label = component.metadata?.name ?? component.metadata?.label ?? component.id;
    const attachments = view.components[component.id] ?? [];
    const primary = attachments.find(
      (attachment) => attachmentRegistry[attachment.icon].role === 'component-icon',
    );
    const structuralVisual = structuralVisuals.get(component.id);
    const style = primary
      ? attachmentRegistry[primary.icon].style
      : structuralVisual?.element.kind
        ? visualElementRegistry[structuralVisual.element.kind].style
        : semanticComponentStyle(component);
    cells.push(
      `<mxCell${attrs({ id: component.id, value: label, style, vertex: '1', parent: node.parentId ?? '1', 'data-component': component.id, 'data-component-type': component.type, 'data-token-refs': tokenRefs(component).join(','), 'data-view-icons': attachments.map((attachment) => attachment.icon).join(','), 'data-view-element': structuralVisual?.element.id, 'data-view-kind': structuralVisual?.element.kind, 'data-view-members': structuralVisual ? [...structuralVisual.element.members].sort().join(',') : undefined })}><mxGeometry${attrs({ x: String(node.x), y: String(node.y), width: String(node.width), height: String(node.height) })} as="geometry"/></mxCell>`,
    );
    attachments
      .filter((attachment) => attachment !== primary)
      .forEach((attachment, index) =>
        cells.push(
          attachmentCell(`${component.id}:attachment:${index}`, component.id, attachment, index, {
            x: 0,
            y: 0,
            width: node.width,
            height: node.height,
          }),
        ),
      );
    if (structuralVisual)
      (structuralVisual.element.attachments ?? []).forEach((attachment, index) =>
        cells.push(
          attachmentCell(
            `${component.id}:view-attachment:${index}`,
            component.id,
            attachment,
            index,
            { x: 0, y: 0, width: node.width, height: node.height },
          ),
        ),
      );
  }

  for (const relationship of relationships) {
    const edge = edges.get(relationship.id)!;
    const points = edge.waypoints.length
      ? `<Array as="points">${edge.waypoints.map((point) => `<mxPoint x="${point.x}" y="${point.y}"/>`).join('')}</Array>`
      : '';
    const attachments = view.relationships[relationship.id] ?? [];
    cells.push(
      `<mxCell${attrs({ id: relationship.id, value: relationship.metadata?.label ?? '', style: semanticRelationshipStyle(relationship), edge: '1', parent: '1', source: relationship.from, target: relationship.to, 'data-relationship': relationship.id, 'data-relationship-type': relationship.type, 'data-token-refs': tokenRefs(relationship).join(','), 'data-view-icons': attachments.map((attachment) => attachment.icon).join(',') })}><mxGeometry relative="1" as="geometry">${points}</mxGeometry></mxCell>`,
    );
    attachments.forEach((attachment, index) => {
      const source = absoluteBoxes.get(relationship.from)!;
      const target = absoluteBoxes.get(relationship.to)!;
      const route = [
        { x: source.x + source.width / 2, y: source.y + source.height / 2 },
        ...edge.waypoints,
        { x: target.x + target.width / 2, y: target.y + target.height / 2 },
      ];
      const ratio =
        attachment.anchor === 'edge-start' ? 0.15 : attachment.anchor === 'edge-end' ? 0.85 : 0.5;
      const position = pointAlongRoute(route, ratio);
      const x = position.x + (attachment.offset?.dx ?? 0) - 14;
      const y = position.y + (attachment.offset?.dy ?? 0) - 14;
      cells.push(
        `<mxCell${attrs({ id: `${relationship.id}:attachment:${index}`, value: '', style: attachmentRegistry[attachment.icon].style, vertex: '1', connectable: '0', parent: '1', 'data-view-attachment': attachment.icon, 'data-view-attachment-index': String(index), 'data-view-attachment-owner': relationship.id })}><mxGeometry${attrs({ x: String(Math.round(x)), y: String(Math.round(y)), width: '28', height: '28' })} as="geometry"/></mxCell>`,
      );
    });
  }
  return graph(model, cells);
}

export function renderDrawio(model: any, layout: Layout, view?: ArchitectureView): string {
  if (!view) return renderLegacyDrawio(model, layout);
  assertKnownVisualVocabulary(view);
  return renderViewDrawio(model, layout, view);
}

export function writeAtomic(file: string, contents: string): void {
  const directory = path.dirname(path.resolve(file));
  const temporary = path.join(directory, `.${path.basename(file)}.${process.pid}.tmp`);
  try {
    fs.writeFileSync(temporary, contents, 'utf8');
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
