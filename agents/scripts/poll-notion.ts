/**
 * Poll Notion — Checks for new "To Do" tasks and "New" ideas
 * 
 * Usage: npx tsx agents/scripts/poll-notion.ts
 * 
 * Run this on a cron (every 10 min). It:
 * 1. Checks Notion Tasks DB for any task moved to "To Do" → Karpathy picks it up
 * 2. Checks Notion Ideas Input DB for new ideas → triggers brainstorm pipeline
 * 3. Outputs actions for Zoro to execute
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(__dirname, '../../.env.agents') });

const NOTION_TOKEN = process.env.NOTION_TOKEN!;
const NOTION_VERSION = '2022-06-28';
const TASKS_DB = '3109499b-96e4-8128-8598-f6af1db6e830';
const IDEAS_INPUT_DB = '3129499b-96e4-8148-ac5a-e8fb1b66a368';

async function notionQuery(dbId: string, filter: any) {
  const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filter }),
  });
  const data = await res.json();
  return data.results || [];
}

async function updatePage(pageId: string, properties: any) {
  await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ properties }),
  });
}

function getTitle(page: any): string {
  const titleProp = Object.values(page.properties).find((p: any) => p.type === 'title') as any;
  return titleProp?.title?.[0]?.text?.content || 'Untitled';
}

function getRichText(page: any, prop: string): string {
  return page.properties[prop]?.rich_text?.[0]?.text?.content || '';
}

function getUrl(page: any, prop: string): string {
  return page.properties[prop]?.url || '';
}

async function checkTasks() {
  console.log('📋 Checking Notion Tasks for "To Do" items...');
  
  const tasks = await notionQuery(TASKS_DB, {
    property: 'Status',
    select: { equals: 'To Do' },
  });

  if (tasks.length === 0) {
    console.log('   No tasks in "To Do"');
    return [];
  }

  console.log(`   Found ${tasks.length} task(s) ready for Karpathy:`);
  
  const pickups = [];
  for (const task of tasks) {
    const title = getTitle(task);
    const notes = getRichText(task, 'Notes');
    const project = getRichText(task, 'Project');
    
    console.log(`   - ${title} (${project})`);
    
    // Mark as In Progress
    await updatePage(task.id, {
      Status: { select: { name: 'In Progress' } },
    });

    pickups.push({
      type: 'task',
      notionId: task.id,
      title,
      description: notes,
      project,
    });
  }

  return pickups;
}

async function checkIdeas() {
  console.log('\n💡 Checking Notion Ideas Input for "New" ideas...');
  
  const ideas = await notionQuery(IDEAS_INPUT_DB, {
    property: 'Status',
    select: { equals: 'New' },
  });

  if (ideas.length === 0) {
    console.log('   No new ideas');
    return [];
  }

  console.log(`   Found ${ideas.length} new idea(s) for brainstorming:`);
  
  const pickups = [];
  for (const idea of ideas) {
    const title = getTitle(idea);
    const description = getRichText(idea, 'Description');
    const resources = getUrl(idea, 'Resources');
    const notes = getRichText(idea, 'Notes');
    
    console.log(`   - ${title}`);
    
    // Mark as Brainstorming
    await updatePage(idea.id, {
      Status: { select: { name: 'Brainstorming' } },
    });

    pickups.push({
      type: 'idea',
      notionId: idea.id,
      title,
      description,
      resources,
      notes,
    });
  }

  return pickups;
}

async function main() {
  console.log('🔄 Polling Notion for new work...\n');

  const taskPickups = await checkTasks();
  const ideaPickups = await checkIdeas();

  const total = taskPickups.length + ideaPickups.length;

  if (total === 0) {
    console.log('\n✅ Nothing new. All quiet.');
  } else {
    console.log(`\n🚀 Found ${total} item(s) to process:`);
    
    // Output structured data for Zoro to act on
    console.log('\n---PICKUPS---');
    console.log(JSON.stringify([...taskPickups, ...ideaPickups], null, 2));
    console.log('---END_PICKUPS---');
  }
}

main().catch(console.error);
