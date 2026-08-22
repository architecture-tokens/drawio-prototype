import fs from 'node:fs';
import path from 'node:path';
import type { Layout } from './types.js';

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

export function renderDrawio(model: any, layout: Layout): string {
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
    const points = edge.waypoints?.length
      ? `<Array as="points">${edge.waypoints.map((point) => `<mxPoint x="${point.x}" y="${point.y}"/>`).join('')}</Array>`
      : '';
    cells.push(
      `<mxCell${attrs({ id: relationship.id, value: relationship.metadata?.label ?? relationship.id, style: edgeStyle(relationship.type), edge: '1', parent: '1', source: relationship.from, target: relationship.to })}><mxGeometry relative="1" as="geometry">${points}</mxGeometry></mxCell>`,
    );
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net" version="24.7.17"><diagram id="${escapeXml(model.id)}" name="${escapeXml(model.id)}"><mxGraphModel><root>${cells.join('')}</root></mxGraphModel></diagram></mxfile>\n`;
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
