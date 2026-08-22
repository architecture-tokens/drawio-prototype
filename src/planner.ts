import OpenAI from 'openai';
import { layoutSchema } from './layout.js';
import type { Planner } from './types.js';

/** The sole live-provider boundary; callers inject Planner in tests. */
export class OpenAIPlanner implements Planner {
  constructor(
    private readonly model: string,
    private readonly apiKey = process.env.OPENAI_API_KEY,
  ) {}

  async plan(input: unknown, schema: object, repairErrors?: string[]): Promise<unknown> {
    if (!this.apiKey) throw new Error('OPENAI_API_KEY is required to generate a layout');
    const client = new OpenAI({ apiKey: this.apiKey });
    const request = repairErrors
      ? { task: 'Repair the layout. Return only JSON matching the schema.', errors: repairErrors }
      : {
          task: 'Place all architecture components and relationships. Return only JSON matching the schema.',
          architecture: input,
        };
    const response = await client.responses.create({
      model: this.model,
      input: JSON.stringify(request),
      text: {
        format: {
          type: 'json_schema',
          name: 'architecture_layout',
          strict: true,
          schema: schema as Record<string, unknown>,
        },
      },
    });
    if (!response.output_text) throw new Error('Provider returned no layout (possibly a refusal)');
    try {
      return JSON.parse(response.output_text);
    } catch {
      throw new Error('Provider returned non-JSON layout');
    }
  }
}
export const defaultLayoutSchema = layoutSchema;
