'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Message, AGENT_CONFIG } from '@/types';
import { formatDistanceToNow } from 'date-fns';

export function BrainstormChat({ sessionId }: { sessionId?: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      return;
    }

    supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) setMessages(data);
      });

    const channel = supabase
      .channel('messages_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-3 border-b border-border shrink-0">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          💬 Brainstorm
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          {sessionId ? `${messages.length} messages` : 'No active session'}
        </p>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
        <div className="p-3 space-y-4">
          {!sessionId && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Start a brainstorm session to see the agents discuss.
            </p>
          )}
          {messages.map((msg) => {
            const agent = AGENT_CONFIG[msg.agent];
            return (
              <div key={msg.id} className="flex gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0"
                  style={{ backgroundColor: agent?.color + '20', color: agent?.color }}
                >
                  {agent?.emoji || '🤖'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className="text-sm font-semibold"
                      style={{ color: agent?.color }}
                    >
                      {agent?.name || msg.agent}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">
                    {msg.content}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
