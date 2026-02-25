import { supabase } from './supabase';

type Agent = 'nikita' | 'paras' | 'karpathy';
type ActivityType = 'scrape' | 'read' | 'analyze' | 'flag' | 'idea' | 'build' | 'pr';

export async function logActivity(
  agent: Agent,
  type: ActivityType,
  title: string,
  content: string,
  options: {
    sessionId?: string;
    url?: string;
    metadata?: Record<string, unknown>;
  } = {}
) {
  const { data, error } = await supabase
    .from('activity_log')
    .insert({
      agent,
      type,
      title,
      content,
      session_id: options.sessionId || null,
      url: options.url || null,
      metadata: options.metadata || {},
    })
    .select()
    .single();

  if (error) console.error('Failed to log activity:', error.message);
  return data;
}

export async function logMessage(
  sessionId: string,
  agent: Agent,
  content: string,
  replyTo?: string
) {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      session_id: sessionId,
      agent,
      content,
      reply_to: replyTo || null,
    })
    .select()
    .single();

  if (error) console.error('Failed to log message:', error.message);
  return data;
}

export async function createSession(topic: string, trigger: string = 'manual') {
  const { data, error } = await supabase
    .from('sessions')
    .insert({ topic, trigger, status: 'discovering' })
    .select()
    .single();

  if (error) throw new Error(`Failed to create session: ${error.message}`);
  return data;
}

export async function updateSession(sessionId: string, updates: Record<string, unknown>) {
  const { error } = await supabase
    .from('sessions')
    .update(updates)
    .eq('id', sessionId);

  if (error) console.error('Failed to update session:', error.message);
}
