import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../../.env.agents') });

const NOTION_TOKEN = process.env.NOTION_TOKEN!;
const NOTION_VERSION = '2022-06-28';
const NOTION_ENDPOINT = 'https://api.notion.com/v1';

const PROJECTS_DB = '3109499b-96e4-81be-8a24-ffc424d9f8ed';
const TASKS_DB = '3109499b-96e4-8128-8598-f6af1db6e830';

if (!NOTION_TOKEN) throw new Error('Missing NOTION_TOKEN in .env.agents');

async function notionFetch(path: string, body?: any) {
  const res = await fetch(`${NOTION_ENDPOINT}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Notion API error (${res.status}): ${err}`);
  }

  return res.json();
}

export async function createProject(
  title: string,
  description: string,
  priority: '🔥 High' | '📌 Medium' | '💤 Low' = '📌 Medium',
  status: string = 'Planning'
): Promise<{ id: string; url: string }> {
  const page = await notionFetch('/pages', {
    parent: { database_id: PROJECTS_DB },
    properties: {
      'Project': {
        title: [{ text: { content: title } }],
      },
      'Description': {
        rich_text: [{ text: { content: description.slice(0, 2000) } }],
      },
      'Priority': {
        select: { name: priority },
      },
      'Status': {
        select: { name: status },
      },
      'Start Date': {
        date: { start: new Date().toISOString().split('T')[0] },
      },
    },
  });

  return { id: page.id, url: page.url };
}

export async function createTask(
  taskTitle: string,
  projectName: string,
  notes: string = '',
  priority: '🔥 Urgent' | '⚡ High' | '📌 Medium' | '💤 Low' = '📌 Medium',
  status: string = 'Draft'
): Promise<{ id: string; url: string }> {
  const page = await notionFetch('/pages', {
    parent: { database_id: TASKS_DB },
    properties: {
      'Task': {
        title: [{ text: { content: taskTitle } }],
      },
      'Project': {
        rich_text: [{ text: { content: projectName } }],
      },
      'Notes': {
        rich_text: [{ text: { content: notes.slice(0, 2000) } }],
      },
      'Priority': {
        select: { name: priority },
      },
      'Status': {
        select: { name: status },
      },
    },
  });

  return { id: page.id, url: page.url };
}
