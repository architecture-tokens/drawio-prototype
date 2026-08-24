import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadAndValidate } from '../src/validate.js';
import { loadAndValidateView } from '../src/view.js';

const root = path.resolve(import.meta.dirname, '..');
const showcase = path.join(root, 'examples', 'showcase');

describe('checked-in Architecture View contracts', () => {
  it('validates every showcase view against its model and the strict spec schema', () => {
    const cases = fs
      .readdirSync(showcase)
      .filter((name) => /^\d+-/.test(name))
      .flatMap((name) => {
        const directory = path.join(showcase, name);
        return fs
          .readdirSync(directory)
          .filter((file) => /^view(?:-reproduce)?\.yaml$/.test(file))
          .map((file) => ({ directory, file }));
      });
    expect(cases.length).toBe(6);
    for (const { directory, file } of cases) {
      const modelFile = path.join(directory, 'model.yaml');
      const loaded = loadAndValidate(modelFile, [path.join(directory, 'tokens.yaml')], []);
      expect(loaded.report.valid, `${directory}/model.yaml`).toBe(true);
      const view = loadAndValidateView(path.join(directory, file), modelFile, loaded.model);
      expect(view.report, `${directory}/${file}`).toEqual({ valid: true, diagnostics: [] });
    }
  });
});
