import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import Ajv2020 from 'ajv/dist/2020.js';
import { parse } from 'yaml';
import type { ArchitectureView, Diagnostic, Report, ViewAttachment } from './types.js';

const require = createRequire(import.meta.url);
const schemaFile =
  require.resolve('@architecture-tokens/spec/schema/architecture-view.schema.json');
const viewSchema = JSON.parse(fs.readFileSync(schemaFile, 'utf8'));
const Ajv = Ajv2020 as unknown as new (options: object) => any;
const ajv = new Ajv({ allErrors: true, strict: true });
const validateSchema = ajv.compile(viewSchema);

const nodeAnchors = new Set([
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'middle-center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
]);
const edgeAnchors = new Set(['edge-start', 'edge-midpoint', 'edge-end']);

const diagnostic = (
  code: string,
  reportPath: string,
  message: string,
  elementId?: string,
): Diagnostic => ({
  severity: 'error',
  code,
  layer: 'view',
  path: reportPath,
  message,
  ...(elementId ? { elementId } : {}),
});

function checkAnchors(
  attachments: ViewAttachment[],
  allowed: Set<string>,
  ownerPath: string,
  ownerId: string,
  diagnostics: Diagnostic[],
) {
  attachments.forEach((attachment, index) => {
    if (!allowed.has(attachment.anchor))
      diagnostics.push(
        diagnostic(
          'INVALID_VIEW_ATTACHMENT_ANCHOR',
          `${ownerPath}/${index}/anchor`,
          `Anchor ${attachment.anchor} is not valid for this attachment owner`,
          ownerId,
        ),
      );
  });
}

export function loadAndValidateView(
  viewFile: string,
  modelFile: string,
  model: any,
): { report: Report; view?: ArchitectureView } {
  let value: unknown;
  try {
    value = parse(fs.readFileSync(viewFile, 'utf8'));
  } catch (cause) {
    return {
      report: {
        valid: false,
        diagnostics: [
          diagnostic(
            'VIEW_INPUT_IO',
            '/',
            cause instanceof Error ? cause.message : 'Could not read architecture view',
          ),
        ],
      },
    };
  }
  if (!validateSchema(value))
    return {
      report: {
        valid: false,
        diagnostics: (validateSchema.errors ?? []).map((error: any) =>
          diagnostic(
            'SCHEMA_INVALID_ARCHITECTURE_VIEW',
            error.instancePath || '/',
            `${error.keyword}: ${error.message}`,
          ),
        ),
      },
    };

  const view = value as ArchitectureView;
  const diagnostics: Diagnostic[] = [];
  const declaredModel = path.resolve(path.dirname(viewFile), view.model);
  if (declaredModel !== path.resolve(modelFile))
    diagnostics.push(
      diagnostic(
        'VIEW_MODEL_MISMATCH',
        '/model',
        `View resolves model to ${declaredModel}, not ${path.resolve(modelFile)}`,
      ),
    );

  const componentIds = new Set<string>((model.components ?? []).map((item: any) => item.id));
  const relationshipIds = new Set<string>((model.relationships ?? []).map((item: any) => item.id));
  for (const [ownerId, attachments] of Object.entries(view.components)) {
    if (!componentIds.has(ownerId))
      diagnostics.push(
        diagnostic(
          'UNRESOLVED_VIEW_ATTACHMENT_OWNER',
          `/components/${ownerId}`,
          `Component attachment owner ${ownerId} does not resolve in the model`,
          ownerId,
        ),
      );
    checkAnchors(attachments, nodeAnchors, `/components/${ownerId}`, ownerId, diagnostics);
  }
  for (const [ownerId, attachments] of Object.entries(view.relationships)) {
    if (!relationshipIds.has(ownerId))
      diagnostics.push(
        diagnostic(
          'UNRESOLVED_VIEW_ATTACHMENT_OWNER',
          `/relationships/${ownerId}`,
          `Relationship attachment owner ${ownerId} does not resolve in the model`,
          ownerId,
        ),
      );
    checkAnchors(attachments, edgeAnchors, `/relationships/${ownerId}`, ownerId, diagnostics);
  }

  const visualIds = new Set<string>();
  view.visualElements.forEach((element, elementIndex) => {
    if (visualIds.has(element.id))
      diagnostics.push(
        diagnostic(
          'DUPLICATE_VIEW_ELEMENT_ID',
          `/visualElements/${elementIndex}/id`,
          `Visual element id ${element.id} is duplicated`,
          element.id,
        ),
      );
    visualIds.add(element.id);
    element.members.forEach((member, memberIndex) => {
      if (!componentIds.has(member))
        diagnostics.push(
          diagnostic(
            'UNRESOLVED_VIEW_MEMBER',
            `/visualElements/${elementIndex}/members/${memberIndex}`,
            `Visual element member ${member} does not resolve to a model component`,
            element.id,
          ),
        );
    });
    checkAnchors(
      element.attachments ?? [],
      nodeAnchors,
      `/visualElements/${elementIndex}/attachments`,
      element.id,
      diagnostics,
    );
  });

  return {
    report: { valid: diagnostics.length === 0, diagnostics },
    view,
  };
}
