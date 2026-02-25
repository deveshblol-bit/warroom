/**
 * Approve & Build Pipeline — Full post-approval flow
 * 
 * Usage: npx tsx agents/scripts/approve-and-build.ts --idea=<idea_id>
 *        npx tsx agents/scripts/approve-and-build.ts --ideas=<id1,id2,id3>
 * 
 * Flow:
 * 1. Mark idea(s) as approved in Supabase
 * 2. Nikita & Paras have a PRD conversation (prd.ts)
 * 3. Karpathy reviews PRD and breaks into tasks
 * 4. Tasks pushed to Notion
 * 5. Karpathy starts building via Claude Code
 */

import { execSync } from 'child_process';
import { resolve } from 'path';
import { supabase } from '../lib/supabase';
import { sendWarRoomMessage } from '../lib/telegram';

const IDEA_ID = process.argv.find(a => a.startsWith('--idea='))?.split('=')[1];
const IDEA_IDS = process.argv.find(a => a.startsWith('--ideas='))?.split('=')[1]?.split(',');

const ids = IDEA_IDS || (IDEA_ID ? [IDEA_ID] : []);

if (ids.length === 0) {
  console.error('Usage: npx tsx agents/scripts/approve-and-build.ts --idea=<id> | --ideas=<id1,id2>');
  process.exit(1);
}

const scriptsDir = resolve(__dirname);

function run(cmd: string, timeout = 600000): string {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`▶ ${cmd}`);
  console.log('='.repeat(60));

  const output = execSync(cmd, {
    cwd: resolve(__dirname, '../..'),
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'inherit'],
    timeout,
  });

  console.log(output);
  return output;
}

async function main() {
  console.log(`🚀 Approve & Build Pipeline`);
  console.log(`   Ideas: ${ids.length}\n`);

  for (const ideaId of ids) {
    // Load idea
    const { data: idea, error } = await supabase.from('ideas').select('*').eq('id', ideaId).single();
    if (error || !idea) {
      console.error(`Idea not found: ${ideaId}`);
      continue;
    }

    console.log(`\n${'#'.repeat(60)}`);
    console.log(`# ${idea.title} (score: ${idea.score}/5)`);
    console.log(`${'#'.repeat(60)}\n`);

    // Step 1: Mark as approved
    if (idea.status !== 'approved') {
      await supabase.from('ideas').update({ status: 'approved' }).eq('id', ideaId);
      console.log('✅ Status → approved');
    }

    await sendWarRoomMessage(
      `🟢 <b>Approved: ${idea.title}</b>\n\n` +
      `Starting the build pipeline:\n` +
      `1️⃣ Nikita &amp; Paras → PRD\n` +
      `2️⃣ Karpathy → Task breakdown\n` +
      `3️⃣ Push to Notion\n` +
      `4️⃣ Karpathy → Build`
    );

    // Step 2: PRD session
    console.log('\n📝 Step 2: PRD Session...');
    try {
      run(`npx tsx ${scriptsDir}/prd.ts --idea=${ideaId} --rounds=8`);
    } catch (err: any) {
      console.error('PRD failed:', err.message?.slice(0, 200));
      await sendWarRoomMessage(`⚠️ PRD session failed for ${idea.title}. Check logs.`);
      continue;
    }

    // Step 3 & 4: Task breakdown + push to Notion
    console.log('\n📋 Step 3: Task breakdown + Notion...');
    try {
      run(`npx tsx ${scriptsDir}/push-to-notion.ts`);
    } catch (err: any) {
      console.error('Push to Notion failed:', err.message?.slice(0, 200));
      await sendWarRoomMessage(`⚠️ Task breakdown failed for ${idea.title}. Check logs.`);
      continue;
    }

    // Step 5: Karpathy builds
    console.log('\n🔨 Step 4: Karpathy building...');
    try {
      run(`npx tsx ${scriptsDir}/build.ts --idea=${ideaId}`, 900000); // 15min timeout
    } catch (err: any) {
      console.error('Build failed:', err.message?.slice(0, 200));
      await sendWarRoomMessage(`⚠️ Build failed for ${idea.title}. Check tmux session.`);
      continue;
    }

    console.log(`\n✅ ${idea.title} — full pipeline complete!`);
  }

  console.log(`\n🎉 All ${ids.length} idea(s) processed!`);
}

main().catch(console.error);
