'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Session } from '@/types';
import { Header } from '@/components/dashboard/Header';
import { SourceFeed } from '@/components/panels/SourceFeed';
import { BrainstormChat } from '@/components/panels/BrainstormChat';
import { IdeaBoard } from '@/components/panels/IdeaBoard';
import { KanbanBoard } from '@/components/panels/KanbanBoard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function Home() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);

  useEffect(() => {
    // Fetch all sessions (most recent first)
    supabase
      .from('sessions')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setSessions(data);
          // Pick the first non-completed session, or the latest one
          const active = data.find((s) => s.status !== 'completed') || data[0];
          setActiveSession(active);
        }
      });

    // Listen for new/updated sessions
    const channel = supabase
      .channel('sessions_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions' },
        (payload) => {
          const updated = payload.new as Session;
          setSessions((prev) => {
            const existing = prev.findIndex((s) => s.id === updated.id);
            if (existing >= 0) {
              const next = [...prev];
              next[existing] = updated;
              return next;
            }
            return [updated, ...prev];
          });
          // Auto-switch to new sessions
          if (payload.eventType === 'INSERT') {
            setActiveSession(updated);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="h-screen flex flex-col bg-background text-foreground dark">
      <Header
        sessions={sessions}
        activeSession={activeSession}
        onSessionSelect={setActiveSession}
      />

      {/* Desktop: 3-column layout */}
      <div className="flex-1 hidden lg:flex min-h-0">
        {/* Left: Source Feed */}
        <div className="w-80 border-r border-border flex flex-col min-h-0">
          <SourceFeed sessionId={activeSession?.id} />
        </div>

        {/* Center: Brainstorm + Kanban */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 flex flex-col min-h-0">
            <BrainstormChat sessionId={activeSession?.id} />
          </div>
          <div className="h-64 border-t border-border shrink-0 overflow-hidden">
            <KanbanBoard />
          </div>
        </div>

        {/* Right: Ideas */}
        <div className="w-80 border-l border-border flex flex-col min-h-0">
          <IdeaBoard />
        </div>
      </div>

      {/* Mobile: Tabs */}
      <div className="flex-1 lg:hidden flex flex-col min-h-0">
        <Tabs defaultValue="chat" className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-2 mt-2 shrink-0">
            <TabsTrigger value="feed">🔍 Feed</TabsTrigger>
            <TabsTrigger value="chat">💬 Chat</TabsTrigger>
            <TabsTrigger value="ideas">⭐ Ideas</TabsTrigger>
            <TabsTrigger value="kanban">📋 Tasks</TabsTrigger>
          </TabsList>
          <TabsContent value="feed" className="flex-1 flex flex-col min-h-0 mt-0 data-[state=inactive]:hidden">
            <SourceFeed sessionId={activeSession?.id} />
          </TabsContent>
          <TabsContent value="chat" className="flex-1 flex flex-col min-h-0 mt-0 data-[state=inactive]:hidden">
            <BrainstormChat sessionId={activeSession?.id} />
          </TabsContent>
          <TabsContent value="ideas" className="flex-1 flex flex-col min-h-0 mt-0 data-[state=inactive]:hidden">
            <IdeaBoard />
          </TabsContent>
          <TabsContent value="kanban" className="flex-1 flex flex-col min-h-0 mt-0 data-[state=inactive]:hidden">
            <KanbanBoard />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
