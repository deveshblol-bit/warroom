// Discovery queries for each agent persona
// Each agent has different interests and sources

export interface DiscoveryQuery {
  query: string;
  agent: 'nikita' | 'paras';
  category?: string;
  domains?: string[];
  label: string;
}

// Get a date string for "last N days"
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

export const FRESHNESS = daysAgo(3); // Last 3 days for freshness

// Nikita Bier — Growth, virality, consumer apps, distribution
export const NIKITA_QUERIES: DiscoveryQuery[] = [
  {
    query: 'viral consumer app launch growth hack 2026',
    agent: 'nikita',
    label: 'Viral consumer apps',
    domains: ['x.com', 'twitter.com', 'producthunt.com', 'techcrunch.com'],
  },
  {
    query: 'new social app trending retention users',
    agent: 'nikita',
    label: 'Trending social apps',
    category: 'tweet',
  },
  {
    query: 'product launch strategy distribution channel organic growth',
    agent: 'nikita',
    label: 'Distribution strategies',
  },
  {
    query: 'consumer startup idea unique hook viral loop',
    agent: 'nikita',
    label: 'Startup ideas with hooks',
    domains: ['x.com', 'twitter.com', 'indiehackers.com', 'reddit.com'],
  },
  {
    query: 'gen z app trend what teens are using',
    agent: 'nikita',
    label: 'Gen Z trends',
  },
  {
    query: 'mobile app retention metrics D1 D7 D30 best practices',
    agent: 'nikita',
    label: 'Retention benchmarks',
  },
  {
    query: 'referral program invite system that actually works growth',
    agent: 'nikita',
    label: 'Referral mechanics',
  },
];

// Paras Chopra — Experimentation, SaaS, data, market gaps, frameworks
export const PARAS_QUERIES: DiscoveryQuery[] = [
  {
    query: 'SaaS product market gap opportunity 2026 underserved',
    agent: 'paras',
    label: 'SaaS market gaps',
    domains: ['news.ycombinator.com', 'indiehackers.com', 'reddit.com'],
  },
  {
    query: 'A/B testing experiment driven product development results',
    agent: 'paras',
    label: 'Experimentation insights',
  },
  {
    query: 'indie hacker building in public revenue MRR bootstrapped',
    agent: 'paras',
    label: 'Indie hacker builds',
    domains: ['indiehackers.com', 'x.com', 'twitter.com'],
  },
  {
    query: 'AI product startup idea practical application real users',
    agent: 'paras',
    label: 'AI product ideas',
    category: 'tweet',
  },
  {
    query: 'product led growth PLG onboarding conversion funnel optimization',
    agent: 'paras',
    label: 'PLG strategies',
  },
  {
    query: 'micro SaaS solo founder profitable niche market',
    agent: 'paras',
    label: 'Micro SaaS opportunities',
    domains: ['news.ycombinator.com', 'x.com', 'twitter.com', 'reddit.com'],
  },
  {
    query: 'pricing strategy freemium vs paid conversion rate SaaS',
    agent: 'paras',
    label: 'Pricing strategies',
  },
];

// Pick N random queries from a list (to keep each run varied)
export function pickRandomQueries(queries: DiscoveryQuery[], n: number): DiscoveryQuery[] {
  const shuffled = [...queries].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}
