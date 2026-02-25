/**
 * Approve & Build Pipeline — Full autopilot from approval to shipping
 * 
 * Usage: npx tsx agents/scripts/approve.ts --idea=<title|id>
 * 
 * What it does:
 * 1. Marks idea as approved in Supabase
 * 2. Pushes to Notion (creates PRD + tasks)
 * 3. Triggers Karpathy to build all tasks sequentially
 */

import { execSync } from 'child_process';
import { supabase } from '../lib/supabase';
import { sendWarRoomMessage } from '../lib/telegram';

const IDEA_ARG = process.argv.find(a => a.startsWith('--idea='))?.split('=')[1];

if (!IDEA_ARG) {
  console.error('Usage: npx tsx agents/scripts/approve.ts --idea=<title|id>');
  process.exit(1);
}

function run(cmd: string): string {
  console.log(`\n💻 ${cmd}\n`);
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: 'inherit' }).trim();
  } catch (err: any) {
    console.error(`❌ Command failed: ${err.message}`);
    process.exit(1);
  }
}

async function main() {
  console.log('🚀 Approval Pipeline Starting...\n');

  // 1. Find the idea
  console.log(`🔍 Looking for idea: ${IDEA_ARG}`);
  
  let query = supabase.from('ideas').select('*');
  
  // Check if it's a UUID
  if (IDEA_ARG.match(/^[0-9a-f-]{36}$/i)) {
    query = query.eq('id', IDEA_ARG);
  } else {
    query = query.ilike('title', `%${IDEA_ARG}%`);
  }
  
  const { data: ideas, error } = await query.limit(1).single();

  if (error || !ideas) {
    console.error('❌ Idea not found:', IDEA_ARG);
    process.exit(1);
  }

  const idea = ideas;
  console.log(`✅ Found: ${idea.title} (score: ${idea.score}/5, status: ${idea.status})\n`);

  // 2. Approve it
  if (idea.status !== 'approved') {
    console.log('✍️  Marking as approved...');
    await supabase
      .from('ideas')
      .update({ status: 'approved' })
      .eq('id', idea.id);
    console.log('✅ Status → approved\n');
  } else {
    console.log('ℹ️  Already approved\n');
  }

  // 3. Push to Notion + create tasks (if not already done)
  if (!idea.notion_page_id) {
    console.log('📤 Pushing to Notion + creating tasks...');
    run('npx tsx agents/scripts/push-to-notion.ts');
  } else {
    console.log('ℹ️  Already in Notion, checking for tasks...');
    const { count } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('idea_id', idea.id);
    
    if (!count || count === 0) {
      console.log('⚠️  No tasks found, creating them...');
      // TODO: Add task creation without re-pushing to Notion
    } else {
      console.log(`✅ ${count} tasks exist\n`);
    }
  }
  
  // 4. Trigger Karpathy build pipeline
  console.log('🔨 Karpathy starting build...');
  await sendWarRoomMessage(
    `🚀 <b>${idea.title}</b> — Build Pipeline Started\n\n` +
    `Karpathy is now building all tasks sequentially. Check dashboard for progress:\n` +
    `https://warroom-navy.vercel.app/kanban`
  );
  
  run(`npx tsx agents/scripts/build.ts --idea=${idea.id}`);

  console.log('\n✅ Pipeline complete!');
  console.log('   Check dashboard: https://warroom-navy.vercel.app/');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
