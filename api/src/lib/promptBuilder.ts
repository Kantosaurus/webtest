export interface ScanContext {
  fileName: string;
  fileSha256: string;
  status: string;
  stats: { malicious: number; suspicious: number; undetected: number; harmless: number };
  topEngines: string[];
}

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GeminiPrompt {
  systemInstruction: string;
  contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
}

export function buildGeminiPrompt(input: {
  scan: ScanContext;
  history: HistoryMessage[];
  userMessage: string;
}): GeminiPrompt {
  const { scan, history, userMessage } = input;

  const systemInstruction = [
    'You help explain VirusTotal scan results to non-technical users.',
    "Stay on-topic: this file's scan, what it means, and practical advice.",
    'If asked something unrelated, politely redirect the user back to the scan.',
    '',
    'File context:',
    `- Name: ${scan.fileName}`,
    `- SHA-256: ${scan.fileSha256}`,
    `- Status: ${scan.status}`,
    `- Detection counts — malicious: ${scan.stats.malicious}, suspicious: ${scan.stats.suspicious}, undetected: ${scan.stats.undetected}, harmless: ${scan.stats.harmless}`,
    `- Top detecting engines: ${scan.topEngines.length ? scan.topEngines.join(', ') : 'none'}`,
  ].join('\n');

  const contents = [
    ...history.map((m) => ({
      role: (m.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
      parts: [{ text: m.content }],
    })),
    { role: 'user' as const, parts: [{ text: userMessage }] },
  ];

  return { systemInstruction, contents };
}
