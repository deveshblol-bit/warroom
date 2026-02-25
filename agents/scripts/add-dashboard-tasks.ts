import { createTask } from '../lib/notion';
import { supabase } from '../lib/supabase';
import { logActivity } from '../lib/logger';

const tasks = [
  {
    title: 'Add markdown renderer to Brainstorm Chat',
    description: 'Install react-markdown and remark-gfm. Update BrainstormChat.tsx to render message content as markdown instead of plain text. Support bold, italic, lists, code blocks, and links. Keep the chat bubble styling.',
    priority: '⚡ High' as const,
  },
  {
    title: 'Add idea detail modal on click',
    description: "When clicking an idea card in IdeaBoard, open a modal/dialog showing the full idea: title, description, score, and each agent's take (nikita_take, paras_take, karpathy_take) with their colored labels. Use shadcn dialog component.",
    priority: '⚡ High' as const,
  },
  {
    title: 'Make dashboard mobile responsive',
    description: 'The dashboard currently uses a 3-column layout on desktop with tabs for mobile. Fix the mobile tab layout to work properly — ensure each tab panel takes full height, scrolls correctly, and all panels are usable on small screens. Test at 375px width.',
    priority: '📌 Medium' as const,
  },
];

async function main() {
  console.log('📋 Adding 3 dashboard tasks to Notion + Supabase...\n');

  for (const task of tasks) {
    const notionTask = await createTask(task.title, 'War Room Dashboard', task.description, task.priority, 'To Do');
    console.log(`✅ Notion: ${task.title}`);

    const { data } = await supabase.from('tasks').insert({
      title: task.title,
      description: task.description,
      assigned_to: 'karpathy',
      status: 'backlog',
      notion_task_id: notionTask.id,
    }).select().single();

    console.log(`   Supabase: ${data?.id}`);

    await logActivity('karpathy', 'build', `📋 New task: ${task.title}`, task.description, {
      metadata: { notionTaskId: notionTask.id },
    });
  }

  console.log('\n✅ 3 tasks added! Karpathy can pick them up now.');
}

main().catch(console.error);
