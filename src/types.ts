export type Point = { x: number; y: number };
export type LayoutNode = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId: string | null;
};
export type LayoutEdge = { id: string; waypoints: Point[] };
export type Layout = {
  version: '0.1';
  canvas: { width: number; height: number };
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  topology?: {
    /** Exact relationship pairs whose source-faithful crossing is intentional. */
    allowEdgeCrossings: Array<{ edgeIds: [string, string] }>;
  };
};
export type ViewAnchor =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'middle-center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'edge-start'
  | 'edge-midpoint'
  | 'edge-end';
export type ViewAttachment = {
  icon: string;
  anchor: ViewAnchor;
  offset?: { dx: number; dy: number };
};
export type ArchitectureView = {
  kind: 'view';
  version: '0.1.0';
  id: string;
  model: string;
  mode: 'reproduce' | 'restyle';
  reason?: string;
  flow: { direction: 'up' | 'down' | 'left' | 'right' | 'mixed' };
  components: Record<string, ViewAttachment[]>;
  relationships: Record<string, ViewAttachment[]>;
  visualElements: Array<{
    id: string;
    kind?: string;
    label?: string;
    members: string[];
    attachments?: ViewAttachment[];
  }>;
};
export type Diagnostic = {
  severity: 'error' | 'warning';
  code: string;
  path: string;
  message: string;
  elementId?: string;
  ruleId?: string;
  remediation?: string;
  layer?: string;
  /** Other trusted model element ids involved in the same diagnostic. */
  relatedIds?: string[];
};
export type Report = { valid: boolean; diagnostics: Diagnostic[] };
export type PlannerRequest = {
  architecture: unknown;
  view?: ArchitectureView;
  schema: object;
  previousLayout?: unknown;
  errors?: Array<
    Pick<Diagnostic, 'code' | 'message'> &
      Partial<Pick<Diagnostic, 'path' | 'elementId' | 'relatedIds' | 'layer'>>
  >;
};
export type Planner = { plan(request: PlannerRequest): Promise<unknown> };
export type RunResult = { exitCode: number; stdout: string; stderr: string };
