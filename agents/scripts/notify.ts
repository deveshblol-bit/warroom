/**
 * Notify — Send build status updates to Telegram War Room group
 * 
 * Usage: npx tsx agents/scripts/notify.ts --type=pr --idea=<id> --repo=<name> --url=<pr_url>
 *        npx tsx agents/scripts/notify.ts --type=complete --idea=<id>
 *        npx tsx agents/scripts/notify.ts --type=digest
 */

import { supabase } from '../lib/supabase';

// This script outputs a message that Zoro (OpenClaw) picks up and sends to Telegram.
// It's called by the build engine or cron jobs.

const TYPE = process.argv.find(a => a.startsWith('--type='))?.split('=')[1];
const IDEA_ID = process.argv.find(a => a.startsWith('--idea='))?.split('=')[1];
const REPO = process.argv.find(a => a.startsWith('--repo='))?.split('=')[1];
const URL = process.argv.find(a => a.startsWith('--url='))?.split('=')[1];

async function main() {
  if (TYPE === 'pr') {
    const idea = IDEA_ID ? await supabase.from('ideas').select('title').eq('id', IDEA_ID).single() : null;
    const title = idea?.data?.title || REPO || 'Unknown';
    
    console.log('---TELEGRAM---');
    console.log(`📬 **PR Ready for Review**\n`);
    console.log(`Project: **${title}**`);
    console.log(`Repo: ${REPO}`);
    if (URL) console.log(`PR: ${URL}`);
    console.log(`\nKarpathy finished building. Review and merge when ready.`);
    console.log('---END---');

  } else if (TYPE === 'complete') {
    const { data: idea } = await supabase.from('ideas').select('*').eq('id', IDEA_ID).single();
    const { data: tasks } = await supabase.from('tasks').select('*').eq('idea_id', IDEA_ID);
    
    const done = tasks?.filter(t => t.status === 'done').length || 0;
    const total = tasks?.length || 0;

    console.log('---TELEGRAM---');
    console.log(`✅ **Build Complete: ${idea?.title}**\n`);
    console.log(`Tasks: ${done}/${total} done`);
    console.log(`Status: Ready for review`);
    console.log(`\nAll code pushed. Check the repo and merge PRs.`);
    console.log('---END---');

  } else if (TYPE === 'digest') {
    const { data: ideas } = await supabase.from('ideas').select('*').order('created_at', { ascending: false }).limit(10);
    const { data: tasks } = await supabase.from('tasks').select('*');

    const building = ideas?.filter(i => i.status === 'building').length || 0;
    const approved = ideas?.filter(i => i.status === 'approved').length || 0;
    const drafts = ideas?.filter(i => i.status === 'draft').length || 0;
    const backlog = tasks?.filter(t => t.status === 'backlog').length || 0;
    const inProgress = tasks?.filter(t => t.status === 'building').length || 0;
    const review = tasks?.filter(t => t.status === 'review').length || 0;

    console.log('---TELEGRAM---');
    console.log(`📊 **War Room Daily Digest**\n`);
    console.log(`Ideas: ${drafts} draft, ${approved} approved, ${building} building`);
    console.log(`Tasks: ${backlog} backlog, ${inProgress} in progress, ${review} in review`);
    console.log(`\nDashboard: https://warroom-navy.vercel.app/`);
    console.log('---END---');
  }
}

main().catch(console.error);
