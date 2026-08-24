import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { DOMParser } from '@xmldom/xmldom';
import YAML from 'yaml';
import { writeAtomic } from './drawio.js';

export type SourceElementKind = 'vertex' | 'edge';
export type SourceDirection = 'up' | 'down' | 'left' | 'right' | 'mixed';
export type SourcePoint = { x: number; y: number };
export type SourceGeometry = { x: number; y: number; width: number; height: number };
export type SourceElement = {
  source_id: string;
  kind: SourceElementKind;
  label: string | null;
  parent_source_id?: string | null;
  geometry?: SourceGeometry | null;
  from?: string | null;
  to?: string | null;
  points?: SourcePoint[];
  source_point?: SourcePoint | null;
  target_point?: SourcePoint | null;
  direction?: SourceDirection;
};
export type SourceDiagnostic = {
  severity: 'warning';
  code: 'SOURCE_CLASSIFICATION_TODO' | 'SOURCE_SYNTAX_TODO';
  source_id: string;
  message: string;
};
export type SourceInventory = {
  kind: 'source-inventory';
  version: '0.1';
  source: {
    name: string;
    format: 'mxgraph' | 'mermaid-flowchart' | 'mermaid-c4';
    sha256: string;
  };
  flow: { direction: SourceDirection; declared: boolean };
  counts: { vertices: number; edges: number; total: number };
  elements: SourceElement[];
  diagnostics: SourceDiagnostic[];
};
export type SourceLayout = {
  kind: 'source-layout';
  version: '0.1';
  source: SourceInventory['source'];
  flow: SourceInventory['flow'];
  nodes: Array<{
    source_id: string;
    parent_source_id: string | null;
    geometry: SourceGeometry | null;
  }>;
  edges: Array<{
    source_id: string;
    from: string | null;
    to: string | null;
    direction: SourceDirection;
    points: SourcePoint[];
    source_point: SourcePoint | null;
    target_point: SourcePoint | null;
  }>;
};
export type CensusBucket = 'component' | 'relationship' | 'token' | 'visual' | 'drop';
export type SourceClassification = {
  primary_bucket: CensusBucket;
  target_ids: string[];
  reason?: string;
};
export type CensusRecord = {
  source_id: string;
  kind: SourceElementKind;
  label: string | null;
  primary_bucket: CensusBucket | 'TODO';
  target_ids: string[];
  reason?: string;
};
export type CensusDocument = {
  kind: 'census';
  model: string;
  source: string;
  records: CensusRecord[];
};

type ParsedSource = {
  format: SourceInventory['source']['format'];
  direction: SourceDirection;
  directionDeclared: boolean;
  elements: SourceElement[];
  syntaxDiagnostics: SourceDiagnostic[];
};

const finite = (value: string | null): number | undefined => {
  if (value === null || value.trim() === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

const cleanLabel = (value: string | null): string | null => {
  if (!value) return null;
  const text = value
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
};

const childElements = (node: any, name: string): any[] => {
  const result: any[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling)
    if (child.nodeType === 1 && child.nodeName === name) result.push(child);
  return result;
};

const pointFrom = (element: any): SourcePoint | undefined => {
  const x = finite(element.getAttribute('x'));
  const y = finite(element.getAttribute('y'));
  return x === undefined || y === undefined ? undefined : { x, y };
};

function decodeCompressedDiagram(encoded: string): string {
  try {
    return decodeURIComponent(
      inflateRawSync(Buffer.from(encoded.trim(), 'base64')).toString('utf8'),
    );
  } catch (cause) {
    throw new Error(
      `INVALID_DRAWIO_COMPRESSION: could not decode compressed diagram: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

function graphModelsFromXml(text: string): any[] {
  const document = new DOMParser().parseFromString(text, 'application/xml');
  const parseErrors = [...document.getElementsByTagName('parsererror')];
  if (parseErrors.length)
    throw new Error(`INVALID_MXGRAPH_XML: ${parseErrors[0].textContent?.trim() ?? 'parse error'}`);
  const graphModels = [...document.getElementsByTagName('mxGraphModel')];
  if (graphModels.length) return graphModels;
  const diagrams = [...document.getElementsByTagName('diagram')];
  if (!diagrams.length) throw new Error('INVALID_MXGRAPH_XML: no mxGraphModel or diagram found');
  return diagrams.flatMap((diagram) =>
    graphModelsFromXml(decodeCompressedDiagram(diagram.textContent ?? '')),
  );
}

function edgeDirection(edge: SourceElement, vertices: Map<string, SourceElement>): SourceDirection {
  const from = edge.from ? vertices.get(edge.from)?.geometry : undefined;
  const to = edge.to ? vertices.get(edge.to)?.geometry : undefined;
  if (!from || !to) return 'mixed';
  const dx = to.x + to.width / 2 - (from.x + from.width / 2);
  const dy = to.y + to.height / 2 - (from.y + from.height / 2);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'down' : 'up';
}

function majorityDirection(elements: SourceElement[]): SourceDirection {
  const directions = elements
    .filter((element) => element.kind === 'edge')
    .map((element) => element.direction)
    .filter((direction): direction is Exclude<SourceDirection, 'mixed'> =>
      Boolean(direction && direction !== 'mixed'),
    );
  if (!directions.length) return 'mixed';
  const counts = new Map<SourceDirection, number>();
  for (const direction of directions) counts.set(direction, (counts.get(direction) ?? 0) + 1);
  const [direction, count] = [...counts.entries()].sort(
    ([leftDirection, leftCount], [rightDirection, rightCount]) =>
      rightCount - leftCount || leftDirection.localeCompare(rightDirection),
  )[0];
  return count / directions.length >= 0.6 ? direction : 'mixed';
}

function parseMxGraph(text: string): ParsedSource {
  const graphs = graphModelsFromXml(text);
  const multiPage = graphs.length > 1;
  const elements: SourceElement[] = [];
  for (const [pageIndex, graph] of graphs.entries()) {
    const prefix = multiPage ? `page-${pageIndex + 1}:` : '';
    for (const cell of [...graph.getElementsByTagName('mxCell')]) {
      const rawId = cell.getAttribute('id');
      const kind: SourceElementKind | undefined =
        cell.getAttribute('vertex') === '1'
          ? 'vertex'
          : cell.getAttribute('edge') === '1'
            ? 'edge'
            : undefined;
      if (!rawId || !kind) continue;
      const sourceId = `${prefix}${rawId}`;
      const geometry = childElements(cell, 'mxGeometry')[0];
      if (kind === 'vertex') {
        const x = geometry ? finite(geometry.getAttribute('x')) : undefined;
        const y = geometry ? finite(geometry.getAttribute('y')) : undefined;
        const width = geometry ? finite(geometry.getAttribute('width')) : undefined;
        const height = geometry ? finite(geometry.getAttribute('height')) : undefined;
        const rawParent = cell.getAttribute('parent');
        elements.push({
          source_id: sourceId,
          kind,
          label: cleanLabel(cell.getAttribute('value')),
          parent_source_id:
            rawParent && !['0', '1'].includes(rawParent) ? `${prefix}${rawParent}` : null,
          geometry:
            x === undefined || y === undefined || width === undefined || height === undefined
              ? null
              : { x, y, width, height },
        });
      } else {
        const points: SourcePoint[] = [];
        let sourcePoint: SourcePoint | undefined;
        let targetPoint: SourcePoint | undefined;
        if (geometry) {
          for (const point of [...geometry.getElementsByTagName('mxPoint')]) {
            const parsed = pointFrom(point);
            if (!parsed) continue;
            const role = point.getAttribute('as');
            if (role === 'sourcePoint') sourcePoint = parsed;
            else if (role === 'targetPoint') targetPoint = parsed;
            else points.push(parsed);
          }
        }
        const from = cell.getAttribute('source');
        const to = cell.getAttribute('target');
        elements.push({
          source_id: sourceId,
          kind,
          label: cleanLabel(cell.getAttribute('value')),
          from: from ? `${prefix}${from}` : null,
          to: to ? `${prefix}${to}` : null,
          points,
          source_point: sourcePoint ?? null,
          target_point: targetPoint ?? null,
        });
      }
    }
  }
  const vertices = new Map(
    elements
      .filter((element) => element.kind === 'vertex')
      .map((element) => [element.source_id, element]),
  );
  for (const element of elements)
    if (element.kind === 'edge') element.direction = edgeDirection(element, vertices);
  return {
    format: 'mxgraph',
    direction: majorityDirection(elements),
    directionDeclared: false,
    elements,
    syntaxDiagnostics: [],
  };
}

const mermaidDirection = (raw: string): SourceDirection => {
  const normalized = raw.toUpperCase();
  if (normalized === 'LR') return 'right';
  if (normalized === 'RL') return 'left';
  if (normalized === 'BT') return 'up';
  return normalized === 'TD' || normalized === 'TB' ? 'down' : 'mixed';
};

const bareMermaidNode = (token: string): { id: string; label: string | null } => {
  const trimmed = token.trim().replace(/^\|[^|]*\|\s*/, '');
  const idMatch = /^([A-Za-z0-9_.-]+)/.exec(trimmed);
  const id = idMatch?.[1] ?? trimmed;
  const shape = trimmed.slice(id.length).trim();
  const label = shape
    .replace(/^\[|\]$/g, '')
    .replace(/^\(\(|\)\)$/g, '')
    .replace(/^\(|\)$/g, '')
    .replace(/^\{|\}$/g, '')
    .trim();
  return { id, label: label || id };
};

const edgeId = (counts: Map<string, number>, from: string, to: string): string => {
  const key = `${from}->${to}`;
  const count = (counts.get(key) ?? 0) + 1;
  counts.set(key, count);
  return count === 1 ? `edge:${key}` : `edge:${key}:${count}`;
};

function parseMermaidFlowchart(text: string): ParsedSource {
  const elements: SourceElement[] = [];
  const vertexById = new Map<string, SourceElement>();
  const edgeCounts = new Map<string, number>();
  const syntaxDiagnostics: SourceDiagnostic[] = [];
  let direction: SourceDirection = 'mixed';
  let directionDeclared = false;
  let lineNumber = 0;
  const addVertex = (id: string, label: string | null, parent: string | null = null) => {
    const existing = vertexById.get(id);
    if (existing) {
      if ((existing.label === existing.source_id || existing.label === null) && label)
        existing.label = label;
      return;
    }
    const element: SourceElement = {
      source_id: id,
      kind: 'vertex',
      label,
      parent_source_id: parent,
      geometry: null,
    };
    vertexById.set(id, element);
    elements.push(element);
  };
  const addEdge = (fromToken: string, toToken: string) => {
    const from = bareMermaidNode(fromToken);
    const to = bareMermaidNode(toToken);
    const parent = parentStack.at(-1) ?? null;
    addVertex(from.id, from.label, parent);
    addVertex(to.id, to.label, parent);
    elements.push({
      source_id: edgeId(edgeCounts, from.id, to.id),
      kind: 'edge',
      label: null,
      from: from.id,
      to: to.id,
      direction,
      points: [],
      source_point: null,
      target_point: null,
    });
  };
  const parentStack: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    lineNumber += 1;
    const line = rawLine.trim();
    if (!line || line.startsWith('%%')) continue;
    const header = /^(?:graph|flowchart)\s+(LR|RL|TD|TB|BT)\b/i.exec(line);
    if (header) {
      direction = mermaidDirection(header[1]);
      directionDeclared = true;
      continue;
    }
    if (/^acc(?:Title|Descr)\s*:/i.test(line)) continue;
    const subgraph = /^subgraph\s+(.+)$/i.exec(line);
    if (subgraph) {
      const rawHeader = subgraph[1].trim();
      const bracketed = /^([A-Za-z0-9_.-]+)\s*\[(.+)\]$/.exec(rawHeader);
      const id = bracketed?.[1] ?? rawHeader;
      addVertex(id, bracketed?.[2] ?? rawHeader, parentStack.at(-1) ?? null);
      parentStack.push(id);
      continue;
    }
    if (/^end$/i.test(line)) {
      parentStack.pop();
      continue;
    }
    const arrow = /-\.->|==>|-->/;
    if (arrow.test(line)) {
      const tokens = line.split(arrow);
      for (let index = 0; index + 1 < tokens.length; index += 1)
        addEdge(tokens[index], tokens[index + 1]);
      continue;
    }
    const node = /^([A-Za-z0-9_.-]+)\s*(\[.*\]|\(\(.*\)\)|\(.*\)|\{.*\})?\s*$/.exec(line);
    if (node) {
      const parsed = bareMermaidNode(line);
      addVertex(parsed.id, parsed.label, parentStack.at(-1) ?? null);
      continue;
    }
    syntaxDiagnostics.push({
      severity: 'warning',
      code: 'SOURCE_SYNTAX_TODO',
      source_id: `line:${lineNumber}`,
      message: `Unsupported Mermaid drawing syntax at line ${lineNumber}: ${line}`,
    });
  }
  for (const element of elements) if (element.kind === 'edge') element.direction = direction;
  return {
    format: 'mermaid-flowchart',
    direction,
    directionDeclared,
    elements,
    syntaxDiagnostics,
  };
}

const c4Args = (line: string): string[] => {
  const open = line.indexOf('(');
  const close = line.lastIndexOf(')');
  if (open < 0 || close < open) return [];
  const result: string[] = [];
  let current = '';
  let quoted = false;
  for (const character of line.slice(open + 1, close)) {
    if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) {
      result.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else current += character;
  }
  result.push(current.trim().replace(/^"|"$/g, ''));
  return result;
};

function parseMermaidC4(text: string): ParsedSource {
  const elements: SourceElement[] = [];
  const vertexById = new Map<string, SourceElement>();
  const edgeCounts = new Map<string, number>();
  const syntaxDiagnostics: SourceDiagnostic[] = [];
  let lineNumber = 0;
  let currentBoundary: string | null = null;
  const addVertex = (id: string, label: string | null, parent: string | null) => {
    if (vertexById.has(id)) return;
    const element: SourceElement = {
      source_id: id,
      kind: 'vertex',
      label,
      parent_source_id: parent,
      geometry: null,
    };
    vertexById.set(id, element);
    elements.push(element);
  };
  for (const rawLine of text.split(/\r?\n/)) {
    lineNumber += 1;
    const line = rawLine.trim();
    if (
      !line ||
      line.startsWith('%%') ||
      /^C4(?:Container|Context|Component|Dynamic|Deployment)\b/.test(line) ||
      /^title\b/.test(line)
    )
      continue;
    if (/^}$/.test(line)) {
      currentBoundary = null;
      continue;
    }
    const call = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(line);
    if (!call) {
      syntaxDiagnostics.push({
        severity: 'warning',
        code: 'SOURCE_SYNTAX_TODO',
        source_id: `line:${lineNumber}`,
        message: `Unsupported Mermaid C4 drawing syntax at line ${lineNumber}: ${line}`,
      });
      continue;
    }
    const macro = call[1];
    if (/^Update/.test(macro)) continue;
    const args = c4Args(line);
    if (macro === 'Rel' || macro === 'Rel_Back') {
      if (args.length < 2) continue;
      const [declaredFrom, declaredTo, label] = args;
      const from = macro === 'Rel_Back' ? declaredTo : declaredFrom;
      const to = macro === 'Rel_Back' ? declaredFrom : declaredTo;
      addVertex(from, from, null);
      addVertex(to, to, null);
      elements.push({
        source_id: edgeId(edgeCounts, from, to),
        kind: 'edge',
        label: label || null,
        from,
        to,
        direction: 'mixed',
        points: [],
        source_point: null,
        target_point: null,
      });
      continue;
    }
    if (args.length < 1) continue;
    const [id, label] = args;
    addVertex(id, label || id, currentBoundary);
    if (/Boundary$/.test(macro) && line.endsWith('{')) currentBoundary = id;
  }
  return {
    format: 'mermaid-c4',
    direction: 'mixed',
    directionDeclared: false,
    elements,
    syntaxDiagnostics,
  };
}

function parseMermaid(text: string): ParsedSource {
  const first = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('%%'));
  return first && /^C4(?:Container|Context|Component|Dynamic|Deployment)\b/.test(first)
    ? parseMermaidC4(text)
    : parseMermaidFlowchart(text);
}

export function importSourceText(text: string, sourceName: string): SourceInventory {
  const parsed = /\.mmd$/i.test(sourceName) ? parseMermaid(text) : parseMxGraph(text);
  const vertices = parsed.elements.filter((element) => element.kind === 'vertex').length;
  const edges = parsed.elements.length - vertices;
  const classificationDiagnostics: SourceDiagnostic[] = parsed.elements.map((element) => ({
    severity: 'warning',
    code: 'SOURCE_CLASSIFICATION_TODO',
    source_id: element.source_id,
    message: `Classify source ${element.kind} "${element.source_id}" into component, relationship, token, visual, or drop.`,
  }));
  return {
    kind: 'source-inventory',
    version: '0.1',
    source: {
      name: path.basename(sourceName),
      format: parsed.format,
      sha256: createHash('sha256').update(text).digest('hex'),
    },
    flow: { direction: parsed.direction, declared: parsed.directionDeclared },
    counts: { vertices, edges, total: parsed.elements.length },
    elements: parsed.elements,
    diagnostics: [...parsed.syntaxDiagnostics, ...classificationDiagnostics],
  };
}

export function importSourceFile(sourcePath: string): SourceInventory {
  return importSourceText(fs.readFileSync(sourcePath, 'utf8'), sourcePath);
}

export function sourceLayout(inventory: SourceInventory): SourceLayout {
  return {
    kind: 'source-layout',
    version: '0.1',
    source: inventory.source,
    flow: inventory.flow,
    nodes: inventory.elements
      .filter((element) => element.kind === 'vertex')
      .map((element) => ({
        source_id: element.source_id,
        parent_source_id: element.parent_source_id ?? null,
        geometry: element.geometry ?? null,
      })),
    edges: inventory.elements
      .filter((element) => element.kind === 'edge')
      .map((element) => ({
        source_id: element.source_id,
        from: element.from ?? null,
        to: element.to ?? null,
        direction: element.direction ?? 'mixed',
        points: element.points ?? [],
        source_point: element.source_point ?? null,
        target_point: element.target_point ?? null,
      })),
  };
}

const portableRelative = (fromDirectory: string, target: string): string =>
  path.relative(fromDirectory, path.resolve(target)).split(path.sep).join('/') ||
  path.basename(target);

function loadClassifications(classificationsPath?: string): Map<string, SourceClassification> {
  if (!classificationsPath) return new Map();
  const value = YAML.parse(fs.readFileSync(classificationsPath, 'utf8')) as any;
  if (
    value?.kind !== 'source-classifications' ||
    value?.version !== '0.1' ||
    !value.mappings ||
    typeof value.mappings !== 'object'
  )
    throw new Error(
      'INVALID_SOURCE_CLASSIFICATIONS: expected kind source-classifications, version 0.1, and mappings',
    );
  const result = new Map<string, SourceClassification>();
  for (const [sourceId, classification] of Object.entries(value.mappings as Record<string, any>)) {
    if (
      !['component', 'relationship', 'token', 'visual', 'drop'].includes(
        classification?.primary_bucket,
      ) ||
      !Array.isArray(classification?.target_ids)
    )
      throw new Error(
        `INVALID_SOURCE_CLASSIFICATION: ${sourceId} must have a supported primary_bucket and target_ids list`,
      );
    if (
      classification.primary_bucket === 'drop' &&
      (!classification.reason || classification.target_ids.length)
    )
      throw new Error(
        `INVALID_SOURCE_CLASSIFICATION: drop ${sourceId} requires reason and empty target_ids`,
      );
    result.set(sourceId, classification as SourceClassification);
  }
  return result;
}

export function scaffoldCensus(
  inventory: SourceInventory,
  options: {
    censusPath: string;
    sourcePath: string;
    modelPath: string;
    classificationsPath?: string;
  },
): { census: CensusDocument; diagnostics: SourceDiagnostic[] } {
  const classifications = loadClassifications(options.classificationsPath);
  const sourceIds = new Set(inventory.elements.map((element) => element.source_id));
  for (const sourceId of classifications.keys())
    if (!sourceIds.has(sourceId)) throw new Error(`UNKNOWN_SOURCE_CLASSIFICATION: ${sourceId}`);
  const diagnostics = inventory.diagnostics.filter(
    (diagnostic) => diagnostic.code === 'SOURCE_SYNTAX_TODO',
  );
  const records = inventory.elements.map((element): CensusRecord => {
    const classification = classifications.get(element.source_id);
    if (classification)
      return {
        source_id: element.source_id,
        kind: element.kind,
        label: element.label,
        primary_bucket: classification.primary_bucket,
        target_ids: [...classification.target_ids],
        ...(classification.reason ? { reason: classification.reason } : {}),
      };
    diagnostics.push({
      severity: 'warning',
      code: 'SOURCE_CLASSIFICATION_TODO',
      source_id: element.source_id,
      message: `Classify source ${element.kind} "${element.source_id}" before using this census as a gate.`,
    });
    return {
      source_id: element.source_id,
      kind: element.kind,
      label: element.label,
      primary_bucket: 'TODO',
      target_ids: [],
      reason: `TODO: classify source ${element.kind} "${element.source_id}"; this placeholder intentionally fails CENSUS_MISMATCH.`,
    };
  });
  const outputDirectory = path.dirname(path.resolve(options.censusPath));
  return {
    census: {
      kind: 'census',
      model: portableRelative(outputDirectory, options.modelPath),
      source: portableRelative(outputDirectory, options.sourcePath),
      records,
    },
    diagnostics,
  };
}

export const serializeSourceInventory = (inventory: SourceInventory): string =>
  `${JSON.stringify(inventory, null, 2)}\n`;
export const serializeSourceLayout = (layout: SourceLayout): string =>
  `${JSON.stringify(layout, null, 2)}\n`;
export const serializeCensus = (census: CensusDocument): string => YAML.stringify(census);

export function writeSourceArtifacts(options: {
  sourcePath: string;
  inventoryOut?: string;
  layoutOut?: string;
  censusOut?: string;
  modelPath?: string;
  classificationsPath?: string;
}): { inventory: SourceInventory; todoCount: number } {
  const inventory = importSourceFile(options.sourcePath);
  if (options.inventoryOut) writeAtomic(options.inventoryOut, serializeSourceInventory(inventory));
  if (options.layoutOut)
    writeAtomic(options.layoutOut, serializeSourceLayout(sourceLayout(inventory)));
  let todoCount = inventory.diagnostics.filter(
    (diagnostic) => diagnostic.code === 'SOURCE_CLASSIFICATION_TODO',
  ).length;
  if (options.censusOut) {
    if (!options.modelPath)
      throw new Error('MISSING_MODEL: --model is required with census output');
    const scaffold = scaffoldCensus(inventory, {
      censusPath: options.censusOut,
      sourcePath: options.sourcePath,
      modelPath: options.modelPath,
      ...(options.classificationsPath ? { classificationsPath: options.classificationsPath } : {}),
    });
    writeAtomic(options.censusOut, serializeCensus(scaffold.census));
    todoCount = scaffold.diagnostics.filter(
      (diagnostic) => diagnostic.code === 'SOURCE_CLASSIFICATION_TODO',
    ).length;
  }
  return { inventory, todoCount };
}
