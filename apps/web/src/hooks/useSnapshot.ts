import { useEffect, useState, useRef, useCallback } from 'react';
import type { MonitorSnapshot, RuntimeEvent } from '@crm/shared';

const POLL_INTERVAL = 15000; // 15s

export function useSnapshot() {
  const [snapshot, setSnapshot] = useState<MonitorSnapshot | null>(null);
  const [events, setEvents] = useState<RuntimeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const refetch = useCallback(async () => {
    try {
      const snapRes = await fetch('/api/snapshot');
      if (snapRes.ok && mountedRef.current) setSnapshot(await snapRes.json());
    } catch {}
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    async function load() {
      try {
        const [snapRes, eventsRes] = await Promise.all([
          fetch('/api/snapshot'),
          fetch('/api/events?limit=30'),
        ]);
        if (!mountedRef.current) return;
        if (snapRes.ok) setSnapshot(await snapRes.json());
        if (eventsRes.ok) setEvents(await eventsRes.json());
      } catch {} finally {
        if (mountedRef.current) setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, POLL_INTERVAL);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, []);

  return { snapshot, events, setSnapshot, setEvents, loading, refetch };
}
