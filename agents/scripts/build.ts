/**
 * Karpathy Build Engine — Picks up approved tasks and builds with Claude Code via tmux
 * 
 * Usage: npx tsx agents/scripts/build.ts --idea=<idea_id>
 *        npx tsx agents/scripts/build.ts --task=<task_id>
 * 
 * What it does:
 * 1. Loads an approved idea or specific task from Supabase
 * 2. Creates a GitHub repo (if needed)
 * 3. Spins up a tmux session with Claude Code
 * 4. Sends the task prompt to Claude Code
 * 5. Monitors progress, logs to activity_log
 * 6. When done, creates a PR and notifies via Telegram
 */

import { execSync } from 'child_process';
import { logActivity } from '../lib/logger';
import { supabase } from '../lib/supabase';

const IDEA_ID = process.argv.find(a => a.startsWith('--idea='))?.split('=')[1];
const TASK_ID = process.argv.find(a => a.startsWith('--task='))?.split('=')[1];

if (!IDEA_ID && !TASK_ID) {
  console.error('Usage: npx tsx agents/scripts/build.ts --idea=<idea_id> | --task=<task_id>');
  process.exit(1);
}

const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
if (!GITHUB_TOKEN) throw new Error('Missing GITHUB_TOKEN in .env.agents');
const GITHUB_USER = 'deveshblol-bit';
const SOCKET_DIR = '/tmp/openclaw-tmux-sockets';
const SOCKET = `${SOCKET_DIR}/warroom.sock`;
const WORKSPACE_ROOT = '/home/ubuntu/clawd/warroom-builds';

function exec(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 30000 }).trim();
  } catch (err: any) {
    return err.stdout?.toString() || '';
  }
}

function tmux(cmd: string): string {
  return exec(`tmux -S "${SOCKET}" ${cmd}`);
}

async function createGithubRepo(name: string, description: string): Promise<string> {
  const existing = exec(`curl -s -o /dev/null -w "%{http_code}" -H "Authorization: token ${GITHUB_TOKEN}" "https://api.github.com/repos/${GITHUB_USER}/${name}"`);
  
  if (existing === '200') {
    console.log(`  Repo ${name} already exists`);
    return `https://github.com/${GITHUB_USER}/${name}`;
  }

  const result = exec(`curl -s -X POST "https://api.github.com/user/repos" \
    -H "Authorization: token ${GITHUB_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '${JSON.stringify({ name, description, private: false, auto_init: true })}'`);

  const parsed = JSON.parse(result);
  console.log(`  ✅ Created repo: ${parsed.html_url}`);
  return parsed.html_url;
}

async function setupWorkspace(repoName: string): Promise<string> {
  const workdir = `${WORKSPACE_ROOT}/${repoName}`;
  
  exec(`mkdir -p "${WORKSPACE_ROOT}"`);
  
  // Clone if not exists
  const repoUrl = `https://${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${repoName}.git`;
  if (!exec(`test -d "${workdir}/.git" && echo "yes"`)) {
    exec(`git clone "${repoUrl}" "${workdir}"`);
    console.log(`  Cloned to ${workdir}`);
  } else {
    exec(`cd "${workdir}" && git pull`);
    console.log(`  Updated existing workspace at ${workdir}`);
  }
  
  return workdir;
}

function startTmuxSession(sessionName: string, workdir: string): void {
  exec(`mkdir -p "${SOCKET_DIR}"`);
  
  // Kill existing session if any
  tmux(`kill-session -t "${sessionName}" 2>/dev/null || true`);
  
  // Create new session
  tmux(`new-session -d -s "${sessionName}" -c "${workdir}"`);
  console.log(`  ✅ tmux session "${sessionName}" started`);
  console.log(`  Monitor: tmux -S "${SOCKET}" attach -t "${sessionName}"`);
}

function sendToClaudeCode(sessionName: string, prompt: string): void {
  // Launch claude code with the prompt in non-interactive mode
  const escapedPrompt = prompt.replace(/'/g, "'\\''");
  const cmd = `claude --dangerously-skip-permissions -p '${escapedPrompt}'`;
  
  tmux(`send-keys -t "${sessionName}" -l -- '${cmd.replace(/'/g, "'\\''")}'`);
  exec('sleep 0.2');
  tmux(`send-keys -t "${sessionName}" Enter`);
  
  console.log(`  ✅ Sent prompt to Claude Code`);
}

function captureOutput(sessionName: string, lines: number = 200): string {
  return tmux(`capture-pane -p -J -t "${sessionName}" -S -${lines}`);
}

function isComplete(sessionName: string): boolean {
  const output = captureOutput(sessionName, 5);
  // Check for shell prompt (indicates Claude Code finished)
  return /(\$|❯|➜)\s*$/.test(output) && !output.includes('Thinking');
}

async function loadIdea(ideaId: string) {
  const { data, error } = await supabase
    .from('ideas')
    .select('*')
    .eq('id', ideaId)
    .single();

  if (error || !data) throw new Error(`Idea not found: ${ideaId}`);
  return data;
}

async function loadTasksForIdea(ideaId: string) {
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .eq('idea_id', ideaId)
    .eq('status', 'backlog')
    .order('created_at', { ascending: true });

  return data || [];
}

async function loadTask(taskId: string) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*, ideas(*)')
    .eq('id', taskId)
    .single();

  if (error || !data) throw new Error(`Task not found: ${taskId}`);
  return data;
}

function buildPrompt(ideaTitle: string, ideaDesc: string, taskTitle: string, taskDesc: string, repoName: string): string {
  return `You are building an MVP for "${ideaTitle}".

Project description: ${ideaDesc}

Current task: ${taskTitle}
Task details: ${taskDesc}

Requirements:
- Build this as a Next.js app with TypeScript and Tailwind CSS
- Keep it simple — MVP only, no over-engineering
- Write clean, well-structured code
- Create necessary files and directories
- If there are existing files, build on top of them
- After completing the task, commit your changes with a descriptive message
- Push to the main branch

Start building now.`;
}

async function main() {
  console.log('⚡ Karpathy Build Engine starting...\n');

  if (IDEA_ID) {
    // Build all backlog tasks for an idea
    const idea = await loadIdea(IDEA_ID);
    console.log(`📋 Idea: ${idea.title} (score: ${idea.score}/5)`);
    
    if (idea.status !== 'approved') {
      console.error(`Idea status is "${idea.status}" — needs to be "approved". Get Devesh's approval first.`);
      process.exit(1);
    }

    const tasks = await loadTasksForIdea(IDEA_ID);
    if (tasks.length === 0) {
      console.log('No backlog tasks found. Run push-to-notion.ts first.');
      process.exit(0);
    }

    // Create repo
    const repoName = idea.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    console.log(`\n🔨 Setting up repo: ${repoName}`);
    
    const repoUrl = await createGithubRepo(repoName, idea.description);
    const workdir = await setupWorkspace(repoName);

    await logActivity('karpathy', 'build', `🔨 Starting build: ${idea.title}`, `Repo: ${repoUrl}`, {
      sessionId: idea.session_id,
      url: repoUrl,
    });

    // Process tasks one by one
    for (const task of tasks) {
      console.log(`\n--- Task: ${task.title} ---`);

      const sessionName = `karpathy-${repoName}`;
      startTmuxSession(sessionName, workdir);

      const prompt = buildPrompt(idea.title, idea.description, task.title, task.description, repoName);

      // Update task status
      await supabase.from('tasks').update({ status: 'building' }).eq('id', task.id);

      await logActivity('karpathy', 'build', `🔨 Building: ${task.title}`, prompt.slice(0, 200), {
        sessionId: idea.session_id,
      });

      sendToClaudeCode(sessionName, prompt);

      // Poll for completion
      console.log('  ⏳ Claude Code working...');
      let attempts = 0;
      const maxAttempts = 120; // 10 minutes (5s intervals)
      
      while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 5000));
        attempts++;
        
        if (isComplete(sessionName)) {
          console.log(`  ✅ Task complete! (${attempts * 5}s)`);
          break;
        }
        
        if (attempts % 12 === 0) {
          const output = captureOutput(sessionName, 3);
          console.log(`  ⏳ Still working... (${attempts * 5}s) — ${output.slice(-80).trim()}`);
        }
      }

      if (attempts >= maxAttempts) {
        console.log('  ⚠️ Timed out after 10 minutes');
      }

      // Capture final output
      const finalOutput = captureOutput(sessionName, 50);
      
      // Update task status
      await supabase.from('tasks').update({ status: 'review' }).eq('id', task.id);

      await logActivity('karpathy', 'build', `✅ Completed: ${task.title}`, finalOutput.slice(-300), {
        sessionId: idea.session_id,
      });

      // Push changes
      exec(`cd "${workdir}" && git add -A && git commit -m "${task.title}" --allow-empty && git push 2>&1`);

      console.log(`  📤 Pushed changes`);

      // Small delay between tasks
      await new Promise(r => setTimeout(r, 2000));
    }

    // Update idea status
    await supabase.from('ideas').update({ status: 'building' }).eq('id', IDEA_ID);

    console.log(`\n✅ All tasks for "${idea.title}" completed!`);
    console.log(`   Repo: https://github.com/${GITHUB_USER}/${repoName}`);
    console.log(`   Tasks are in "review" status — check Notion kanban.`);

  } else if (TASK_ID) {
    // Build a single task
    const task = await loadTask(TASK_ID);
    const idea = task.ideas;
    
    console.log(`📋 Task: ${task.title}`);
    console.log(`   Idea: ${idea?.title || 'Unknown'}`);

    const repoName = (idea?.title || 'warroom-build').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const workdir = await setupWorkspace(repoName);
    const sessionName = `karpathy-${repoName}`;
    
    startTmuxSession(sessionName, workdir);
    
    const prompt = buildPrompt(
      idea?.title || 'Project',
      idea?.description || '',
      task.title,
      task.description,
      repoName
    );

    await supabase.from('tasks').update({ status: 'building' }).eq('id', task.id);
    
    sendToClaudeCode(sessionName, prompt);
    
    console.log('\n  ⏳ Claude Code working... Monitor with:');
    console.log(`     tmux -S "${SOCKET}" attach -t "${sessionName}"`);
    console.log('\n  Build started in background. Check activity log on dashboard.');
  }
}

main().catch(console.error);
