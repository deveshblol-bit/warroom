/**
 * Discovery Script — Nikita & Paras scan the internet for ideas
 * 
 * Usage: npx tsx agents/scripts/discover.ts [--queries 3]
 * 
 * What it does:
 * 1. Creates a session in Supabase
 * 2. Each PM agent picks random search queries from their persona
 * 3. Searches via Exa API
 * 4. Logs every action to activity_log (visible on dashboard in real-time)
 * 5. Returns all discovered sources for the brainstorm phase
 */

import { searchSources, ScrapedSource } from '../lib/exa';
import { logActivity, createSession, updateSession } from '../lib/logger';
import {
  NIKITA_QUERIES,
  PARAS_QUERIES,
  FRESHNESS,
  pickRandomQueries,
} from '../lib/discovery';

const QUERIES_PER_AGENT = parseInt(process.argv.find(a => a.startsWith('--queries='))?.split('=')[1] || '3');

async function discoverForAgent(
  agent: 'nikita' | 'paras',
  queries: typeof NIKITA_QUERIES,
  sessionId: string
): Promise<ScrapedSource[]> {
  const selected = pickRandomQueries(queries, QUERIES_PER_AGENT);
  const allSources: ScrapedSource[] = [];

  for (const q of selected) {
    // Log: starting search
    await logActivity(agent, 'scrape', `🔍 Searching: ${q.label}`, `Query: "${q.query}"`, {
      sessionId,
      metadata: { query: q.query, label: q.label },
    });

    console.log(`[${agent}] Searching: ${q.label}`);

    try {
      const sources = await searchSources(q.query, {
        numResults: 5,
        startPublishedDate: FRESHNESS,
        includeDomains: q.domains,
        category: q.category,
      });

      for (const source of sources) {
        // Log: found a source
        await logActivity(agent, 'read', `📰 ${source.title}`, source.snippet.slice(0, 300), {
          sessionId,
          url: source.url,
          metadata: {
            source_type: source.source_type,
            published: source.publishedDate,
          },
        });

        console.log(`  [${agent}] Found: ${source.title} (${source.source_type})`);
      }

      allSources.push(...sources);
    } catch (err: any) {
      console.error(`  [${agent}] Search failed for "${q.label}":`, err.message);
      await logActivity(agent, 'scrape', `⚠️ Search failed: ${q.label}`, err.message, {
        sessionId,
      });
    }

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 500));
  }

  // Log: summary
  await logActivity(
    agent,
    'analyze',
    `✅ Discovery complete`,
    `Found ${allSources.length} sources across ${selected.length} searches`,
    { sessionId, metadata: { total: allSources.length } }
  );

  return allSources;
}

async function main() {
  console.log('🚀 Starting discovery session...\n');

  // Create session
  const session = await createSession('Discovery run', 'scheduled');
  console.log(`Session: ${session.id}\n`);

  // Run both agents in parallel
  const [nikitaSources, parasSources] = await Promise.all([
    discoverForAgent('nikita', NIKITA_QUERIES, session.id),
    discoverForAgent('paras', PARAS_QUERIES, session.id),
  ]);

  const totalSources = nikitaSources.length + parasSources.length;

  console.log(`\n✅ Discovery complete!`);
  console.log(`   Nikita found: ${nikitaSources.length} sources`);
  console.log(`   Paras found: ${parasSources.length} sources`);
  console.log(`   Total: ${totalSources} sources`);
  console.log(`   Session: ${session.id}`);

  // Update session status
  await updateSession(session.id, { status: 'brainstorming' });

  // Output session ID for the brainstorm script to pick up
  console.log(`\n📋 Next step: npx tsx agents/scripts/brainstorm.ts --session=${session.id}`);
}

main().catch(console.error);
