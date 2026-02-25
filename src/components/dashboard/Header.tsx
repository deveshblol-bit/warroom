'use client';

import { AGENT_CONFIG } from '@/types';

export function Header() {
  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">⚔️ War Room</h1>
          <span className="text-xs text-muted-foreground">
            Multi-Agent Product Discovery
          </span>
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
