'use client';

import { KanbanBoard } from '@/components/panels/KanbanBoard';
import Link from 'next/link';

export default function KanbanPage() {
  return (
    <div className="h-screen flex flex-col bg-background text-foreground dark">
      {/* Header */}
      <div className="h-14 border-b border-border flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-lg font-bold hover:text-muted-foreground transition-colors">
            ⚔️ War Room
          </Link>
          <span className="text-sm text-muted-foreground">/ Kanban</span>
        </div>
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back to Dashboard
        </Link>
      </div>

      {/* Full-screen Kanban */}
      <div className="flex-1 min-h-0 p-4">
        <KanbanBoard fullScreen />
      </div>
    </div>
  );
}
