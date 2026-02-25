import OpenAI from 'openai';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../../.env.agents') });

const apiKey = process.env.OPENAI_API_KEY!;
if (!apiKey) throw new Error('Missing OPENAI_API_KEY in .env.agents');

export const openai = new OpenAI({ apiKey });

export async function chat(
  systemPrompt: string,
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
  options: { model?: string; temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  const { model = 'gpt-4o', temperature = 0.9, maxTokens = 800 } = options;

  const response = await openai.chat.completions.create({
    model,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
  });

  return response.choices[0]?.message?.content || '';
}
