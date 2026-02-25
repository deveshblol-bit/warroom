/**
 * Brainstorm Script — Real group chat between 3 agents
 * 
 * Usage: npx tsx agents/scripts/brainstorm.ts --session=<session_id> [--rounds=10]
 * 
 * Agents have a natural conversation — they react to each other,
 * build on ideas, disagree, riff. Not a rigid round-robin.
 */

import { chat } from '../lib/openai';
import { PERSONAS, AgentName } from '../lib/personas';
import { logMessage, logActivity, updateSession } from '../lib/logger';
import { supabase } from '../lib/supabase';

const SESSION_ID = process.argv.find(a => a.startsWith('--session='))?.split('=')[1];
const ROUNDS = parseInt(process.argv.find(a => a.startsWith('--rounds='))?.split('=')[1] || '10');

if (!SESSION_ID) {
  console.error('Usage: npx tsx agents/scripts/brainstorm.ts --session=<session_id>');
  process.exit(1);
}

interface ChatMessage {
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

/**
 * Build the chat thread as OpenAI messages for a specific agent.
 * The agent sees the full conversation as a group chat — other agents' 
 * messages come as "user" messages tagged with their name.
 */
function buildChatThread(
  sources: string,
  history: ChatMessage[],
  currentAgent: AgentName,
  prompt: string
): { role: 'user' | 'assistant'; content: string }[] {
  const messages: { role: 'user' | 'assistant'; content: string }[] = [];

  // System context: sources (only once, at the start)
  messages.push({
    role: 'user',
    content: `[CONTEXT] Here are the sources the team discovered today:\n\n${sources}\n\n---\n\nYou're in a group chat with ${Object.values(PERSONAS).filter(p => p.name !== PERSONAS[currentAgent].name).map(p => p.name).join(' and ')}. This is a brainstorming session. Be natural — react to what others say, build on their ideas, push back when you disagree. Talk like you would in a real group chat, not a presentation.`,
  });

  // Replay the full conversation
  for (const msg of history) {
    if (msg.agent === currentAgent) {
      messages.push({ role: 'assistant', content: msg.content });
    } else {
      messages.push({
        role: 'user',
        content: `${PERSONAS[msg.agent].name}: ${msg.content}`,
      });
    }
  }

  // The prompt for this turn
  messages.push({ role: 'user', content: prompt });

  return messages;
}

/**
 * Pick who speaks next. Not pure round-robin — adds some dynamics:
 * - The agent who was just addressed/challenged is more likely to respond
 * - Nikita tends to jump in when someone says something about distribution
 * - Some randomness to keep it natural
 */
function pickNextSpeaker(history: ChatMessage[], lastSpeaker: AgentName | null): AgentName {
  const agents: AgentName[] = ['nikita', 'paras', 'karpathy'];
  
  if (history.length === 0) return 'nikita'; // Nikita always kicks off
  
  const lastMsg = history[history.length - 1];
  const lastContent = lastMsg.content.toLowerCase();
  
  // If someone was directly referenced, they respond
  if (lastContent.includes('nikita') && lastMsg.agent !== 'nikita') return 'nikita';
  if (lastContent.includes('paras') && lastMsg.agent !== 'paras') return 'paras';
  if (lastContent.includes('karpathy') && lastMsg.agent !== 'karpathy') return 'karpathy';
  
  // If last message asked a question or challenged, someone else responds
  const others = agents.filter(a => a !== lastSpeaker);
  
  // Weighted selection — agent who spoke least gets priority
  const counts = agents.reduce((acc, a) => {
    acc[a] = history.filter(m => m.agent === a).length;
    return acc;
  }, {} as Record<AgentName, number>);
  
  // Sort others by least spoken
  others.sort((a, b) => counts[a] - counts[b]);
  
  // 70% chance least-spoken agent goes, 30% the other
  return Math.random() < 0.7 ? others[0] : others[1];
}

/**
 * Generate a natural prompt based on conversation state.
 * Early rounds: react to sources. Mid rounds: build on each other.
 * Late rounds: converge on ideas.
 */
function getPrompt(round: number, totalRounds: number, history: ChatMessage[], agent: AgentName): string {
  const phase = round / totalRounds;
  const lastMsg = history.length > 0 ? history[history.length - 1] : null;
  const lastName = lastMsg ? PERSONAS[lastMsg.agent].name : null;
  
  if (history.length === 0) {
    return `You just saw these sources. What jumps out? What's the most interesting pattern or opportunity? Kick off the brainstorm — be opinionated.`;
  }
  
  if (phase < 0.3) {
    // Early: react and riff
    const prompts = [
      `${lastName} just shared their take. What do you think? Agree? Disagree? What are they missing?`,
      `React to what ${lastName} said. Build on it or push back. What opportunity do you see?`,
      `${lastName} made some interesting points. What's your angle on this?`,
    ];
    return prompts[Math.floor(Math.random() * prompts.length)];
  }
  
  if (phase < 0.7) {
    // Mid: debate and refine
    const prompts = [
      `The conversation's heating up. Where do you agree and disagree with the group? Push the thinking further.`,
      `Build on what's been said. What specific product idea is forming? Poke holes in anything that's weak.`,
      `React to ${lastName}'s point. Are they right? What would you add or change?`,
      `You've heard everyone's takes. What's the idea that keeps coming back? Why does it work (or not)?`,
      `Challenge something someone said. What's the blind spot in the group's thinking right now?`,
    ];
    return prompts[Math.floor(Math.random() * prompts.length)];
  }
  
  // Late: converge
  const prompts = [
    `We're getting close. What's the strongest idea on the table? Sharpen it — give it a name, a one-liner, and the key insight.`,
    `Time to converge. Which idea has the best shot? Be specific about why.`,
    `Final thoughts on this thread. What idea should we actually build? Give a concrete take.`,
  ];
  return prompts[Math.floor(Math.random() * prompts.length)];
}

async function runBrainstorm() {
  console.log(`🧠 Brainstorm session: ${SESSION_ID}`);
  console.log(`   Rounds: ${ROUNDS}\n`);

  const sources = await loadSources(SESSION_ID!);
  console.log(`📚 Loaded sources\n`);

  await logActivity('nikita', 'analyze', '🧠 Brainstorm starting', 'The war room is live. Reviewing sources...', {
    sessionId: SESSION_ID!,
  });

  const history: ChatMessage[] = [];
  let lastSpeaker: AgentName | null = null;

  for (let round = 0; round < ROUNDS; round++) {
    const agent = pickNextSpeaker(history, lastSpeaker);
    const persona = PERSONAS[agent];
    const prompt = getPrompt(round, ROUNDS, history, agent);

    console.log(`[Round ${round + 1}/${ROUNDS}] ${persona.name} thinking...`);

    try {
      const thread = buildChatThread(sources, history, agent, prompt);
      
      const response = await chat(persona.systemPrompt, thread, {
        temperature: 0.95,
        maxTokens: 250, // shorter, punchier messages
      });

      // Log to Supabase messages (shows in dashboard chat panel)
      await logMessage(SESSION_ID!, agent, response);

      // Log to activity feed
      await logActivity(agent, 'analyze', `💬 ${persona.name}`, response.slice(0, 150) + '...', {
        sessionId: SESSION_ID!,
      });

      history.push({ agent, content: response });
      lastSpeaker = agent;

      console.log(`[${persona.name}]: ${response}\n`);
    } catch (err: any) {
      console.error(`[${persona.name}] Error:`, err.message);
    }

    // Natural pacing — slight delay
    await new Promise(r => setTimeout(r, 500));
  }

  // === FINAL PICKS ===
  console.log('\n🏆 Final Picks\n');

  const allAgents: AgentName[] = ['nikita', 'paras', 'karpathy'];
  
  for (const agent of allAgents) {
    const persona = PERSONAS[agent];
    const thread = buildChatThread(sources, history, agent,
      `Alright, final pick time. Based on everything discussed, what's THE ONE product idea you'd bet on? Give it:\n- A name\n- One-line description\n- The key insight (why this works)\n- Score it 1-5 on viability\n\nBe specific. No hedging.`
    );

    try {
      const response = await chat(persona.systemPrompt, thread, {
        temperature: 0.7,
        maxTokens: 300,
      });

      await logMessage(SESSION_ID!, agent, `🏆 MY TOP PICK:\n\n${response}`);
      await logActivity(agent, 'flag', `🏆 ${persona.name}'s top pick`, response.slice(0, 200), {
        sessionId: SESSION_ID!,
      });

      history.push({ agent, content: `🏆 MY TOP PICK:\n\n${response}` });
      console.log(`[${persona.name}] 🏆 ${response}\n`);
    } catch (err: any) {
      console.error(`[${persona.name}] Error:`, err.message);
    }
  }

  await updateSession(SESSION_ID!, { status: 'completed', ended_at: new Date().toISOString() });

  console.log('\n✅ Brainstorm complete!');
  console.log(`   ${history.length} messages (${ROUNDS} rounds + 3 final picks)`);
  console.log(`   Session: ${SESSION_ID}`);
  console.log(`   Dashboard: https://warroom-navy.vercel.app/`);
}

runBrainstorm().catch(console.error);
