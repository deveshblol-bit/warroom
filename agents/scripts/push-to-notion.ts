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
import { createProject, createTask, readPageContent, findProject } from '../lib/notion';
import { sendWarRoomMessage } from '../lib/telegram';

const SESSION_ID = process.argv.find(a => a.startsWith('--session='))?.split('=')[1];

interface TaskBreakdown {
  title: string;
  description: string;
  priority: '⚡ High' | '📌 Medium' | '💤 Low';
}

const TASK_BREAKDOWN_PROMPT = `You are Karpathy. You've just received a PRD from Nikita and Paras. Break it into concrete engineering tasks.

Create 5-8 tasks that you'd need to complete to build this MVP. Each task should be specific, actionable, and completeable in 1-3 hours.

Return a JSON array with this exact format:
[
  {
    "title": "Short task title",
    "description": "Specific description of what to build/implement. Include tech details, file structure, APIs to use, etc.",
    "priority": "⚡ High" or "📌 Medium" or "💤 Low"
  }
]

Rules:
- First task: repo setup / project scaffold with the recommended tech stack from the PRD
- Order by dependency (what needs to be built first)
- Map tasks to the MVP features listed in the PRD
- Include a task for the growth/viral mechanic if the PRD specifies one
- Include a task for analytics/metrics tracking from the PRD's success metrics
- Be specific about tech choices, file paths, component names
- Focus on MVP only — respect the "Out of Scope" section from the PRD
- Return ONLY valid JSON, no markdown fences`;

async function breakdownIntoTasks(ideaTitle: string, ideaDescription: string, prd?: string): Promise<TaskBreakdown[]> {
  const context = prd
    ? `--- PRD (from Nikita & Paras) ---\nTitle: ${ideaTitle}\n\n${prd}`
    : `--- IDEA ---\nTitle: ${ideaTitle}\nDescription: ${ideaDescription}`;

  const response = await chat(
    PERSONAS.karpathy.systemPrompt,
    [
      {
        role: 'user',
        content: `${TASK_BREAKDOWN_PROMPT}\n\n${context}`,
      },
    ],
    { temperature: 0.3, maxTokens: 1200 }
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

      // 2. Read PRD from Notion (if it exists)
      let prd: string | undefined;
      if (project.id) {
        console.log('  📖 Reading PRD from Notion...');
        try {
          const content = await readPageContent(project.id);
          if (content && content.length > 50) {
            prd = content;
            console.log(`  ✅ PRD loaded (${content.length} chars)`);
          }
        } catch (err: any) {
          console.log(`  ⚠️ No PRD found on Notion page, using idea description`);
        }
      }

      // 3. Karpathy breaks into tasks (using PRD if available)
      console.log('  🔨 Karpathy breaking into tasks...');
      await logActivity('karpathy', 'analyze', `🔨 Breaking down: ${idea.title}`, 
        prd ? 'Reading PRD from Notion and creating tasks...' : 'Creating engineering tasks for MVP...', {
        sessionId: idea.session_id,
      });

      const tasks = await breakdownIntoTasks(idea.title, idea.description, prd);
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

      // Always add deployment task at the end
      console.log('  🚀 Adding deployment task...');
      const deployNotionTask = await createTask(
        'Deploy to Vercel',
        idea.title,
        'Push all changes to GitHub and deploy to Vercel. Create vercel.json config if needed. Return live URL.',
        '⚡ High',
        'To Do'
      );

      await supabase
        .from('tasks')
        .insert({
          idea_id: idea.id,
          title: 'Deploy to Vercel',
          description: 'Push all changes to GitHub and deploy to Vercel. Create vercel.json config if needed. Return live URL.',
          assigned_to: 'karpathy',
          status: 'backlog',
          notion_task_id: deployNotionTask.id,
        })
        .select()
        .single();

      console.log('    ✅ Deploy to Vercel (⚡ High)');

      // Update idea status to building
      await supabase
        .from('ideas')
        .update({ status: 'building' })
        .eq('id', idea.id);

      const totalTasks = tasks.length + 1; // +1 for deployment
      console.log(`\n  🚀 ${idea.title} → ${totalTasks} tasks created in Notion + dashboard`);

      // Notify War Room
      const taskList = tasks.map((t, i) => `  ${i + 1}. ${t.title} (${t.priority})`).join('\n');
      const fullTaskList = taskList + `\n  ${tasks.length + 1}. Deploy to Vercel (⚡ High)`;
      await sendWarRoomMessage(
        `📋 <b>${idea.title}</b> → Notion\n\n` +
        `Score: ${idea.score}/5 | Priority: ${priority}\n` +
        `Karpathy broke it into ${totalTasks} tasks:\n\n` +
        `${fullTaskList}\n\n` +
        `🔗 <a href="${project.url}">View in Notion</a>`
      );

    } catch (err: any) {
      console.error(`  ❌ Failed for "${idea.title}":`, err.message);
    }
  }

  console.log('\n✅ All ideas pushed to Notion!');
  console.log('   Check Notion: https://www.notion.so/3109499b96e481be8a24ffc424d9f8ed');
  console.log('   Check dashboard: https://warroom-navy.vercel.app/');
}

main().catch(console.error);
