import 'server-only';
import { z } from 'zod';
import { env } from '@/lib/env';
import type { AgentCallRequest, AgentCallResult } from './claude';

// Local, free model via Ollama (https://ollama.com). Data never leaves the laptop.
// Uses Ollama's structured output: the zod schema is sent as JSON schema in `format`,
// and the answer is validated with the same schema before it is used.

interface OllamaChatResponse {
  model?: string;
  message?: { content?: string };
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

function jsonSchema(schema: z.ZodType) {
  const json = z.toJSONSchema(schema, { io: 'output' }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

export async function callOllama<Schema extends z.ZodType>({
  schema,
  system,
  prompt,
  maxTokens = 4000,
}: AgentCallRequest<Schema>): Promise<AgentCallResult<z.infer<Schema>> | null> {
  const model = env.ollamaModel;
  try {
    const response = await fetch(`${env.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        format: jsonSchema(schema),
        keep_alive: '30m',
        options: { temperature: 0, num_ctx: env.ollamaContext, num_predict: Math.min(maxTokens, 4096) },
        messages: [
          { role: 'system', content: `${system}\n\nAntwoord uitsluitend met JSON volgens het gevraagde schema.` },
          { role: 'user', content: prompt },
        ],
      }),
      // A laptop CPU needs time: one company can take a minute or more
      signal: AbortSignal.timeout(env.ollamaTimeoutMs),
      cache: 'no-store',
    });
    const data = (await response.json().catch(() => ({}))) as OllamaChatResponse;
    if (!response.ok || data.error) {
      console.error(`[ai] Ollama error ${response.status}: ${data.error ?? 'unknown'}`);
      return null;
    }
    if (data.done_reason === 'length') {
      console.warn('[ai] Ollama answer was cut off (num_predict), falling back to rules');
      return null;
    }
    const parsed = schema.safeParse(JSON.parse(data.message?.content ?? 'null'));
    if (!parsed.success) {
      console.warn('[ai] Ollama answer did not match the schema, falling back to rules');
      return null;
    }
    return {
      output: parsed.data as z.infer<Schema>,
      model: `ollama:${data.model ?? model}`,
      inputTokens: data.prompt_eval_count ?? 0,
      outputTokens: data.eval_count ?? 0,
      costUsd: 0,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') console.error(`[ai] Ollama timed out after ${env.ollamaTimeoutMs / 1000}s`);
    else console.error('[ai] Ollama call failed (is Ollama running?)', error instanceof Error ? error.message : error);
    return null;
  }
}
