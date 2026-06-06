import { useEffect, useRef } from 'react';

interface TelemetryEvent {
  type: string;
  component: string;
  action: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export function useTelemetry(component: string) {
  const queue = useRef<TelemetryEvent[]>([]);

  const track = (action: string, metadata?: Record<string, unknown>) => {
    queue.current.push({
      type: 'ui_interaction',
      component,
      action,
      metadata,
      timestamp: Date.now(),
    });
  };

  useEffect(() => {
    const interval = setInterval(() => {
      if (queue.current.length > 0) {
        const events = queue.current.splice(0);
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/api/telemetry', JSON.stringify({ events }));
        }
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return { track };
}
