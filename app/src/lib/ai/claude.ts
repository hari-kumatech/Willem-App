import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { createHash } from 'node:crypto';
import type { z } from 'zod';
import { env } from '@/lib/env';
import { callOllama } from './ollama';

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!env.anthropicApiKey) return null;
  client ??= new Anthropic({ apiKey: env.anthropicApiKey, timeout: 120_000, maxRetries: 2 });
  return client;
}

// USD per million tokens (input, output). Cache reads cost ~10% of input, cache writes ~125%.
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-fable-5-1': { input: 10, output: 50 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

function priceFor(model: string) {
  const key = Object.keys(PRICES).find((name) => model === name || model.startsWith(`${name}-`));
  return PRICES[key ?? 'claude-opus-5-5'];
}

// Server-side refusal fallback exists for these families (on a decline the same request runs on another model)
const supportsFallbacks = (model: string) => /^claude-(opus-5|fable-5|sonnet-5-5)/.test(model);
// Haiku 4.5 rejects the effort parameter
const supportsEffort = (model: string) => !/^claude-haiku/.test(model);

export interface AgentCallResult<T> {
  output: T;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface AgentCallRequest<Schema extends z.ZodType> {
  model: string;
  schema: Schema;
  // Stable system prompt (rubric, rules). Cached, so it must not contain per-call data.
  system: string;
  prompt: string;
  effort?: 'low' | 'medium' | 'high';
  maxTokens?: number;
}

export const hashInput = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 32);

// One Claude call with a guaranteed JSON answer that matches the zod schema.
// Returns null without an API key or when the call fails: the caller then falls back to rules ("regelmodus").
export async function callAgent<Schema extends z.ZodType>({
  model,
  schema,
  system,
  prompt,
  effort = 'medium',
  maxTokens = 16000,
}: AgentCallRequest<Schema>): Promise<AgentCallResult<z.infer<Schema>> | null> {
  if (env.aiProvider === 'ollama') return callOllama({ model, schema, system, prompt, effort, maxTokens });
  const anthropic = getClient();
  if (!anthropic) return null;

  try {
    const response = await anthropic.beta.messages.parse({
      model,
      max_tokens: maxTokens,
      ...(supportsFallbacks(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: prompt }],
      output_config: {
        ...(supportsEffort(model) ? { effort } : {}),
        format: betaZodOutputFormat(schema),
      },
    });

    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
      console.warn(`[ai] ${model} stopped with "${response.stop_reason}", falling back to rules`);
      return null;
    }
    const parsed = response.parsed_output as z.infer<Schema> | null;
    if (!parsed) return null;

    const usage = response.usage;
    const price = priceFor(response.model ?? model);
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    const cacheWrite = usage.cache_creation_input_tokens ?? 0;
    const costUsd =
      (usage.input_tokens * price.input + cacheRead * price.input * 0.1 + cacheWrite * price.input * 1.25 + usage.output_tokens * price.output) /
      1_000_000;

    return {
      output: parsed,
      model: response.model ?? model,
      inputTokens: usage.input_tokens + cacheRead + cacheWrite,
      outputTokens: usage.output_tokens,
      costUsd,
    };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error('[ai] ANTHROPIC_API_KEY is invalid');
    } else if (error instanceof Anthropic.RateLimitError) {
      console.error('[ai] Rate limited by the Claude API, falling back to rules');
    } else if (error instanceof Anthropic.APIError) {
      console.error(`[ai] Claude API error ${error.status}: ${error.message}`);
    } else {
      console.error('[ai] Claude call failed', error);
    }
    return null;
  }
}
