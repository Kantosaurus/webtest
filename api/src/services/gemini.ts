import { GoogleGenerativeAI } from '@google/generative-ai';
import type { GeminiPrompt } from '../lib/promptBuilder.js';

export interface GeminiClient {
  stream(prompt: GeminiPrompt, signal?: AbortSignal): AsyncGenerator<string>;
}

export function createGeminiClient(apiKey: string): GeminiClient {
  const client = new GoogleGenerativeAI(apiKey);
  return {
    async *stream(prompt: GeminiPrompt, signal?: AbortSignal): AsyncGenerator<string> {
      const model = client.getGenerativeModel({
        model: 'gemini-1.5-flash',
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
