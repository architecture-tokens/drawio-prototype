declare module '@architecture-tokens/spec' {
  export function validateLibraries(libraries: unknown[]): {
    valid: boolean;
    diagnostics: import('./types.js').Diagnostic[];
  };
  export function validateArchitecture(
    model: unknown,
    libraries: unknown[],
    policies?: unknown[],
  ): { valid: boolean; diagnostics: import('./types.js').Diagnostic[] };
  export function normalizeArchitecture(model: unknown, libraries: unknown[]): unknown;
}
