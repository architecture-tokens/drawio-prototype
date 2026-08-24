import { validateLayout, validateLayoutSchema } from './layout.js';
import type {
  ArchitectureView,
  Diagnostic,
  Layout,
  Planner,
  PlannerRequest,
  Report,
} from './types.js';

export const benchmarkExampleIds = [
  '1-cloud-web-app',
  '2-cicd-flow',
  '3-microservices-c4',
  '4-kubernetes',
  '5-event-pipeline',
] as const;
export type BenchmarkExampleId = (typeof benchmarkExampleIds)[number];
export type BenchmarkProviderName = 'codex-subscription' | 'fixture';
export type FullGateSummary = {
  PASS: number;
  FAIL: number;
  WARN: number;
  'NOT-CHECKABLE': number;
};
export type FullGateCheck = {
  id: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'NOT-CHECKABLE';
  /** Local linter detail. Never copied verbatim into prompts or reports. */
  message?: string;
};
export type FullGateReport = { checks: FullGateCheck[]; summary: FullGateSummary };
export type FullGateRunner = (layout: Layout) => Promise<FullGateReport>;
export type ScoreCheck = { passed: boolean; points: number; maximum: number };
export type BenchmarkReport = {
  schemaVersion: '0.1.0';
  example: BenchmarkExampleId;
  provider: BenchmarkProviderName;
  status: 'passed' | 'failed';
  repairCount: 0 | 1;
  redactedLayout: Layout | null;
  diagnostics: Array<
    Pick<Diagnostic, 'code' | 'path' | 'message' | 'layer' | 'elementId' | 'relatedIds'>
  >;
  score: {
    total: number;
    maximum: 100;
    checks: {
      completeIds: ScoreCheck;
      declaredDirection: ScoreCheck;
      zeroUnintendedCrossings: ScoreCheck;
      zeroCollisions: ScoreCheck;
      uniformConnectorTreatment: ScoreCheck;
      crossLayerFullGate: ScoreCheck;
    };
  };
  fullGate: FullGateSummary;
};

const emptyGateSummary = (): FullGateSummary => ({
  PASS: 0,
  FAIL: 1,
  WARN: 0,
  'NOT-CHECKABLE': 0,
});

const safeMessages: Record<string, string> = {
  INVALID_LAYOUT_SCHEMA: 'Layout does not match the strict layout schema.',
  DUPLICATE_LAYOUT_ID: 'Layout repeats a model element id.',
  INVENTED_LAYOUT_ID: 'Layout contains an id outside the architecture model.',
  OMITTED_LAYOUT_ID: 'Layout omits an architecture model id.',
  INVALID_TOPOLOGY_ALLOWANCE: 'A topology allowance does not resolve to two relationships.',
  INVALID_PARENT: 'A node parent does not resolve to another component.',
  CYCLIC_PARENT: 'The layout contains a parent cycle.',
  CHILD_OUTSIDE_PARENT: 'A child is outside its declared parent.',
  NODE_COLLISION: 'Two unrelated nodes overlap.',
  EDGE_CROSSING: 'Two unrelated connectors cross.',
  INVALID_EDGE_JUNCTION: 'Two unrelated connectors form a junction.',
};

function safeDiagnostic(
  diagnostic: Diagnostic,
  expectedIds: Set<string>,
): BenchmarkReport['diagnostics'][number] {
  const relatedIds = [...new Set(diagnostic.relatedIds ?? [])]
    .filter((id) => expectedIds.has(id) && id !== diagnostic.elementId)
    .slice(0, 8);
  return {
    code: diagnostic.code.replace(/[^A-Z0-9_-]/gi, '_').slice(0, 80),
    path:
      /^\/[A-Za-z0-9_./-]*$/.test(diagnostic.path) && diagnostic.path.length <= 240
        ? diagnostic.path
        : '/',
    message: safeMessages[diagnostic.code] ?? 'Benchmark validation failed.',
    ...(diagnostic.layer ? { layer: diagnostic.layer.replace(/[^a-z-]/gi, '').slice(0, 32) } : {}),
    ...(diagnostic.elementId && expectedIds.has(diagnostic.elementId)
      ? { elementId: diagnostic.elementId }
      : {}),
    ...(relatedIds.length ? { relatedIds } : {}),
  };
}

function referencedExpectedIds(message: string | undefined, expectedIds: Set<string>): string[] {
  if (!message) return [];
  const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...expectedIds]
    .sort((left, right) => right.length - left.length || left.localeCompare(right))
    .filter((id) => {
      if (!id || id.length > 160) return false;
      return new RegExp(`(^|[^A-Za-z0-9_.:-])${escaped(id)}($|[^A-Za-z0-9_.:-])`).test(message);
    })
    .slice(0, 8);
}

export function redactLayout(value: unknown, model: any): Layout | null {
  if (!validateLayoutSchema(value)) return null;
  const layout = value as Layout;
  const nodeIds = new Set<string>((model.components ?? []).map((item: any) => String(item.id)));
  const edgeIds = new Set<string>((model.relationships ?? []).map((item: any) => String(item.id)));
  return {
    version: '0.1',
    canvas: { width: layout.canvas.width, height: layout.canvas.height },
    nodes: layout.nodes
      .filter((node) => nodeIds.has(node.id))
      .map((node) => ({
        id: node.id,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        parentId: node.parentId !== null && nodeIds.has(node.parentId) ? node.parentId : null,
      })),
    edges: layout.edges
      .filter((edge) => edgeIds.has(edge.id))
      .map((edge) => ({
        id: edge.id,
        waypoints: edge.waypoints.map(({ x, y }) => ({ x, y })),
      })),
    ...(layout.topology
      ? {
          topology: {
            allowEdgeCrossings: layout.topology.allowEdgeCrossings
              .filter(({ edgeIds: pair }) => pair.every((id) => edgeIds.has(id)))
              .map(({ edgeIds: pair }) => ({ edgeIds: [...pair] as [string, string] })),
          },
        }
      : {}),
  };
}

const scored = (passed: boolean, maximum: number): ScoreCheck => ({
  passed,
  points: passed ? maximum : 0,
  maximum,
});

export function scoreBenchmark(
  layoutReport: Report,
  gate: FullGateReport | null,
  view: ArchitectureView,
) {
  const codes = new Set(layoutReport.diagnostics.map(({ code }) => code));
  const schemaValid = !codes.has('INVALID_LAYOUT_SCHEMA');
  const completeIds =
    schemaValid &&
    !['DUPLICATE_LAYOUT_ID', 'INVENTED_LAYOUT_ID', 'OMITTED_LAYOUT_ID'].some((code) =>
      codes.has(code),
    );
  const direction = gate?.checks.find(({ id }) => id === 'DIRECTION_GEOMETRY_CONFLICT');
  const connectorCorners = gate?.checks.find(({ id }) => id === '3a');
  const connectorWidths = gate?.checks.find(({ id }) => id === '8');
  const checks = {
    completeIds: scored(completeIds, 20),
    declaredDirection: scored(view.flow.direction === 'mixed' || direction?.status === 'PASS', 15),
    zeroUnintendedCrossings: scored(
      schemaValid && !codes.has('EDGE_CROSSING') && !codes.has('INVALID_EDGE_JUNCTION'),
      20,
    ),
    zeroCollisions: scored(
      schemaValid && !codes.has('NODE_COLLISION') && !codes.has('CHILD_OUTSIDE_PARENT'),
      20,
    ),
    uniformConnectorTreatment: scored(
      connectorCorners?.status === 'PASS' && connectorWidths?.status === 'PASS',
      10,
    ),
    crossLayerFullGate: scored(gate?.summary.FAIL === 0, 15),
  };
  return {
    total: Object.values(checks).reduce((total, check) => total + check.points, 0),
    maximum: 100 as const,
    checks,
  };
}

export async function runBenchmarkCase(input: {
  example: BenchmarkExampleId;
  providerName: BenchmarkProviderName;
  provider: Planner;
  architecture: unknown;
  model: any;
  view: ArchitectureView;
  schema: object;
  fullGate: FullGateRunner;
}): Promise<BenchmarkReport> {
  const request: PlannerRequest = {
    architecture: input.architecture,
    view: input.view,
    schema: input.schema,
  };
  const expectedIds = new Set<string>([
    ...(input.model.components ?? []).map((item: any) => String(item.id)),
    ...(input.model.relationships ?? []).map((item: any) => String(item.id)),
  ]);
  const relationships = new Map<string, any>(
    (input.model.relationships ?? []).map((item: any) => [String(item.id), item]),
  );
  const evaluate = async (layout: unknown) => {
    const layoutReport = validateLayout(layout, input.model);
    const redactedLayout = redactLayout(layout, input.model);
    const gate = redactedLayout ? await input.fullGate(redactedLayout) : null;
    const score = scoreBenchmark(layoutReport, gate, input.view);
    const gateDiagnostics: Diagnostic[] = (gate?.checks ?? [])
      .filter(({ status }) => status === 'FAIL')
      .map(({ id, message }) => {
        const referenced = referencedExpectedIds(message, expectedIds);
        const primary = referenced[0];
        const relationship = primary ? relationships.get(primary) : undefined;
        const related = [
          ...referenced.slice(1),
          ...(relationship ? [String(relationship.from), String(relationship.to)] : []),
        ];
        return {
          severity: 'error' as const,
          code: `FULL_GATE_${id.replace(/[^A-Z0-9]+/gi, '_').toUpperCase()}`,
          path: '/fullGate',
          message: 'A cross-layer full gate failed.',
          layer: 'full-gate',
          ...(primary ? { elementId: primary } : {}),
          ...(related.length ? { relatedIds: related } : {}),
        };
      });
    const scoreDiagnostics: Diagnostic[] = Object.entries(score.checks)
      .filter(([, check]) => !check.passed)
      .map(([name]) => ({
        severity: 'error',
        code: `BENCHMARK_SCORE_${name.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()}`,
        path: `/score/checks/${name}`,
        message: 'A benchmark acceptance score did not pass.',
        layer: 'benchmark',
      }));
    const repairDiagnostics = [...layoutReport.diagnostics, ...gateDiagnostics];
    const diagnostics = [...repairDiagnostics, ...scoreDiagnostics];
    return {
      layout,
      layoutReport,
      redactedLayout,
      gate,
      score,
      diagnostics,
      repairDiagnostics: repairDiagnostics.length ? repairDiagnostics : scoreDiagnostics,
      passed: layoutReport.valid && gate?.summary.FAIL === 0 && score.total === 100,
    };
  };

  let repairCount: 0 | 1 = 0;
  let layout = await input.provider.plan(request);
  let evaluation = await evaluate(layout);
  if (!evaluation.passed) {
    repairCount = 1;
    layout = await input.provider.plan({
      ...request,
      previousLayout: layout,
      errors: evaluation.repairDiagnostics.map((item) => safeDiagnostic(item, expectedIds)),
    });
    evaluation = await evaluate(layout);
  }

  const diagnostics = evaluation.diagnostics.map((item) => safeDiagnostic(item, expectedIds));
  return {
    schemaVersion: '0.1.0',
    example: input.example,
    provider: input.providerName,
    status: evaluation.passed ? 'passed' : 'failed',
    repairCount,
    redactedLayout: evaluation.redactedLayout,
    diagnostics,
    score: evaluation.score,
    fullGate: evaluation.gate?.summary ?? emptyGateSummary(),
  };
}
