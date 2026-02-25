/**
 * Brainstorm Script — All 3 agents discuss discovered sources
 * 
 * Usage: npx tsx agents/scripts/brainstorm.ts --session=<session_id> [--rounds=4]
 * 
 * What it does:
 * 1. Loads discovered sources from the session's activity_log
 * 2. Nikita kicks off with growth/distribution perspective
 * 3. Paras responds with strategy/experimentation lens
 * 4. Karpathy weighs in on technical feasibility
 * 5. They go back and forth for N rounds
 * 6. All messages logged in real-time to Supabase → visible on dashboard
 */

import { chat } from '../lib/openai';
import { PERSONAS, AgentName } from '../lib/personas';
import { logMessage, logActivity, updateSession } from '../lib/logger';
import { supabase } from '../lib/supabase';

const SESSION_ID = process.argv.find(a => a.startsWith('--session='))?.split('=')[1];
const ROUNDS = parseInt(process.argv.find(a => a.startsWith('--rounds='))?.split('=')[1] || '4');

if (!SESSION_ID) {
  console.error('Usage: npx tsx agents/scripts/brainstorm.ts --session=<session_id>');
  process.exit(1);
}

interface ConversationMessage {
  agent: AgentName;
  content: string;
}

async function loadSources(sessionId: string): Promise<string> {
  const { data } = await supabase
    .from('activity_log')
    .select('agent, title, content, url, metadata')
    .eq('session_id', sessionId)
    .eq('type', 'read')
    .order('created_at', { ascending: true });

  if (!data || data.length === 0) return 'No sources found.';

  return data
    .map((s, i) => `[${i + 1}] (found by ${s.agent}) ${s.title}\n   ${s.content}\n   ${s.url || ''}`)
    .join('\n\n');
}

function buildConversationContext(
  sources: string,
  history: ConversationMessage[],
  currentAgent: AgentName
): { role: 'user' | 'assistant'; content: string }[] {
  const messages: { role: 'user' | 'assistant'; content: string }[] = [];

  // First message always includes sources context
  if (history.length === 0) {
    messages.push({
      role: 'user',
      content: `Here are the sources our team discovered today. Review them and share your top insights — what excites you? What product opportunities do you see?\n\n${sources}`,
    });
  } else {
    // Include sources as context + conversation history
    messages.push({
      role: 'user',
      content: `Context — sources discovered today:\n${sources}\n\n---\nConversation so far:`,
    });

    for (const msg of history) {
      if (msg.agent === currentAgent) {
        messages.push({ role: 'assistant', content: msg.content });
      } else {
        messages.push({
          role: 'user',
          content: `[${PERSONAS[msg.agent].name}]: ${msg.content}`,
        });
      }
    }

    // Prompt the current agent to respond
    const otherAgents = history
      .filter(m => m.agent !== currentAgent)
      .map(m => PERSONAS[m.agent].name);
    
    messages.push({
      role: 'user',
      content: `Respond to the points above. Build on what resonates, push back on what doesn't. What's your take?`,
    });
  }

  return messages;
}

async function runBrainstorm() {
  console.log(`🧠 Starting brainstorm session: ${SESSION_ID}\n`);

  // Load sources
  const sources = await loadSources(SESSION_ID!);
  console.log(`📚 Loaded sources from discovery phase\n`);

  await logActivity('nikita', 'analyze', '🧠 Brainstorm starting', 'Reviewing discovered sources...', {
    sessionId: SESSION_ID!,
  });

  const history: ConversationMessage[] = [];

  // Agent speaking order — rotates each round
  const speakingOrder: AgentName[] = ['nikita', 'paras', 'karpathy'];

  for (let round = 0; round < ROUNDS; round++) {
    console.log(`\n--- Round ${round + 1}/${ROUNDS} ---\n`);

    for (const agent of speakingOrder) {
      const persona = PERSONAS[agent];
      const context = buildConversationContext(sources, history, agent);

      console.log(`[${persona.name}] Thinking...`);

      try {
        const response = await chat(persona.systemPrompt, context, {
          temperature: 0.9,
          maxTokens: 400,
        });

        // Log to Supabase (appears on dashboard in real-time)
        await logMessage(SESSION_ID!, agent, response);

        // Log activity too
        await logActivity(agent, 'analyze', `💬 ${persona.name} speaking`, response.slice(0, 150) + '...', {
          sessionId: SESSION_ID!,
        });

        history.push({ agent, content: response });

        console.log(`[${persona.name}]: ${response}\n`);
      } catch (err: any) {
        console.error(`[${persona.name}] Error:`, err.message);
      }

      // Small delay between agents
      await new Promise(r => setTimeout(r, 300));
    }
  }

  // Final summary round — each agent picks their top idea
  console.log('\n--- Final Takes ---\n');

  for (const agent of speakingOrder) {
    const persona = PERSONAS[agent];
    const summaryContext = buildConversationContext(sources, history, agent);
    summaryContext.push({
      role: 'user',
      content: `Based on everything discussed, what's the ONE product idea you'd bet on? Give it a name, one-line description, and why it would work. Be specific.`,
    });

    try {
      const response = await chat(persona.systemPrompt, summaryContext, {
        temperature: 0.7,
        maxTokens: 300,
      });

      await logMessage(SESSION_ID!, agent, `🏆 MY TOP PICK:\n\n${response}`);
      await logActivity(agent, 'flag', `🏆 ${persona.name}'s top pick`, response.slice(0, 200), {
        sessionId: SESSION_ID!,
      });

      history.push({ agent, content: `🏆 MY TOP PICK:\n\n${response}` });
      console.log(`[${persona.name}] TOP PICK: ${response}\n`);
    } catch (err: any) {
      console.error(`[${persona.name}] Error:`, err.message);
    }
  }

  // Update session
  await updateSession(SESSION_ID!, { status: 'completed', ended_at: new Date().toISOString() });

  console.log('\n✅ Brainstorm complete!');
  console.log(`   ${history.length} messages exchanged`);
  console.log(`   Session: ${SESSION_ID}`);
  console.log(`   Check dashboard: https://warroom-navy.vercel.app/`);
}

runBrainstorm().catch(console.error);
