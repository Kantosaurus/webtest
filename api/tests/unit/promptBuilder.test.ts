import { describe, it, expect } from 'vitest';
import { buildGeminiPrompt } from '../../src/lib/promptBuilder.js';

describe('buildGeminiPrompt', () => {
  it('includes system prompt with scan context and maps history roles', () => {
    const result = buildGeminiPrompt({
      scan: {
        fileName: 'evil.js',
        fileSha256: 'abc123',
        status: 'completed',
        stats: { malicious: 5, suspicious: 0, undetected: 60, harmless: 0 },
        topEngines: ['Kaspersky', 'Sophos'],
      },
      history: [
        { role: 'user', content: 'What is this?' },
        { role: 'assistant', content: 'A malicious script.' },
      ],
      userMessage: 'Should I worry?',
    });
    expect(result.systemInstruction).toMatch(/virustotal/i);
    expect(result.systemInstruction).toContain('evil.js');
    expect(result.systemInstruction).toContain('abc123');
    expect(result.systemInstruction).toContain('malicious: 5');
    expect(result.systemInstruction).toContain('Kaspersky');
    expect(result.contents).toHaveLength(3);
    expect(result.contents[0]!.role).toBe('user');
    expect(result.contents[1]!.role).toBe('model'); // assistant mapped to model
    expect(result.contents[2]!.role).toBe('user');
    expect(result.contents[2]!.parts[0]!.text).toBe('Should I worry?');
  });

  it('handles empty history and no top engines', () => {
    const result = buildGeminiPrompt({
      scan: {
        fileName: 'benign.js',
        fileSha256: 'def',
        status: 'completed',
        stats: { malicious: 0, suspicious: 0, undetected: 0, harmless: 70 },
        topEngines: [],
      },
      history: [],
      userMessage: 'What is this?',
    });
    expect(result.systemInstruction).toContain('none');
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0]!.role).toBe('user');
  });

  it('instructs the model to stay on topic', () => {
    const r = buildGeminiPrompt({
      scan: {
        fileName: 'x',
        fileSha256: 'y',
        status: 'completed',
        stats: { malicious: 0, suspicious: 0, undetected: 0, harmless: 0 },
        topEngines: [],
      },
      history: [],
      userMessage: 'hi',
    });
    expect(r.systemInstruction.toLowerCase()).toMatch(/off-topic|unrelated|redirect/);
  });
});
