/**
 * Push to Notion — Approved ideas → Projects DB + task breakdown → Tasks DB
 * 
 * Usage: npx tsx agents/scripts/push-to-notion.ts [--session=<session_id>]
 * 
 * What it does:
 * 1. Loads approved ideas from Supabase (optionally filtered by session)
 * 2. Creates a Project in Notion Projects DB for each idea
 * 3. Uses Karpathy to break each idea into engineering tasks
 * 4. Creates tasks in Notion Tasks DB (kanban)
 * 5. Also saves tasks to Supabase tasks table → visible on dashboard
 */

import { chat } from '../lib/openai';
import { PERSONAS } from '../lib/personas';
import { logActivity } from '../lib/logger';
import { supabase } from '../lib/supabase';
import { createProject, createTask } from '../lib/notion';

const SESSION_ID = process.argv.find(a => a.startsWith('--session='))?.split('=')[1];

interface TaskBreakdown {
  title: string;
  description: string;
  priority: '⚡ High' | '📌 Medium' | '💤 Low';
}

const TASK_BREAKDOWN_PROMPT = `You are breaking down a product idea into concrete engineering tasks. 

Given the idea below, create 3-5 tasks that an engineer would need to complete to build an MVP. Each task should be specific, actionable, and completeable in 1-3 hours.

Return a JSON array with this exact format:
[
  {
    "title": "Short task title",
    "description": "Specific description of what to build/implement",
    "priority": "⚡ High" or "📌 Medium" or "💤 Low"
  }
]

Rules:
- First task should always be repo setup / project scaffold
- Order tasks by dependency (what needs to be built first)
- Focus on MVP — minimum viable version only
- Be specific about tech choices (React, Next.js, etc.)
- Return ONLY valid JSON, no markdown fences`;

async function breakdownIntoTasks(ideaTitle: string, ideaDescription: string): Promise<TaskBreakdown[]> {
  const response = await chat(
    PERSONAS.karpathy.systemPrompt,
    [
      {
        role: 'user',
        content: `${TASK_BREAKDOWN_PROMPT}\n\n--- IDEA ---\nTitle: ${ideaTitle}\nDescription: ${ideaDescription}`,
      },
    ],
    { temperature: 0.3, maxTokens: 800 }
  );

  try {
    const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const tasks = JSON.parse(cleaned);
    if (!Array.isArray(tasks)) return [];
    return tasks.filter((t: any) => t.title && t.description && t.priority);
  } catch (err) {
    console.error('  Failed to parse tasks:', response.slice(0, 200));
    return [];
  }
}

async function main() {
  console.log('📤 Pushing approved ideas to Notion...\n');

  // Load approved ideas that haven't been pushed yet
  let query = supabase
    .from('ideas')
    .select('*')
    .eq('status', 'approved')
    .is('notion_page_id', null)
    .order('score', { ascending: false });

  if (SESSION_ID) {
    query = query.eq('session_id', SESSION_ID);
  }

  const { data: ideas, error } = await query;

  if (error) {
    console.error('Failed to load ideas:', error.message);
    process.exit(1);
  }

  if (!ideas || ideas.length === 0) {
    console.log('No approved ideas to push. Run evaluate.ts first.');
    process.exit(0);
  }

  console.log(`Found ${ideas.length} approved ideas to push.\n`);

  for (const idea of ideas) {
    console.log(`\n--- ${idea.title} (score: ${idea.score}/5) ---\n`);

    // 1. Create Project in Notion
    console.log('  📋 Creating Notion project...');
    const priority = idea.score >= 4 ? '🔥 High' : idea.score >= 3 ? '📌 Medium' : '💤 Low';

    try {
      const project = await createProject(idea.title, idea.description, priority, 'Planning');
      console.log(`  ✅ Project created: ${project.url}`);

      // Update idea with Notion page ID
      await supabase
        .from('ideas')
        .update({ notion_page_id: project.id })
        .eq('id', idea.id);

      await logActivity('nikita', 'idea', `📤 Pushed to Notion: ${idea.title}`, `Project created in Notion with priority ${priority}`, {
        sessionId: idea.session_id,
        url: project.url,
        metadata: { notionPageId: project.id },
      });

      // 2. Break into tasks via Karpathy
      console.log('  🔨 Karpathy breaking into tasks...');
      await logActivity('karpathy', 'analyze', `🔨 Breaking down: ${idea.title}`, 'Creating engineering tasks for MVP...', {
        sessionId: idea.session_id,
      });

      const tasks = await breakdownIntoTasks(idea.title, idea.description);
      console.log(`  Found ${tasks.length} tasks`);

      for (const task of tasks) {
        // Create in Notion Tasks DB
        const notionTask = await createTask(
          task.title,
          idea.title,
          task.description,
          task.priority as any,
          'To Do'
        );

        // Also save to Supabase tasks table (for dashboard kanban)
        const { data: savedTask } = await supabase
          .from('tasks')
          .insert({
            idea_id: idea.id,
            title: task.title,
            description: task.description,
            assigned_to: 'karpathy',
            status: 'backlog',
            notion_task_id: notionTask.id,
          })
          .select()
          .single();

        console.log(`    ✅ ${task.title} (${task.priority})`);

        await logActivity('karpathy', 'build', `📋 Task: ${task.title}`, task.description.slice(0, 150), {
          sessionId: idea.session_id,
          metadata: { notionTaskId: notionTask.id, priority: task.priority, ideaTitle: idea.title },
        });
      }

      // Update idea status to building
      await supabase
        .from('ideas')
        .update({ status: 'building' })
        .eq('id', idea.id);

      console.log(`\n  🚀 ${idea.title} → ${tasks.length} tasks created in Notion + dashboard`);

    } catch (err: any) {
      console.error(`  ❌ Failed for "${idea.title}":`, err.message);
    }
  }

  console.log('\n✅ All ideas pushed to Notion!');
  console.log('   Check Notion: https://www.notion.so/3109499b96e481be8a24ffc424d9f8ed');
  console.log('   Check dashboard: https://warroom-navy.vercel.app/');
}

main().catch(console.error);
