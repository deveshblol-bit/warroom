'use client';

import { AGENT_CONFIG, Session } from '@/types';
import { formatDistanceToNow } from 'date-fns';

interface HeaderProps {
  sessions?: Session[];
  activeSession?: Session | null;
  onSessionSelect?: (session: Session) => void;
}

const STATUS_DOT: Record<string, string> = {
  discovering: 'bg-yellow-400',
  brainstorming: 'bg-blue-400',
  completed: 'bg-green-400',
};

export function Header({ sessions = [], activeSession, onSessionSelect }: HeaderProps) {
  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">⚔️ War Room</h1>
          {/* Session picker */}
          {sessions.length > 0 && (
            <select
              className="bg-muted text-foreground text-xs rounded px-2 py-1 border border-border focus:outline-none focus:ring-1 focus:ring-ring"
              value={activeSession?.id || ''}
              onChange={(e) => {
                const session = sessions.find((s) => s.id === e.target.value);
                if (session && onSessionSelect) onSessionSelect(session);
              }}
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.topic || 'Session'} — {s.status} ({formatDistanceToNow(new Date(s.started_at), { addSuffix: true })})
                </option>
              ))}
            </select>
          )}
          {activeSession && (
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${STATUS_DOT[activeSession.status] || 'bg-gray-400'} ${activeSession.status !== 'completed' ? 'animate-pulse' : ''}`} />
              <span className="text-xs text-muted-foreground capitalize">{activeSession.status}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {Object.entries(AGENT_CONFIG).map(([key, agent]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ backgroundColor: agent.color }}
              />
              <span className="text-xs" style={{ color: agent.color }}>
                {agent.emoji} {agent.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </header>
  );
}
