/**
 * Full Pipeline — discover → brainstorm → evaluate → send for approval
 * 
 * Usage: npx tsx agents/scripts/pipeline.ts [--queries=3] [--rounds=3]
 * 
 * After running, ideas are sent to the War Room Telegram group.
 * Devesh approves/rejects. Approved ideas get pushed to Notion + built by Karpathy.
 */

import { execSync } from 'child_process';
import { resolve } from 'path';
import { sendWarRoomMessage } from '../lib/telegram';

const QUERIES = process.argv.find(a => a.startsWith('--queries='))?.split('=')[1] || '3';
const ROUNDS = process.argv.find(a => a.startsWith('--rounds='))?.split('=')[1] || '3';

const scriptsDir = resolve(__dirname);

function run(cmd: string): string {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`▶ ${cmd}`);
  console.log('='.repeat(60));
  
  const output = execSync(cmd, {
    cwd: resolve(__dirname, '../..'),
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'inherit'],
    timeout: 300000, // 5 min
  });
  
  console.log(output);
  return output;
}

async function main() {
  console.log('🚀 War Room Pipeline Starting...\n');

  await sendWarRoomMessage(
    `🔍 <b>Nikita &amp; Paras are hunting for ideas...</b>\n\n` +
    `Scouring Twitter, HN, Product Hunt, Reddit &amp; blogs.\n` +
    `Will ping you when they find something worth reviewing.`
  );

  // Step 1: Discovery
  const discoverOutput = run(`npx tsx ${scriptsDir}/discover.ts --queries=${QUERIES}`);
  
  // Extract session ID from output
  const sessionMatch = discoverOutput.match(/Session: ([a-f0-9-]+)/);
  if (!sessionMatch) {
    console.error('Failed to extract session ID from discover output');
    process.exit(1);
  }
  const sessionId = sessionMatch[1];
  console.log(`\n📋 Session ID: ${sessionId}`);

  // Step 2: Brainstorm
  run(`npx tsx ${scriptsDir}/brainstorm.ts --session=${sessionId} --rounds=${ROUNDS}`);

  // Step 3: Evaluate
  const evalOutput = run(`npx tsx ${scriptsDir}/evaluate.ts --session=${sessionId}`);

  // Extract summary
  const summaryMatch = evalOutput.match(/---APPROVAL_SUMMARY---([\s\S]*?)---END_SUMMARY---/);
  const summary = summaryMatch ? summaryMatch[1].trim() : 'No ideas extracted.';

  console.log('\n✅ Pipeline complete! Ideas ready for approval.');
  console.log(`   Session: ${sessionId}`);
  console.log(`   Summary:\n${summary}`);

  // Output for the caller (Zoro) to send to Telegram
  console.log('\n---TELEGRAM_MESSAGE---');
  console.log(`🏭 **War Room — New Ideas Ready for Review**\n`);
  console.log(`Session: \`${sessionId}\`\n`);
  console.log(summary);
  console.log(`\nReply with the numbers you want to approve (e.g. "approve 1, 3") or "approve all"`);
  console.log('---END_TELEGRAM---');
}

main().catch(console.error);
