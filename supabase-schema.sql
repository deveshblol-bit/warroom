-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- Sessions
create table if not exists sessions (
  id uuid primary key default uuid_generate_v4(),
  trigger text not null default 'manual',
  topic text,
  status text not null default 'discovering',
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

-- Activity log
create table if not exists activity_log (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references sessions(id),
  agent text not null,
  type text not null,
  title text not null,
  content text not null default '',
  url text,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

-- Messages (brainstorm conversations)
create table if not exists messages (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references sessions(id),
  agent text not null,
  content text not null,
  reply_to uuid references messages(id),
  created_at timestamptz not null default now()
);

-- Ideas
create table if not exists ideas (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references sessions(id),
  title text not null,
  description text not null default '',
  nikita_take text,
  paras_take text,
  karpathy_take text,
  score int not null default 0,
  status text not null default 'draft',
  notion_page_id text,
  created_at timestamptz not null default now()
);

-- Tasks
create table if not exists tasks (
  id uuid primary key default uuid_generate_v4(),
  idea_id uuid references ideas(id),
  title text not null,
  description text not null default '',
  assigned_to text not null default 'karpathy',
  status text not null default 'backlog',
  pr_url text,
  notion_task_id text,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_activity_log_session on activity_log(session_id);
create index if not exists idx_activity_log_created on activity_log(created_at desc);
create index if not exists idx_messages_session on messages(session_id);
create index if not exists idx_messages_created on messages(created_at);
create index if not exists idx_ideas_status on ideas(status);
create index if not exists idx_tasks_status on tasks(status);

-- Enable Realtime on all tables
alter publication supabase_realtime add table sessions;
alter publication supabase_realtime add table activity_log;
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table ideas;
alter publication supabase_realtime add table tasks;

-- RLS policies (permissive for now — service role handles writes)
alter table sessions enable row level security;
alter table activity_log enable row level security;
alter table messages enable row level security;
alter table ideas enable row level security;
alter table tasks enable row level security;

-- Allow anon read access for dashboard
create policy "Allow anon read sessions" on sessions for select using (true);
create policy "Allow anon read activity_log" on activity_log for select using (true);
create policy "Allow anon read messages" on messages for select using (true);
create policy "Allow anon read ideas" on ideas for select using (true);
create policy "Allow anon read tasks" on tasks for select using (true);

-- Allow service role full access (default)
