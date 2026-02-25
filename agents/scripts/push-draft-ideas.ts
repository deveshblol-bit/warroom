/**
 * Push draft ideas to Notion — for ideas that haven't been reviewed yet
 * Usage: npx tsx agents/scripts/push-draft-ideas.ts
 */

import { supabase } from '../lib/supabase';
import { createProject } from '../lib/notion';
import { sendWarRoomMessage } from '../lib/telegram';

async function main() {
  console.log('📤 Pushing draft ideas to Notion...\n');

  // Load draft ideas that haven't been pushed to Notion yet
  const { data: ideas, error } = await supabase
    .from('ideas')
    .select('*')
    .is('notion_page_id', null)
    .eq('status', 'draft')
    .order('score', { ascending: false });

  if (error) {
    console.error('Failed to load ideas:', error.message);
    process.exit(1);
  }

  if (!ideas || ideas.length === 0) {
    console.log('No ideas to push.');
    process.exit(0);
  }

  console.log(`Found ${ideas.length} ideas to push.\n`);

  for (const idea of ideas) {
    console.log(`\n--- ${idea.title} (score: ${idea.score}/5, status: ${idea.status}) ---\n`);

    const priority = idea.score >= 4 ? '🔥 High' : idea.score >= 3 ? '📌 Medium' : '💤 Low';

    try {
      // Create Project in Notion with Draft status
      const project = await createProject(idea.title, idea.description, priority, 'Draft');
      console.log(`  ✅ Project created (Draft): ${project.url}`);

      // Update idea with Notion page ID
      await supabase
        .from('ideas')
        .update({ notion_page_id: project.id })
        .eq('id', idea.id);

      // Notify
      await sendWarRoomMessage(
        `📝 <b>${idea.title}</b> → Notion (Draft)\n\n` +
        `Score: ${idea.score}/5 | Status: ${idea.status}\n` +
        `Priority: ${priority}\n\n` +
        `${idea.description.slice(0, 200)}...\n\n` +
        `🔗 <a href="${project.url}">Review in Notion</a>`
      );

    } catch (err: any) {
      console.error(`  ❌ Failed for "${idea.title}":`, err.message);
    }
  }

  console.log('\n✅ All ideas pushed to Notion!');
}

main().catch(console.error);
