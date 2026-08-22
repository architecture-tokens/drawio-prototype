import OpenAI from 'openai';
import { layoutSchema } from './layout.js';
import type { Planner, PlannerRequest } from './types.js';

export type OpenAIResponsesClient = {
  responses: { create(payload: unknown): Promise<{ output_text?: string | null }> };
};
export type OpenAIClientFactory = (apiKey: string) => OpenAIResponsesClient;
const defaultFactory: OpenAIClientFactory = (apiKey) =>
  new OpenAI({ apiKey }) as unknown as OpenAIResponsesClient;

/** The sole live-provider boundary; tests supply a tiny Responses client factory. */
export class OpenAIPlanner implements Planner {
  constructor(
    private readonly model: string,
    private readonly apiKey = process.env.OPENAI_API_KEY,
    private readonly clientFactory: OpenAIClientFactory = defaultFactory,
  ) {}

  async plan(request: PlannerRequest): Promise<unknown> {
    if (!this.apiKey) throw new Error('OPENAI_API_KEY is required to generate a layout');
    const repair = request.previousLayout !== undefined;
    const input = repair
      ? {
          task: 'Repair the layout. Return only JSON matching the schema.',
          architecture: request.architecture,
          previousLayout: request.previousLayout,
          errors: request.errors ?? [],
        }
      : {
          task: 'Place all architecture components and relationships. Return only JSON matching the schema.',
          architecture: request.architecture,
        };
    const response = await this.clientFactory(this.apiKey).responses.create({
      model: this.model,
      input: JSON.stringify(input),
      text: {
        format: {
          type: 'json_schema',
          name: 'architecture_layout',
          strict: true,
          schema: request.schema as Record<string, unknown>,
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
export const resolveModel = (aiModel?: string, environment = process.env): string =>
  aiModel ?? environment.ARCHTOKENS_OPENAI_MODEL ?? 'gpt-5.6';
