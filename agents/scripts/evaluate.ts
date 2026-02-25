/**
 * Evaluate Script — Extract and score ideas from a brainstorm session
 * 
 * Usage: npx tsx agents/scripts/evaluate.ts --session=<session_id>
 * 
 * What it does:
 * 1. Loads all brainstorm messages from the session
 * 2. Sends the full conversation to each agent for idea extraction
 * 3. Uses a structured prompt to get: title, description, score, take
 * 4. Merges overlapping ideas, averages scores
 * 5. Saves to ideas table → shows on dashboard Ideas panel
 */

import { chat } from '../lib/openai';
import { PERSONAS, AgentName } from '../lib/personas';
import { logActivity } from '../lib/logger';
import { supabase } from '../lib/supabase';

const SESSION_ID = process.argv.find(a => a.startsWith('--session='))?.split('=')[1];

if (!SESSION_ID) {
  console.error('Usage: npx tsx agents/scripts/evaluate.ts --session=<session_id>');
  process.exit(1);
}

interface ExtractedIdea {
  title: string;
  description: string;
  score: number;
  take: string;
}

const EXTRACTION_PROMPT = `You just finished a brainstorm session. Based on the full conversation below, extract the TOP product ideas that were discussed.

For EACH idea, return a JSON array with this exact format:
[
  {
    "title": "Short product name",
    "description": "One paragraph describing the idea, target user, and core mechanic",
    "score": <1-5 how strongly you'd bet on this>,
    "take": "Your specific perspective on why this works or doesn't (2-3 sentences)"
  }
]

Rules:
- Extract 1-3 ideas MAX (only the best ones)
- Score honestly: 1=weak, 3=decent, 5=would bet my career on it
- Your "take" should reflect YOUR persona's perspective
- Return ONLY valid JSON, no markdown fences, no explanation before/after`;

async function loadConversation(sessionId: string): Promise<string> {
  const { data } = await supabase
    .from('messages')
    .select('agent, content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (!data || data.length === 0) return '';

  return data
    .map((m) => {
      const name = PERSONAS[m.agent as AgentName]?.name || m.agent;
      return `[${name}]: ${m.content}`;
    })
    .join('\n\n');
}

async function extractIdeas(agent: AgentName, conversation: string): Promise<ExtractedIdea[]> {
  const persona = PERSONAS[agent];

  const response = await chat(
    persona.systemPrompt,
    [
      {
        role: 'user',
        content: `${EXTRACTION_PROMPT}\n\n--- CONVERSATION ---\n${conversation}`,
      },
    ],
    { temperature: 0.3, maxTokens: 1000 }
  );

  try {
    // Clean response — strip markdown fences if present
    const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const ideas = JSON.parse(cleaned);
    if (!Array.isArray(ideas)) return [];
    return ideas.filter(
      (i: any) => i.title && i.description && typeof i.score === 'number' && i.take
    );
  } catch (err) {
    console.error(`  [${agent}] Failed to parse ideas:`, response.slice(0, 200));
    return [];
  }
}

interface MergedIdea {
  title: string;
  description: string;
  score: number;
  nikita_take: string | null;
  paras_take: string | null;
  karpathy_take: string | null;
  agents_who_picked: AgentName[];
}

function mergeIdeas(
  nikitaIdeas: ExtractedIdea[],
  parasIdeas: ExtractedIdea[],
  karpathyIdeas: ExtractedIdea[]
): MergedIdea[] {
  const allIdeas: { idea: ExtractedIdea; agent: AgentName }[] = [
    ...nikitaIdeas.map((i) => ({ idea: i, agent: 'nikita' as AgentName })),
    ...parasIdeas.map((i) => ({ idea: i, agent: 'paras' as AgentName })),
    ...karpathyIdeas.map((i) => ({ idea: i, agent: 'karpathy' as AgentName })),
  ];

  // Group similar ideas by fuzzy title matching
  const merged: MergedIdea[] = [];

  for (const { idea, agent } of allIdeas) {
    const titleLower = idea.title.toLowerCase();
    // Check if a similar idea already exists
    const existing = merged.find((m) => {
      const existingLower = m.title.toLowerCase();
      // Simple similarity: share 2+ words
      const words1 = titleLower.split(/\s+/);
      const words2 = existingLower.split(/\s+/);
      const shared = words1.filter((w) => words2.includes(w) && w.length > 3);
      return shared.length >= 1;
    });

    if (existing) {
      // Merge into existing
      existing.score = Math.round((existing.score + idea.score) / 2);
      existing.agents_who_picked.push(agent);
      if (agent === 'nikita') existing.nikita_take = idea.take;
      if (agent === 'paras') existing.paras_take = idea.take;
      if (agent === 'karpathy') existing.karpathy_take = idea.take;
      // Use longer description
      if (idea.description.length > existing.description.length) {
        existing.description = idea.description;
      }
    } else {
      merged.push({
        title: idea.title,
        description: idea.description,
        score: idea.score,
        nikita_take: agent === 'nikita' ? idea.take : null,
        paras_take: agent === 'paras' ? idea.take : null,
        karpathy_take: agent === 'karpathy' ? idea.take : null,
        agents_who_picked: [agent],
      });
    }
  }

  // Sort by score descending, then by number of agents who picked it
  return merged.sort((a, b) => {
    if (b.agents_who_picked.length !== a.agents_who_picked.length) {
      return b.agents_who_picked.length - a.agents_who_picked.length;
    }
    return b.score - a.score;
  });
}

async function main() {
  console.log(`📊 Evaluating brainstorm session: ${SESSION_ID}\n`);

  const conversation = await loadConversation(SESSION_ID!);
  if (!conversation) {
    console.error('No messages found for this session.');
    process.exit(1);
  }

  console.log(`Loaded conversation (${conversation.length} chars)\n`);

  // Each agent extracts ideas
  const agents: AgentName[] = ['nikita', 'paras', 'karpathy'];
  const results: Record<AgentName, ExtractedIdea[]> = {
    nikita: [],
    paras: [],
    karpathy: [],
  };

  for (const agent of agents) {
    console.log(`[${PERSONAS[agent].name}] Extracting ideas...`);
    await logActivity(agent, 'analyze', `📊 Evaluating ideas`, 'Reviewing brainstorm conversation...', {
      sessionId: SESSION_ID!,
    });

    results[agent] = await extractIdeas(agent, conversation);
    console.log(`  Found ${results[agent].length} ideas`);
    for (const idea of results[agent]) {
      console.log(`    - ${idea.title} (score: ${idea.score}/5)`);
    }
  }

  // Merge overlapping ideas
  console.log('\n🔀 Merging overlapping ideas...');
  const merged = mergeIdeas(results.nikita, results.paras, results.karpathy);

  console.log(`\n📋 Final ideas (${merged.length}):\n`);

  // Save to Supabase
  for (const idea of merged) {
    const status = idea.agents_who_picked.length >= 2 && idea.score >= 4 ? 'approved' : 'draft';

    const { data, error } = await supabase
      .from('ideas')
      .insert({
        session_id: SESSION_ID,
        title: idea.title,
        description: idea.description,
        score: Math.min(idea.score, 5),
        nikita_take: idea.nikita_take,
        paras_take: idea.paras_take,
        karpathy_take: idea.karpathy_take,
        status,
      })
      .select()
      .single();

    if (error) {
      console.error(`  Failed to save "${idea.title}":`, error.message);
    } else {
      console.log(`  ✅ ${idea.title} — score: ${idea.score}/5, status: ${status}, picked by: ${idea.agents_who_picked.join(', ')}`);

      await logActivity('nikita', 'idea', `⭐ ${idea.title}`, `Score: ${idea.score}/5 | Status: ${status} | ${idea.description.slice(0, 150)}`, {
        sessionId: SESSION_ID!,
        metadata: { ideaId: data.id, score: idea.score, status, agents: idea.agents_who_picked },
      });
    }
  }

  console.log(`\n✅ Evaluation complete! ${merged.length} ideas saved.`);
  console.log(`   Check dashboard: https://warroom-navy.vercel.app/`);
}

main().catch(console.error);
