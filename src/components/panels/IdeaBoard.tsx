'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Idea, AGENT_CONFIG } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-yellow-500/20 text-yellow-400' },
  approved: { label: 'Approved', color: 'bg-green-500/20 text-green-400' },
  building: { label: 'Building', color: 'bg-blue-500/20 text-blue-400' },
  shipped: { label: 'Shipped', color: 'bg-purple-500/20 text-purple-400' },
};

function AgentTake({ agent, take }: { agent: 'nikita' | 'paras' | 'karpathy'; take: string }) {
  const config = AGENT_CONFIG[agent];
  return (
    <div className="p-3 rounded-lg border border-border">
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-xs"
          style={{ backgroundColor: config.color + '20', color: config.color }}
        >
          {config.emoji}
        </div>
        <span className="text-sm font-semibold" style={{ color: config.color }}>
          {config.name}
        </span>
        <span className="text-xs text-muted-foreground">{config.role}</span>
      </div>
      <p className="text-sm text-muted-foreground">{take}</p>
    </div>
  );
}

export function IdeaBoard() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);

  useEffect(() => {
    supabase
      .from('ideas')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data) setIdeas(data);
      });

    const channel = supabase
      .channel('ideas_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ideas' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setIdeas((prev) => [payload.new as Idea, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Idea;
            setIdeas((prev) =>
              prev.map((i) => (i.id === updated.id ? updated : i))
            );
            if (selectedIdea?.id === updated.id) setSelectedIdea(updated);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedIdea?.id]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-3 border-b border-border shrink-0">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          ⭐ Ideas
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          {ideas.length} idea{ideas.length !== 1 ? 's' : ''}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="p-2 space-y-2">
          {ideas.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No ideas yet. Agents will surface ideas during brainstorms.
            </p>
          )}
          {ideas.map((idea) => {
            const status = STATUS_CONFIG[idea.status] || STATUS_CONFIG.draft;
            return (
              <Card
                key={idea.id}
                className="bg-card border-border cursor-pointer hover:border-muted-foreground/30 transition-colors"
                onClick={() => setSelectedIdea(idea)}
              >
                <CardHeader className="p-3 pb-1">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm font-medium leading-tight">
                      {idea.title}
                    </CardTitle>
                    <Badge className={`${status.color} text-[10px] shrink-0`}>
                      {status.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-3 pt-1">
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {idea.description}
                  </p>
                  {idea.score > 0 && (
                    <div className="flex items-center gap-1 mt-2">
                      <span className="text-xs text-muted-foreground">Score:</span>
                      <div className="flex gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span
                            key={i}
                            className={`text-xs ${i < idea.score ? 'text-yellow-400' : 'text-muted-foreground/30'}`}
                          >
                            ★
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2 mt-2">
                    {idea.nikita_take && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: AGENT_CONFIG.nikita.color + '20', color: AGENT_CONFIG.nikita.color }}>
                        Nikita
                      </span>
                    )}
                    {idea.paras_take && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: AGENT_CONFIG.paras.color + '20', color: AGENT_CONFIG.paras.color }}>
                        Paras
                      </span>
                    )}
                    {idea.karpathy_take && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: AGENT_CONFIG.karpathy.color + '20', color: AGENT_CONFIG.karpathy.color }}>
                        Karpathy
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Idea Detail Modal */}
      <Dialog open={!!selectedIdea} onOpenChange={(open) => !open && setSelectedIdea(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto bg-card border-border">
          {selectedIdea && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-3">
                  <DialogTitle className="text-lg font-bold">{selectedIdea.title}</DialogTitle>
                  <Badge className={`${(STATUS_CONFIG[selectedIdea.status] || STATUS_CONFIG.draft).color} text-xs shrink-0`}>
                    {(STATUS_CONFIG[selectedIdea.status] || STATUS_CONFIG.draft).label}
                  </Badge>
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-sm text-muted-foreground">Score:</span>
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span
                        key={i}
                        className={`text-sm ${i < selectedIdea.score ? 'text-yellow-400' : 'text-muted-foreground/30'}`}
                      >
                        ★
                      </span>
                    ))}
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-1">Description</h3>
                  <p className="text-sm text-foreground">{selectedIdea.description}</p>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground">Agent Takes</h3>
                  {selectedIdea.nikita_take && (
                    <AgentTake agent="nikita" take={selectedIdea.nikita_take} />
                  )}
                  {selectedIdea.paras_take && (
                    <AgentTake agent="paras" take={selectedIdea.paras_take} />
                  )}
                  {selectedIdea.karpathy_take && (
                    <AgentTake agent="karpathy" take={selectedIdea.karpathy_take} />
                  )}
                  {!selectedIdea.nikita_take && !selectedIdea.paras_take && !selectedIdea.karpathy_take && (
                    <p className="text-sm text-muted-foreground">No agent takes recorded.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
