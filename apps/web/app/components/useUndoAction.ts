'use client';

import { useEffect, useRef, useState } from "react";

export type PendingUndoAction = {
  id: string;
  label: string;
  executeAt: number;
};

export function useUndoAction() {
  const [pending, setPending] = useState<PendingUndoAction[]>([]);
  const timersRef = useRef<Record<string, number>>({});

  function scheduleAction(input: {
    label: string;
    delayMs?: number;
    run: () => Promise<void> | void;
  }) {
    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const delayMs = input.delayMs ?? 10_000;
    const executeAt = Date.now() + delayMs;

    setPending((prev) => [...prev, { id, label: input.label, executeAt }]);
    timersRef.current[id] = window.setTimeout(async () => {
      try {
        await input.run();
      } finally {
        delete timersRef.current[id];
        setPending((prev) => prev.filter((x) => x.id !== id));
      }
    }, delayMs);

    return id;
  }

  function undoAction(id: string) {
    const timer = timersRef.current[id];
    if (timer) {
      window.clearTimeout(timer);
      delete timersRef.current[id];
    }
    setPending((prev) => prev.filter((x) => x.id !== id));
  }

  function clearAll() {
    Object.values(timersRef.current).forEach((timer) => window.clearTimeout(timer));
    timersRef.current = {};
    setPending([]);
  }

  useEffect(() => {
    return () => {
      clearAll();
    };
  }, []);

  return { pending, scheduleAction, undoAction, clearAll };
}

