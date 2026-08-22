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
};
export type Report = { valid: boolean; diagnostics: Diagnostic[] };
export type PlannerRequest = {
  architecture: unknown;
  schema: object;
  previousLayout?: unknown;
  errors?: Array<Pick<Diagnostic, 'code' | 'message'>>;
};
export type Planner = { plan(request: PlannerRequest): Promise<unknown> };
export type RunResult = { exitCode: number; stdout: string; stderr: string };
