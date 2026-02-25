/**
 * Notify — Send build status updates to Telegram War Room group
 * 
 * Usage: npx tsx agents/scripts/notify.ts --type=pr --idea=<id> --repo=<name> --url=<pr_url>
 *        npx tsx agents/scripts/notify.ts --type=complete --idea=<id>
 *        npx tsx agents/scripts/notify.ts --type=digest
 *        npx tsx agents/scripts/notify.ts --type=picked --idea=<id> --task=<title>
 */

import { supabase } from '../lib/supabase';
import { sendWarRoomMessage } from '../lib/telegram';

const TYPE = process.argv.find(a => a.startsWith('--type='))?.split('=')[1];
const IDEA_ID = process.argv.find(a => a.startsWith('--idea='))?.split('=')[1];
const REPO = process.argv.find(a => a.startsWith('--repo='))?.split('=')[1];
const URL = process.argv.find(a => a.startsWith('--url='))?.split('=')[1];
const TASK_TITLE = process.argv.find(a => a.startsWith('--task='))?.split('=')[1];

async function main() {
  if (TYPE === 'picked') {
    const idea = IDEA_ID ? await supabase.from('ideas').select('title').eq('id', IDEA_ID).single() : null;
    const title = idea?.data?.title || 'Unknown';
    await sendWarRoomMessage(
      `🔨 <b>Karpathy picked up:</b> ${TASK_TITLE || 'task'}\n` +
      `Project: ${title}`
    );

  } else if (TYPE === 'pr') {
    const idea = IDEA_ID ? await supabase.from('ideas').select('title').eq('id', IDEA_ID).single() : null;
    const title = idea?.data?.title || REPO || 'Unknown';
    await sendWarRoomMessage(
      `📬 <b>PR Ready for Review</b>\n\n` +
      `Project: <b>${title}</b>\n` +
      (REPO ? `Repo: ${REPO}\n` : '') +
      (URL ? `PR: ${URL}\n` : '') +
      `\nKarpathy finished building. Review and merge when ready.`
    );

  } else if (TYPE === 'complete') {
    const { data: idea } = await supabase.from('ideas').select('*').eq('id', IDEA_ID).single();
    const { data: tasks } = await supabase.from('tasks').select('*').eq('idea_id', IDEA_ID);
    const done = tasks?.filter(t => t.status === 'done').length || 0;
    const total = tasks?.length || 0;
    await sendWarRoomMessage(
      `✅ <b>Build Complete: ${idea?.title}</b>\n\n` +
      `Tasks: ${done}/${total} done\n` +
      `Status: Ready for review\n\n` +
      `All code pushed. Check the repo and merge PRs.`
    );

  } else if (TYPE === 'digest') {
    const { data: ideas } = await supabase.from('ideas').select('*').order('created_at', { ascending: false }).limit(10);
    const { data: tasks } = await supabase.from('tasks').select('*');
    const building = ideas?.filter(i => i.status === 'building').length || 0;
    const approved = ideas?.filter(i => i.status === 'approved').length || 0;
    const drafts = ideas?.filter(i => i.status === 'draft').length || 0;
    const backlog = tasks?.filter(t => t.status === 'backlog').length || 0;
    const inProgress = tasks?.filter(t => t.status === 'building').length || 0;
    const review = tasks?.filter(t => t.status === 'review').length || 0;
    await sendWarRoomMessage(
      `📊 <b>War Room Daily Digest</b>\n\n` +
      `Ideas: ${drafts} draft, ${approved} approved, ${building} building\n` +
      `Tasks: ${backlog} backlog, ${inProgress} in progress, ${review} in review\n\n` +
      `Dashboard: https://warroom-navy.vercel.app/`
    );

  } else {
    console.error('Unknown --type. Use: picked, pr, complete, digest');
    process.exit(1);
  }
}

main().catch(console.error);
