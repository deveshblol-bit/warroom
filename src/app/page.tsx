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
  const [activeSession, setActiveSession] = useState<Session | null>(null);

  useEffect(() => {
    // Fetch latest active session
    supabase
      .from('sessions')
      .select('*')
      .neq('status', 'completed')
      .order('started_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) setActiveSession(data[0]);
      });

    // Listen for new sessions
    const channel = supabase
      .channel('sessions_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setActiveSession(payload.new as Session);
          } else if (payload.eventType === 'UPDATE') {
            setActiveSession(payload.new as Session);
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
      <Header />

      {/* Desktop: 3-column layout */}
      <div className="flex-1 hidden lg:flex overflow-hidden">
        {/* Left: Source Feed */}
        <div className="w-80 border-r border-border overflow-hidden">
          <SourceFeed />
        </div>

        {/* Center: Brainstorm + Kanban */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <BrainstormChat sessionId={activeSession?.id} />
          </div>
          <div className="h-64 border-t border-border overflow-hidden">
            <KanbanBoard />
          </div>
        </div>

        {/* Right: Ideas */}
        <div className="w-80 border-l border-border overflow-hidden">
          <IdeaBoard />
        </div>
      </div>

      {/* Mobile: Tabs */}
      <div className="flex-1 lg:hidden overflow-hidden">
        <Tabs defaultValue="feed" className="h-full flex flex-col">
          <TabsList className="mx-2 mt-2">
            <TabsTrigger value="feed">🔍 Feed</TabsTrigger>
            <TabsTrigger value="chat">💬 Chat</TabsTrigger>
            <TabsTrigger value="ideas">⭐ Ideas</TabsTrigger>
            <TabsTrigger value="kanban">📋 Tasks</TabsTrigger>
          </TabsList>
          <TabsContent value="feed" className="flex-1 overflow-hidden">
            <SourceFeed />
          </TabsContent>
          <TabsContent value="chat" className="flex-1 overflow-hidden">
            <BrainstormChat sessionId={activeSession?.id} />
          </TabsContent>
          <TabsContent value="ideas" className="flex-1 overflow-hidden">
            <IdeaBoard />
          </TabsContent>
          <TabsContent value="kanban" className="flex-1 overflow-hidden">
            <KanbanBoard />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
