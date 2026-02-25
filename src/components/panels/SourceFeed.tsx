'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ActivityLog, AGENT_CONFIG } from '@/types';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';

const TYPE_ICONS: Record<string, string> = {
  scrape: '🔍',
  read: '📰',
  analyze: '🧠',
  flag: '💡',
  idea: '⭐',
  build: '🔨',
  pr: '📬',
};

export function SourceFeed({ sessionId }: { sessionId?: string }) {
  const [activities, setActivities] = useState<ActivityLog[]>([]);

  useEffect(() => {
    let query = supabase
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (sessionId) {
      query = query.eq('session_id', sessionId);
    }

    query.then(({ data }) => {
      if (data) setActivities(data);
    });

    const channel = supabase
      .channel('activity_log_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activity_log' },
        (payload) => {
          const newActivity = payload.new as ActivityLog;
          if (sessionId && newActivity.session_id !== sessionId) return;
          setActivities((prev) => [newActivity, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-3 border-b border-border shrink-0">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          🔍 Source Feed
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Real-time agent activity
        </p>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="p-2 space-y-2">
          {activities.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No activity yet. Start a session to begin.
            </p>
          )}
          {activities.map((activity) => {
            const agent = AGENT_CONFIG[activity.agent];
            return (
              <div
                key={activity.id}
                className="p-3 rounded-lg bg-card border border-border hover:border-border/80 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm">{TYPE_ICONS[activity.type] || '📌'}</span>
                  <span
                    className="text-xs font-medium"
                    style={{ color: agent?.color }}
                  >
                    {agent?.name || activity.agent}
                  </span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {activity.type}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm font-medium">{activity.title}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {activity.content}
                </p>
                {activity.url && (
                  <a
                    href={activity.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:underline mt-1 block truncate"
                  >
                    {activity.url}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
