'use client';

import { useEffect, useState, useRef } from 'react';
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

export function KanbanBoard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [width, setWidth] = useState(600); // Default width in pixels
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

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

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - rect.left;
      if (newWidth >= 400 && newWidth <= 1400) {
        setWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return (
    <div ref={containerRef} className="flex flex-col h-full relative" style={{ width: `${width}px` }}>
      <div className="p-3 border-b border-border">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          📋 Kanban
        </h2>
      </div>
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-3 p-3 min-w-max h-full">
          {COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.key);
            return (
              <div key={col.key} className="w-56 flex flex-col">
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
      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize bg-border hover:bg-blue-500 hover:w-1.5 transition-all"
        title="Drag to resize"
      />
    </div>
  );
}
