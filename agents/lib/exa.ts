import Exa from 'exa-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../../.env.agents') });

const exaKey = process.env.EXA_API_KEY!;
if (!exaKey) throw new Error('Missing EXA_API_KEY in .env.agents');

export const exa = new Exa(exaKey);

export interface ScrapedSource {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
  source_type: string;
}

export async function searchSources(
  query: string,
  options: {
    numResults?: number;
    type?: 'keyword' | 'neural' | 'auto';
    category?: string;
    startPublishedDate?: string;
    includeDomains?: string[];
  } = {}
): Promise<ScrapedSource[]> {
  const {
    numResults = 10,
    type = 'auto',
    startPublishedDate,
    includeDomains,
  } = options;

  const searchParams: any = {
    numResults,
    type,
    text: true,
    summary: true,
  };

  if (startPublishedDate) searchParams.startPublishedDate = startPublishedDate;
  if (includeDomains) searchParams.includeDomains = includeDomains;
  if (options.category) searchParams.category = options.category;

  const results = await exa.searchAndContents(query, searchParams);

  return results.results.map((r: any) => ({
    title: r.title || 'Untitled',
    url: r.url,
    snippet: r.summary || r.text?.slice(0, 500) || '',
    publishedDate: r.publishedDate,
    source_type: detectSourceType(r.url),
  }));
}

function detectSourceType(url: string): string {
  if (url.includes('twitter.com') || url.includes('x.com')) return 'tweet';
  if (url.includes('news.ycombinator.com')) return 'hn';
  if (url.includes('producthunt.com')) return 'ph';
  if (url.includes('reddit.com')) return 'reddit';
  if (url.includes('indiehackers.com')) return 'indiehackers';
  if (url.includes('github.com')) return 'github';
  return 'blog';
}
