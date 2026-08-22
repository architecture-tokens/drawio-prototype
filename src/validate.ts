import fs from 'node:fs';
import { createRequire } from 'node:module';
import Ajv2020 from 'ajv/dist/2020.js';
import { parse } from 'yaml';
import {
  normalizeArchitecture,
  validateArchitecture,
  validateLibraries,
} from '@architecture-tokens/spec';
import type { Diagnostic, Report } from './types.js';

const require = createRequire(import.meta.url);
const specFile = (name: string) => require.resolve(`@architecture-tokens/spec/${name}`);
const read = (file: string): unknown => parse(fs.readFileSync(file, 'utf8'));
const schema = (name: string) =>
  JSON.parse(fs.readFileSync(specFile(`schema/${name}.schema.json`), 'utf8'));
const Ajv = Ajv2020 as unknown as new (options: object) => any;
const ajv = new Ajv({ allErrors: true, strict: true });
const validators = Object.fromEntries(
  ['architecture-model', 'token-library', 'policy-set'].map((name) => {
    const item = schema(name);
    ajv.addSchema(item, item.$id);
    return [name, ajv.compile(item)];
  }),
) as Record<string, any>;
export const builtinLibraryFiles = ['core', 'security', 'environment', 'lifecycle'].map((name) =>
  specFile(`libraries/${name}.yaml`),
);

function schemaReport(value: unknown, kind: string, path: string): Report {
  const validator = validators[kind];
  if (validator(value)) return { valid: true, diagnostics: [] };
  return {
    valid: false,
    diagnostics: (validator.errors ?? []).map((e: any) => ({
      severity: 'error',
      code: `SCHEMA_INVALID_${kind.replace(/-/g, '_').toUpperCase()}`,
      layer: 'schema',
      path: e.instancePath || path,
      message: `${e.keyword}: ${e.message}`,
    })),
  };
}
function asDocs(file: string): unknown[] {
  const value = read(file);
  return Array.isArray(value) ? value : [value];
}
export function loadAndValidate(
  modelFile: string,
  libraryFiles: string[],
  policyFiles: string[],
): { report: Report; model?: any; libraries?: any[]; policies?: any[]; normalized?: unknown } {
  let model: any;
  let libraries: any[];
  let policies: any[];
  try {
    model = read(modelFile);
    libraries = [...builtinLibraryFiles, ...libraryFiles].flatMap(asDocs);
    policies = policyFiles.flatMap(asDocs);
  } catch (cause) {
    return {
      report: {
        valid: false,
        diagnostics: [
          {
            severity: 'error',
            code: 'INPUT_IO',
            layer: 'input',
            path: '/',
            message: cause instanceof Error ? cause.message : 'Could not read input',
          },
        ],
      },
    };
  }
  const diagnostics: Diagnostic[] = [...schemaReport(model, 'architecture-model', '/').diagnostics];
  for (const library of libraries)
    diagnostics.push(...schemaReport(library, 'token-library', '/libraries').diagnostics);
  for (const policy of policies)
    diagnostics.push(...schemaReport(policy, 'policy-set', '/policies').diagnostics);
  if (diagnostics.length)
    return { report: { valid: false, diagnostics }, model, libraries, policies };
  const libraryReport = validateLibraries(libraries) as Report;
  const architectureReport = validateArchitecture(model, libraries, policies) as Report;
  diagnostics.push(...libraryReport.diagnostics, ...architectureReport.diagnostics);
  return {
    report: { valid: !diagnostics.some((d) => d.severity === 'error'), diagnostics },
    model,
    libraries,
    policies,
    normalized: normalizeArchitecture(model, libraries),
  };
}
