import { GoogleGenerativeAI } from '@google/generative-ai';
import type { GeminiPrompt } from '../lib/promptBuilder.js';

export interface GeminiClient {
  stream(prompt: GeminiPrompt, signal?: AbortSignal): AsyncGenerator<string>;
}

export interface CreateGeminiClientOpts {
  apiKey: string;
  model: string;
}

export function createGeminiClient(opts: CreateGeminiClientOpts): GeminiClient {
  const client = new GoogleGenerativeAI(opts.apiKey);
  return {
    async *stream(prompt: GeminiPrompt, signal?: AbortSignal): AsyncGenerator<string> {
      const model = client.getGenerativeModel({
        model: opts.model,
        systemInstruction: prompt.systemInstruction,
      });
      const result = await model.generateContentStream({ contents: prompt.contents });
      for await (const chunk of result.stream) {
        if (signal?.aborted) return;
        const text = chunk.text();
        if (text) yield text;
      }
    },
  };
}

type Factory = typeof createGeminiClient;
let factoryOverride: Factory | null = null;

/** Test-only: swap in a stub factory. Pass null to restore the default. */
export function __setGeminiFactoryForTests(f: Factory | null): void {
  factoryOverride = f;
}

export function resolveGeminiFactory(): Factory {
  return factoryOverride ?? createGeminiClient;
}
