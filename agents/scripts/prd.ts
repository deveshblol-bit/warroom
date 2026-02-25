/**
 * PRD Session — Nikita & Paras discuss an approved idea and produce a PRD
 * 
 * Usage: npx tsx agents/scripts/prd.ts --idea=<idea_id>
 * 
 * What it does:
 * 1. Loads the approved idea from Supabase
 * 2. Nikita & Paras have a focused conversation about the product
 * 3. They discuss: user journey, viral loop, metrics, MVP scope, risks
 * 4. Final output: a structured PRD that gets saved to the idea's description
 * 5. Then Karpathy reviews the PRD and breaks it into engineering tasks
 */

import { chat } from '../lib/openai';
import { PERSONAS } from '../lib/personas';
import { logMessage, logActivity } from '../lib/logger';
import { supabase } from '../lib/supabase';
import { sendWarRoomMessage } from '../lib/telegram';
import { createProject, writePRDToPage, findProject } from '../lib/notion';

const IDEA_ID = process.argv.find(a => a.startsWith('--idea='))?.split('=')[1];
const ROUNDS = parseInt(process.argv.find(a => a.startsWith('--rounds='))?.split('=')[1] || '8');

if (!IDEA_ID) {
  console.error('Usage: npx tsx agents/scripts/prd.ts --idea=<idea_id>');
  process.exit(1);
}

type Agent = 'nikita' | 'paras';

interface ChatMessage {
  agent: Agent;
  content: string;
}

function buildThread(
  idea: any,
  history: ChatMessage[],
  currentAgent: Agent,
  prompt: string
): { role: 'user' | 'assistant'; content: string }[] {
  const messages: { role: 'user' | 'assistant'; content: string }[] = [];
  const otherAgent: Agent = currentAgent === 'nikita' ? 'paras' : 'nikita';

  messages.push({
    role: 'user',
    content: `[APPROVED IDEA] Devesh approved this idea for building. You and ${PERSONAS[otherAgent].name} need to hash out a PRD before Karpathy starts coding.

Title: ${idea.title}
Description: ${idea.description}
Score: ${idea.score}/5
Nikita's take: ${idea.nikita_take || 'N/A'}
Paras's take: ${idea.paras_take || 'N/A'}
Karpathy's take: ${idea.karpathy_take || 'N/A'}

This is a focused PRD conversation. Think about: target user, core problem, MVP features (ruthlessly scoped), user journey, growth mechanics, success metrics, risks. Be specific — Karpathy needs to code from this.`,
  });

  for (const msg of history) {
    if (msg.agent === currentAgent) {
      messages.push({ role: 'assistant', content: msg.content });
    } else {
      messages.push({ role: 'user', content: `${PERSONAS[msg.agent].name}: ${msg.content}` });
    }
  }

  messages.push({ role: 'user', content: prompt });
  return messages;
}

function getPrompt(round: number, totalRounds: number, history: ChatMessage[], agent: Agent): string {
  const phase = round / totalRounds;
  const other = agent === 'nikita' ? 'Paras' : 'Nikita';

  if (history.length === 0) {
    return `This idea just got approved. Let's figure out what we're actually building. Start with: who's the user, what's the core problem, and what does the MVP look like? Be opinionated — we need to ship fast.`;
  }

  if (phase < 0.25) {
    const prompts = [
      `${other} laid out their thinking. React — what do you agree with? What's wrong? Sharpen the target user and core problem.`,
      `Build on ${other}'s points. What's the user journey look like? Walk through the first 60 seconds of the app.`,
    ];
    return prompts[Math.floor(Math.random() * prompts.length)];
  }

  if (phase < 0.5) {
    const prompts = [
      `Let's get specific on MVP scope. What are the MUST-HAVE features (max 3-4) vs nice-to-haves? What do we cut?`,
      `${other} made some scope calls. Agree or push back. Also — what's the growth loop? How does this spread?`,
      `What metrics prove this is working? Be specific — what numbers do we track in week 1?`,
    ];
    return prompts[Math.floor(Math.random() * prompts.length)];
  }

  if (phase < 0.75) {
    const prompts = [
      `What are the risks? What kills this idea? What's the hardest part to get right?`,
      `Tech stack and architecture — what should Karpathy build this with? Any specific technical requirements?`,
      `React to ${other}'s points. Are we being ambitious enough or too ambitious? Tighten the scope.`,
    ];
    return prompts[Math.floor(Math.random() * prompts.length)];
  }

  return `Final thoughts. Let's lock in the PRD. Summarize: target user, problem, MVP features, growth mechanic, success metrics. Make it actionable for Karpathy.`;
}

async function generatePRD(idea: any, history: ChatMessage[]): Promise<string> {
  const conversationText = history.map(m => `${PERSONAS[m.agent].name}: ${m.content}`).join('\n\n');

  const response = await chat(
    `You are a senior product manager. Your job is to synthesize a brainstorming conversation into a clean, structured PRD that an engineer can build from.`,
    [{
      role: 'user',
      content: `Based on this conversation between Nikita Bier and Paras Chopra about "${idea.title}", create a structured PRD.

CONVERSATION:
${conversationText}

Create a PRD with these exact sections:

## Product Overview
One paragraph: what is this, who's it for, why now.

## Target User
Specific persona. Age, behavior, pain point.

## Core Problem
One sentence.

## MVP Features (v1)
Numbered list. Max 4-5 features. Each with a one-line description.

## User Journey
Step by step: download → first action → aha moment → retention loop → share moment

## Growth Mechanics
How does this spread? Be specific about the viral loop.

## Success Metrics (Week 1)
3-4 specific, measurable metrics.

## Tech Stack Recommendation
What to build with. Keep it simple.

## Risks & Mitigations
Top 2-3 risks and how to handle them.

## Out of Scope (v1)
What we're NOT building yet.

Be specific and actionable. No fluff. Karpathy needs to code from this.`,
    }],
    { temperature: 0.3, maxTokens: 1500 }
  );

  return response;
}

async function main() {
  // Load the idea
  const { data: idea, error } = await supabase.from('ideas').select('*').eq('id', IDEA_ID).single();
  if (error || !idea) {
    console.error('Idea not found:', IDEA_ID);
    process.exit(1);
  }

  console.log(`📋 PRD Session: ${idea.title}`);
  console.log(`   Score: ${idea.score}/5 | Status: ${idea.status}\n`);

  // Create a session for this PRD conversation
  const { data: session } = await supabase
    .from('sessions')
    .insert({ type: 'prd', status: 'active', metadata: { idea_id: IDEA_ID, idea_title: idea.title } })
    .select()
    .single();

  const sessionId = session?.id || idea.session_id;

  await sendWarRoomMessage(
    `📝 <b>PRD Session: ${idea.title}</b>\n\n` +
    `Nikita &amp; Paras are hashing out the product spec.\n` +
    `Will ping you when the PRD is ready.`
  );

  await logActivity('nikita', 'analyze', `📝 PRD session starting: ${idea.title}`, 'Nikita and Paras discussing product requirements...', {
    sessionId,
  });

  const history: ChatMessage[] = [];
  const agents: Agent[] = ['nikita', 'paras'];
  let turn = 0;

  for (let round = 0; round < ROUNDS; round++) {
    const agent = agents[turn % 2];
    // Occasionally let the same agent go twice if they were challenged
    if (round > 0 && history.length >= 2) {
      const lastMsg = history[history.length - 1];
      const lastContent = lastMsg.content.toLowerCase();
      if (lastContent.includes(PERSONAS[agent].name.toLowerCase().split(' ')[0]) && lastMsg.agent !== agent) {
        // They were called out — let them respond
      } else {
        turn++;
      }
    } else {
      if (round > 0) turn++;
    }

    const currentAgent = agents[turn % 2];
    const persona = PERSONAS[currentAgent];
    const prompt = getPrompt(round, ROUNDS, history, currentAgent);

    console.log(`[Round ${round + 1}/${ROUNDS}] ${persona.name} thinking...`);

    try {
      const thread = buildThread(idea, history, currentAgent, prompt);
      const response = await chat(persona.systemPrompt, thread, {
        temperature: 0.85,
        maxTokens: 300,
      });

      await logMessage(sessionId, currentAgent, response);
      await logActivity(currentAgent, 'analyze', `💬 ${persona.name}`, response.slice(0, 150) + '...', { sessionId });

      history.push({ agent: currentAgent, content: response });
      console.log(`[${persona.name}]: ${response}\n`);
    } catch (err: any) {
      console.error(`[${persona.name}] Error:`, err.message);
    }

    await new Promise(r => setTimeout(r, 500));
  }

  // Generate the structured PRD from the conversation
  console.log('\n📄 Generating structured PRD...\n');
  const prd = await generatePRD(idea, history);
  console.log(prd);

  // Save PRD to Notion — find or create the project page
  console.log('\n📤 Saving PRD to Notion...');
  let project = await findProject(idea.title);
  const priority = idea.score >= 4 ? '🔥 High' : idea.score >= 3 ? '📌 Medium' : '💤 Low';

  if (!project) {
    project = await createProject(idea.title, idea.description, priority as any, 'Planning');
    console.log(`  ✅ Created Notion project: ${project.url}`);
    // Save notion_page_id to Supabase
    await supabase.from('ideas').update({ notion_page_id: project.id }).eq('id', IDEA_ID);
  } else {
    console.log(`  📂 Found existing Notion project: ${project.url}`);
  }

  // Write PRD as page content
  await writePRDToPage(project.id, prd);
  console.log(`  ✅ PRD written to Notion page`);

  // Also log the PRD as a message in Supabase (for dashboard)
  await logMessage(sessionId, 'nikita', `📄 FINAL PRD:\n\n${prd}`);
  await logActivity('paras', 'flag', `📄 PRD complete: ${idea.title}`, prd.slice(0, 300), { sessionId });

  // Update session
  if (session?.id) {
    await supabase.from('sessions').update({ status: 'completed', ended_at: new Date().toISOString() }).eq('id', session.id);
  }

  await sendWarRoomMessage(
    `📄 <b>PRD Ready: ${idea.title}</b>\n\n` +
    `Nikita &amp; Paras finished the product spec.\n` +
    `${history.length} messages exchanged.\n` +
    `PRD saved to Notion → <a href="${project.url}">View PRD</a>\n\n` +
    `Handing off to Karpathy for task breakdown.`
  );

  console.log(`\n✅ PRD complete! ${history.length} messages exchanged.`);
  console.log(`   Notion: ${project.url}`);
  console.log(`   Session: ${sessionId}`);
  console.log(`   Next: Karpathy reads PRD from Notion → breaks into tasks`);
}

main().catch(console.error);
