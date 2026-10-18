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
        // Streaming: Ollama answers at once and sends tokens as they come. Without it the HTTP headers only
        // arrive when the whole answer is done, and Node's fetch gives up after 300 s on a slow CPU.
        stream: true,
        format: jsonSchema(schema),
        keep_alive: '30m',
        // ~800 output tokens for a verdict; the cap keeps a run from stalling on a rambling answer
        options: { temperature: 0, num_ctx: env.ollamaContext, num_predict: Math.min(maxTokens, 2000) },
        messages: [
          {
            role: 'system',
            content: `${system}\n\nGebruik alleen feiten die letterlijk in de gegeven tekst staan. Verzin geen getallen, namen of bronnen; schrijf "onbekend" als iets er niet staat. Antwoord uitsluitend met JSON volgens het gevraagde schema.`,
          },
          { role: 'user', content: prompt },
        ],
      }),
      // A laptop CPU needs time: one company can take a minute or more
      signal: AbortSignal.timeout(env.ollamaTimeoutMs),
      cache: 'no-store',
    });
    if (!response.ok || !response.body) {
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      console.error(`[ai] Ollama error ${response.status}: ${detail || 'unknown'}`);
      return null;
    }
    // NDJSON stream: one JSON object per line; the last one has done = true and the token counts
    let content = '';
    let data: OllamaChatResponse = {};
    let buffer = '';
    const decoder = new TextDecoder();
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        const part = JSON.parse(line) as OllamaChatResponse & { done?: boolean };
        if (part.error) {
          console.error(`[ai] Ollama error: ${part.error}`);
          return null;
        }
        content += part.message?.content ?? '';
        if (part.done) data = part;
      }
    }
    data.message = { content };
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
