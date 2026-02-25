export type Agent = 'nikita' | 'paras' | 'karpathy';

export type ActivityType = 'scrape' | 'read' | 'analyze' | 'flag' | 'idea' | 'build' | 'pr';

export type SessionStatus = 'discovering' | 'brainstorming' | 'completed';

export type IdeaStatus = 'draft' | 'approved' | 'building' | 'shipped';

export type TaskStatus = 'backlog' | 'building' | 'review' | 'done';

export interface ActivityLog {
  id: string;
  session_id: string | null;
  agent: Agent;
  type: ActivityType;
  title: string;
  content: string;
  url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Message {
  id: string;
  session_id: string;
  agent: Agent;
  content: string;
  reply_to: string | null;
  created_at: string;
}

export interface Session {
  id: string;
  trigger: 'scheduled' | 'manual';
  topic: string | null;
  status: SessionStatus;
  started_at: string;
  ended_at: string | null;
}

export interface Idea {
  id: string;
  session_id: string | null;
  title: string;
  description: string;
  nikita_take: string | null;
  paras_take: string | null;
  karpathy_take: string | null;
  score: number;
  status: IdeaStatus;
  notion_page_id: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  idea_id: string | null;
  title: string;
  description: string;
  assigned_to: Agent;
  status: TaskStatus;
  pr_url: string | null;
  notion_task_id: string | null;
  created_at: string;
}

export const AGENT_CONFIG: Record<Agent, { name: string; role: string; color: string; emoji: string }> = {
  nikita: {
    name: 'Nikita Bier',
    role: 'PM — Growth & Distribution',
    color: '#f472b6',
    emoji: '🚀',
  },
  paras: {
    name: 'Paras Chopra',
    role: 'PM — Strategy & Experimentation',
    color: '#a78bfa',
    emoji: '🧪',
  },
  karpathy: {
    name: 'Karpathy',
    role: 'Engineer',
    color: '#34d399',
    emoji: '⚡',
  },
};
