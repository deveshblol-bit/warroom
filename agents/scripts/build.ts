/**
 * Karpathy Build Engine — Picks up tasks and builds with Claude Code via tmux
 * 
 * Usage:
 *   npx tsx agents/scripts/build.ts --check          # Check Notion for "To Do" tasks and build them
 *   npx tsx agents/scripts/build.ts --idea=<idea_id>  # Build all backlog tasks for a Supabase idea
 *   npx tsx agents/scripts/build.ts --task=<task_id>   # Build a single Supabase task
 *   npx tsx agents/scripts/build.ts --notion-task=<id> # Build a single Notion task by page ID
 */

import { execSync } from 'child_process';
import { logActivity } from '../lib/logger';
import { supabase } from '../lib/supabase';
import { sendWarRoomMessage } from '../lib/telegram';

const IDEA_ID = process.argv.find(a => a.startsWith('--idea='))?.split('=')[1];
const TASK_ID = process.argv.find(a => a.startsWith('--task='))?.split('=')[1];
const NOTION_TASK_ID = process.argv.find(a => a.startsWith('--notion-task='))?.split('=')[1];
const CHECK_MODE = process.argv.includes('--check');

if (!IDEA_ID && !TASK_ID && !NOTION_TASK_ID && !CHECK_MODE) {
  console.error('Usage: npx tsx agents/scripts/build.ts --check | --idea=<id> | --task=<id> | --notion-task=<id>');
  process.exit(1);
}

const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
if (!GITHUB_TOKEN) throw new Error('Missing GITHUB_TOKEN in .env.agents');
const NOTION_TOKEN = process.env.NOTION_TOKEN!;
const GITHUB_USER = 'deveshblol-bit';
const SOCKET_DIR = '/tmp/openclaw-tmux-sockets';
const SOCKET = `${SOCKET_DIR}/warroom.sock`;
const WORKSPACE_ROOT = '/home/ubuntu/clawd/warroom-builds';
const NOTION_TASKS_DB = '3109499b-96e4-8128-8598-f6af1db6e830';

// Map project names to existing local workspaces
const PROJECT_WORKSPACES: Record<string, string> = {
  'War Room Dashboard': '/home/ubuntu/clawd/warroom',
  'warroom': '/home/ubuntu/clawd/warroom',
};

// Map project names to existing repos (no need to create new ones)
const PROJECT_REPOS: Record<string, string> = {
  'War Room Dashboard': 'https://github.com/deveshblol-bit/warroom',
  'warroom': 'https://github.com/deveshblol-bit/warroom',
};

function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 30000 }).trim();
  } catch (err: any) {
    return err.stdout?.toString() || '';
  }
}

function tmux(cmd: string): string {
  return run(`tmux -S "${SOCKET}" ${cmd}`);
}

// --- Notion helpers ---

async function notionFetch(path: string, method = 'GET', body?: any) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function getNotionTodoTasks(): Promise<any[]> {
  const data = await notionFetch(`/databases/${NOTION_TASKS_DB}/query`, 'POST', {
    filter: { property: 'Status', select: { equals: 'To Do' } }
  });
  return data.results || [];
}

async function getNotionTask(pageId: string): Promise<any> {
  return notionFetch(`/pages/${pageId}`);
}

async function updateNotionTaskStatus(pageId: string, status: string) {
  return notionFetch(`/pages/${pageId}`, 'PATCH', {
    properties: { 'Status': { select: { name: status } } }
  });
}

function parseNotionTask(page: any) {
  const p = page.properties;
  return {
    id: page.id,
    task: p.Task?.title?.[0]?.plain_text || 'Untitled',
    project: p.Project?.rich_text?.[0]?.plain_text || '',
    priority: p.Priority?.select?.name || '📌 Medium',
    notes: p.Notes?.rich_text?.[0]?.plain_text || '',
    dueDate: p['Due Date']?.date?.start || null,
  };
}

// --- Workspace helpers ---

function resolveWorkspace(projectName: string): { workdir: string; repoUrl: string; isExisting: boolean } {
  // Check if this is an existing project with a known workspace
  for (const [key, workdir] of Object.entries(PROJECT_WORKSPACES)) {
    if (projectName.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(projectName.toLowerCase())) {
      return { workdir, repoUrl: PROJECT_REPOS[key] || '', isExisting: true };
    }
  }
  // New project — create workspace under warroom-builds
  const repoName = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'karpathy-build';
  return { workdir: `${WORKSPACE_ROOT}/${repoName}`, repoUrl: '', isExisting: false };
}

async function createGithubRepo(name: string, description: string): Promise<string> {
  const existing = run(`curl -s -o /dev/null -w "%{http_code}" -H "Authorization: token ${GITHUB_TOKEN}" "https://api.github.com/repos/${GITHUB_USER}/${name}"`);
  if (existing === '200') {
    console.log(`  Repo ${name} already exists`);
    return `https://github.com/${GITHUB_USER}/${name}`;
  }
  const result = run(`curl -s -X POST "https://api.github.com/user/repos" \
    -H "Authorization: token ${GITHUB_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '${JSON.stringify({ name, description, private: false, auto_init: true })}'`);
  const parsed = JSON.parse(result);
  console.log(`  ✅ Created repo: ${parsed.html_url}`);
  return parsed.html_url;
}

async function setupNewWorkspace(repoName: string): Promise<string> {
  const workdir = `${WORKSPACE_ROOT}/${repoName}`;
  run(`mkdir -p "${WORKSPACE_ROOT}"`);
  const repoUrl = `https://${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${repoName}.git`;
  if (!run(`test -d "${workdir}/.git" && echo "yes"`)) {
    run(`git clone "${repoUrl}" "${workdir}"`);
    console.log(`  Cloned to ${workdir}`);
  } else {
    run(`cd "${workdir}" && git pull`);
    console.log(`  Updated existing workspace at ${workdir}`);
  }
  return workdir;
}

// --- Tmux + Claude Code ---

function startTmuxSession(sessionName: string, workdir: string): void {
  run(`mkdir -p "${SOCKET_DIR}"`);
  tmux(`kill-session -t "${sessionName}" 2>/dev/null || true`);
  tmux(`new-session -d -s "${sessionName}" -c "${workdir}"`);
  console.log(`  ✅ tmux session "${sessionName}" started`);
  console.log(`  Monitor: tmux -S "${SOCKET}" attach -t "${sessionName}"`);
}

function sendToClaudeCode(sessionName: string, prompt: string): void {
  const escapedPrompt = prompt.replace(/'/g, "'\\''");
  const cmd = `claude --dangerously-skip-permissions -p '${escapedPrompt}'`;
  tmux(`send-keys -t "${sessionName}" -l -- '${cmd.replace(/'/g, "'\\''")}'`);
  run('sleep 0.2');
  tmux(`send-keys -t "${sessionName}" Enter`);
  console.log(`  ✅ Sent prompt to Claude Code`);
}

function captureOutput(sessionName: string, lines: number = 200): string {
  return tmux(`capture-pane -p -J -t "${sessionName}" -S -${lines}`);
}

function isComplete(sessionName: string): boolean {
  const output = captureOutput(sessionName, 5);
  return /(\$|❯|➜)\s*$/.test(output) && !output.includes('Thinking');
}

// --- Prompt builders ---

function buildExistingProjectPrompt(taskTitle: string, taskNotes: string, projectName: string): string {
  return `You are working on the "${projectName}" project — an existing codebase.

Current task: ${taskTitle}
${taskNotes ? `Details: ${taskNotes}` : ''}

Requirements:
- Read the existing code first to understand the structure
- Make targeted changes — don't rewrite things that work
- Follow the existing code style and patterns
- Test that your changes don't break existing functionality
- After completing the task, commit your changes with a descriptive message
- Push to the main branch

Start building now.`;
}

function buildNewProjectPrompt(ideaTitle: string, ideaDesc: string, taskTitle: string, taskDesc: string): string {
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

// --- Core build logic ---

async function buildNotionTask(page: any): Promise<void> {
  const task = parseNotionTask(page);
  console.log(`\n📋 Task: ${task.task}`);
  console.log(`   Project: ${task.project || 'Unassigned'}`);
  console.log(`   Priority: ${task.priority}`);

  const { workdir, repoUrl, isExisting } = resolveWorkspace(task.project);
  let finalRepoUrl = repoUrl;
  let finalWorkdir = workdir;

  if (!isExisting) {
    // New project — create repo + workspace
    const repoName = task.project.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'karpathy-build';
    console.log(`\n🔨 Setting up new repo: ${repoName}`);
    finalRepoUrl = await createGithubRepo(repoName, task.notes || task.task);
    finalWorkdir = await setupNewWorkspace(repoName);
  } else {
    console.log(`\n📂 Using existing workspace: ${workdir}`);
    // Pull latest
    run(`cd "${workdir}" && git pull 2>&1 || true`);
  }

  const sessionName = `karpathy-${task.project.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'build'}`;
  startTmuxSession(sessionName, finalWorkdir);

  const prompt = isExisting
    ? buildExistingProjectPrompt(task.task, task.notes, task.project)
    : buildNewProjectPrompt(task.project, task.notes, task.task, task.notes);

  // Update Notion status to In Progress
  await updateNotionTaskStatus(task.id, 'In Progress');

  await sendWarRoomMessage(
    `🔨 <b>Karpathy building:</b> ${task.task}\n` +
    `Project: ${task.project || 'Unassigned'}\n` +
    (isExisting ? `📂 Existing codebase` : `🆕 New repo: ${finalRepoUrl}`)
  );

  sendToClaudeCode(sessionName, prompt);

  // Poll for completion
  console.log('  ⏳ Claude Code working...');
  let attempts = 0;
  const maxAttempts = 120; // 10 minutes

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

  const finalOutput = captureOutput(sessionName, 50);

  // Update Notion status to Done
  await updateNotionTaskStatus(task.id, 'Done');

  // Git push
  run(`cd "${finalWorkdir}" && git add -A && git commit -m "feat: ${task.task}" --allow-empty && git push 2>&1`);
  console.log(`  📤 Pushed changes`);

  await sendWarRoomMessage(
    `✅ <b>Done:</b> ${task.task}\n` +
    `Project: ${task.project}\n` +
    `Status → Done`
  );

  await logActivity('karpathy', 'build', `✅ Completed: ${task.task}`, finalOutput.slice(-300), {});
}

// --- Main ---

async function main() {
  console.log('⚡ Karpathy Build Engine starting...\n');

  if (CHECK_MODE) {
    // Check Notion for "To Do" tasks
    console.log('🔍 Checking Notion for "To Do" tasks...\n');
    const pages = await getNotionTodoTasks();

    if (pages.length === 0) {
      console.log('No "To Do" tasks found in Notion.');
      process.exit(0);
    }

    console.log(`Found ${pages.length} task(s) to build.\n`);

    for (const page of pages) {
      await buildNotionTask(page);
      // Delay between tasks
      await new Promise(r => setTimeout(r, 2000));
    }

    console.log(`\n✅ All ${pages.length} task(s) processed!`);

  } else if (NOTION_TASK_ID) {
    // Build a single Notion task by page ID
    const page = await getNotionTask(NOTION_TASK_ID);
    if (!page.id) {
      console.error('Notion task not found:', NOTION_TASK_ID);
      process.exit(1);
    }
    await buildNotionTask(page);

  } else if (IDEA_ID) {
    // Build all backlog tasks for a Supabase idea
    const { data: idea, error } = await supabase.from('ideas').select('*').eq('id', IDEA_ID).single();
    if (error || !idea) throw new Error(`Idea not found: ${IDEA_ID}`);

    console.log(`📋 Idea: ${idea.title} (score: ${idea.score}/5)`);
    if (idea.status !== 'approved') {
      console.error(`Idea status is "${idea.status}" — needs to be "approved".`);
      process.exit(1);
    }

    const { data: tasks } = await supabase.from('tasks').select('*').eq('idea_id', IDEA_ID).eq('status', 'backlog').order('created_at', { ascending: true });
    if (!tasks?.length) {
      console.log('No backlog tasks found.');
      process.exit(0);
    }

    const repoName = idea.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const repoUrl = await createGithubRepo(repoName, idea.description);
    const workdir = await setupNewWorkspace(repoName);

    await sendWarRoomMessage(
      `⚡ <b>Karpathy picking up: ${idea.title}</b>\n\n` +
      `${tasks.length} tasks queued\nRepo: ${repoUrl}\n\nBuilding now...`
    );

    for (const task of tasks) {
      console.log(`\n--- Task: ${task.title} ---`);
      const sessionName = `karpathy-${repoName}`;
      startTmuxSession(sessionName, workdir);

      const prompt = buildNewProjectPrompt(idea.title, idea.description, task.title, task.description);
      await supabase.from('tasks').update({ status: 'building' }).eq('id', task.id);

      sendToClaudeCode(sessionName, prompt);
      await sendWarRoomMessage(`🔨 <b>Karpathy building:</b> ${task.title}\nProject: ${idea.title}`);

      console.log('  ⏳ Claude Code working...');
      let attempts = 0;
      while (attempts < 120) {
        await new Promise(r => setTimeout(r, 5000));
        attempts++;
        if (isComplete(sessionName)) { console.log(`  ✅ Done (${attempts * 5}s)`); break; }
        if (attempts % 12 === 0) console.log(`  ⏳ ${attempts * 5}s...`);
      }

      await supabase.from('tasks').update({ status: 'review' }).eq('id', task.id);
      run(`cd "${workdir}" && git add -A && git commit -m "${task.title}" --allow-empty && git push 2>&1`);
      await new Promise(r => setTimeout(r, 2000));
    }

    await supabase.from('ideas').update({ status: 'building' }).eq('id', IDEA_ID);
    await sendWarRoomMessage(
      `✅ <b>Build complete: ${idea.title}</b>\n\nAll ${tasks.length} tasks done → in review\nRepo: https://github.com/${GITHUB_USER}/${repoName}\n\nCheck and merge when ready 🚀`
    );

  } else if (TASK_ID) {
    // Build a single Supabase task
    const { data: task, error } = await supabase.from('tasks').select('*, ideas(*)').eq('id', TASK_ID).single();
    if (error || !task) throw new Error(`Task not found: ${TASK_ID}`);

    const idea = task.ideas;
    const repoName = (idea?.title || 'warroom-build').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const workdir = await setupNewWorkspace(repoName);
    const sessionName = `karpathy-${repoName}`;

    startTmuxSession(sessionName, workdir);
    const prompt = buildNewProjectPrompt(idea?.title || 'Project', idea?.description || '', task.title, task.description);
    await supabase.from('tasks').update({ status: 'building' }).eq('id', task.id);
    sendToClaudeCode(sessionName, prompt);

    console.log(`\n  ⏳ Claude Code working... Monitor: tmux -S "${SOCKET}" attach -t "${sessionName}"`);
  }
}

main().catch(console.error);
