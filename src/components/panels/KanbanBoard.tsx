'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Task, TaskStatus, AGENT_CONFIG } from '@/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';

const COLUMNS: { key: TaskStatus; label: string; icon: string }[] = [
  { key: 'backlog', label: 'Backlog', icon: '📋' },
  { key: 'building', label: 'Building', icon: '🔨' },
  { key: 'review', label: 'Review', icon: '🧪' },
  { key: 'done', label: 'Done', icon: '✅' },
];

interface KanbanBoardProps {
  fullScreen?: boolean;
}

export function KanbanBoard({ fullScreen = false }: KanbanBoardProps) {
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setTasks(data);
      });

    const channel = supabase
      .channel('tasks_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setTasks((prev) => [payload.new as Task, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setTasks((prev) =>
              prev.map((t) => (t.id === (payload.new as Task).id ? (payload.new as Task) : t))
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="flex flex-col h-full">
      {!fullScreen && (
        <div className="p-3 border-b border-border">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            📋 Kanban
          </h2>
        </div>
      )}
      <div className="flex-1 overflow-x-auto">
        <div className={`flex gap-${fullScreen ? '6' : '3'} p-${fullScreen ? '4' : '3'} min-w-max h-full`}>
          {COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.key);
            return (
              <div key={col.key} className={fullScreen ? 'flex-1 min-w-80 flex flex-col' : 'w-56 flex flex-col'}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm">{col.icon}</span>
                  <span className="text-xs font-semibold text-muted-foreground uppercase">
                    {col.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-1.5">
                    {colTasks.length}
                  </span>
                </div>
                <ScrollArea className="flex-1">
                  <div className="space-y-2">
                    {colTasks.map((task) => {
                      const agent = AGENT_CONFIG[task.assigned_to];
                      return (
                        <Card key={task.id} className="bg-card border-border">
                          <CardContent className="p-3">
                            <p className="text-sm font-medium">{task.title}</p>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {task.description}
                            </p>
                            <div className="flex items-center justify-between mt-2">
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded"
                                style={{ backgroundColor: agent?.color + '20', color: agent?.color }}
                              >
                                {agent?.emoji} {agent?.name || task.assigned_to}
                              </span>
                              {task.pr_url && (
                                <a
                                  href={task.pr_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] text-blue-400 hover:underline"
                                >
                                  PR →
                                </a>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
