export type Point = { x: number; y: number };
export type LayoutNode = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId?: string;
};
export type LayoutEdge = { id: string; waypoints?: Point[] };
export type Layout = { version: '0.1'; nodes: LayoutNode[]; edges: LayoutEdge[] };
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
export type Planner = {
  plan(input: unknown, schema: object, repairErrors?: string[]): Promise<unknown>;
};
export type RunResult = { exitCode: number; stdout: string; stderr: string };
