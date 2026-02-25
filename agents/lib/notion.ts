import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../../.env.agents') });

const NOTION_TOKEN = process.env.NOTION_TOKEN!;
const NOTION_VERSION = '2022-06-28';
const NOTION_ENDPOINT = 'https://api.notion.com/v1';

const PROJECTS_DB = '3109499b-96e4-81be-8a24-ffc424d9f8ed';
const TASKS_DB = '3109499b-96e4-8128-8598-f6af1db6e830';

if (!NOTION_TOKEN) throw new Error('Missing NOTION_TOKEN in .env.agents');

async function notionFetch(path: string, method: string = 'GET', body?: any) {
  const res = await fetch(`${NOTION_ENDPOINT}${path}`, {
    method: body ? (method === 'GET' ? 'POST' : method) : method,
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

// --- Projects ---

export async function createProject(
  title: string,
  description: string,
  priority: '🔥 High' | '📌 Medium' | '💤 Low' = '📌 Medium',
  status: string = 'Planning'
): Promise<{ id: string; url: string }> {
  const page = await notionFetch('/pages', 'POST', {
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

// --- Tasks ---

export async function createTask(
  taskTitle: string,
  projectName: string,
  notes: string = '',
  priority: '🔥 Urgent' | '⚡ High' | '📌 Medium' | '💤 Low' = '📌 Medium',
  status: string = 'Draft'
): Promise<{ id: string; url: string }> {
  const page = await notionFetch('/pages', 'POST', {
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

// --- Page Content (PRDs, docs) ---

/**
 * Convert markdown-ish PRD text into Notion blocks.
 * Handles: headings (##), bullet points (-), paragraphs.
 */
function markdownToBlocks(markdown: string): any[] {
  const lines = markdown.split('\n');
  const blocks: any[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('## ')) {
      blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ type: 'text', text: { content: trimmed.replace('## ', '') } }],
        },
      });
    } else if (trimmed.startsWith('### ')) {
      blocks.push({
        object: 'block',
        type: 'heading_3',
        heading_3: {
          rich_text: [{ type: 'text', text: { content: trimmed.replace('### ', '') } }],
        },
      });
    } else if (trimmed.startsWith('# ')) {
      blocks.push({
        object: 'block',
        type: 'heading_1',
        heading_1: {
          rich_text: [{ type: 'text', text: { content: trimmed.replace('# ', '') } }],
        },
      });
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{ type: 'text', text: { content: trimmed.replace(/^[-*] /, '') } }],
        },
      });
    } else if (/^\d+\.\s/.test(trimmed)) {
      blocks.push({
        object: 'block',
        type: 'numbered_list_item',
        numbered_list_item: {
          rich_text: [{ type: 'text', text: { content: trimmed.replace(/^\d+\.\s/, '') } }],
        },
      });
    } else {
      // Bold handling: **text** → bold annotation
      const parts = parseInlineFormatting(trimmed);
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: parts },
      });
    }
  }

  return blocks;
}

function parseInlineFormatting(text: string): any[] {
  const parts: any[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', text: { content: text.slice(lastIndex, match.index) } });
    }
    parts.push({
      type: 'text',
      text: { content: match[1] },
      annotations: { bold: true },
    });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', text: { content: text.slice(lastIndex) } });
  }

  if (parts.length === 0) {
    parts.push({ type: 'text', text: { content: text } });
  }

  return parts;
}

/**
 * Write a PRD (markdown text) as content blocks on a Notion page.
 * Appends blocks to the page — the PRD becomes the page body.
 */
export async function writePRDToPage(pageId: string, prdMarkdown: string): Promise<void> {
  const blocks = markdownToBlocks(prdMarkdown);

  // Notion API limits to 100 blocks per request
  const chunks = [];
  for (let i = 0; i < blocks.length; i += 100) {
    chunks.push(blocks.slice(i, i + 100));
  }

  for (const chunk of chunks) {
    await notionFetch(`/blocks/${pageId}/children`, 'PATCH', {
      children: chunk,
    });
  }
}

/**
 * Read all content blocks from a Notion page and convert to plain text.
 * Used by Karpathy to read the PRD before breaking into tasks.
 */
export async function readPageContent(pageId: string): Promise<string> {
  let allBlocks: any[] = [];
  let cursor: string | undefined;

  do {
    const url = `/blocks/${pageId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`;
    const data = await notionFetch(url);
    allBlocks = allBlocks.concat(data.results || []);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  return blocksToText(allBlocks);
}

function blocksToText(blocks: any[]): string {
  const lines: string[] = [];

  for (const block of blocks) {
    const type = block.type;
    const richText = block[type]?.rich_text;

    if (!richText) continue;

    const text = richText.map((t: any) => t.plain_text || '').join('');

    switch (type) {
      case 'heading_1':
        lines.push(`# ${text}`);
        break;
      case 'heading_2':
        lines.push(`## ${text}`);
        break;
      case 'heading_3':
        lines.push(`### ${text}`);
        break;
      case 'bulleted_list_item':
        lines.push(`- ${text}`);
        break;
      case 'numbered_list_item':
        lines.push(`${text}`);
        break;
      case 'paragraph':
        lines.push(text);
        break;
      case 'divider':
        lines.push('---');
        break;
      default:
        if (text) lines.push(text);
    }
  }

  return lines.join('\n');
}

/**
 * Get a project page by title from the Projects DB.
 */
export async function findProject(title: string): Promise<{ id: string; url: string } | null> {
  const data = await notionFetch(`/databases/${PROJECTS_DB}/query`, 'POST', {
    filter: {
      property: 'Project',
      title: { equals: title },
    },
  });

  if (data.results?.length > 0) {
    return { id: data.results[0].id, url: data.results[0].url };
  }
  return null;
}

/**
 * Get all tasks for a project from the Tasks DB.
 */
export async function getProjectTasks(projectName: string): Promise<any[]> {
  const data = await notionFetch(`/databases/${TASKS_DB}/query`, 'POST', {
    filter: {
      property: 'Project',
      rich_text: { equals: projectName },
    },
  });
  return data.results || [];
}
