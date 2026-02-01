// @ts-nocheck
'use client';

import { createContext, useContext, useState, useCallback } from 'react';

// ===========================================
// TYPES
// ===========================================

export type TimeMode = 'prep' | 'rush' | 'closing';

export interface LastToolCall {
  name: string;
  result: string;
}

interface SimulationContextValue {
  timeMode: TimeMode;
  setTimeMode: (mode: TimeMode) => void;
  lastToolCall: LastToolCall | null;
  setLastToolCall: (call: LastToolCall | null) => void;
}

// ===========================================
// CONTEXT
// ===========================================

const SimulationContext = createContext<SimulationContextValue | null>(null);

// ===========================================
// PROVIDER
// ===========================================

export function SimulationProvider({ children }: { children: React.ReactNode }) {
  const [timeMode, setTimeMode] = useState<TimeMode>('prep');
  const [lastToolCall, setLastToolCall] = useState<LastToolCall | null>(null);

  return (
    <SimulationContext.Provider
      value={{ timeMode, setTimeMode, lastToolCall, setLastToolCall }}
    >
      {children}
    </SimulationContext.Provider>
  );
}

// ===========================================
// HOOK
// ===========================================

export function useSimulation(): SimulationContextValue {
  const ctx = useContext(SimulationContext);
  if (!ctx) {
    throw new Error('useSimulation must be used within a SimulationProvider');
  }
  return ctx;
}
