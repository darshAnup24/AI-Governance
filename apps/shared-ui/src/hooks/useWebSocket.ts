import { useEffect, useRef, useState, useCallback } from 'react';

interface UseWebSocketOptions {
  url: string;
  onMessage?: (data: any) => void;
  onError?: (err: Event) => void;
  reconnectInterval?: number;
  maxReconnects?: number;
}

export function useWebSocket({ url, onMessage, onError, reconnectInterval = 3000, maxReconnects = 10 }: UseWebSocketOptions) {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCount = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    if (reconnectCount.current >= maxReconnects) return;
    try {
      const token = localStorage.getItem('airlock_token');
      const ws = new WebSocket(`${url}?token=${token}`);
      ws.onopen = () => { setConnected(true); reconnectCount.current = 0; };
      ws.onclose = () => { setConnected(false); attemptReconnect(); };
      ws.onerror = (e) => { onError?.(e); };
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          setLastMessage(data);
          onMessage?.(data);
        } catch { /* ignore parse errors */ }
      };
      wsRef.current = ws;
    } catch { attemptReconnect(); }
  }, [url]);

  const attemptReconnect = useCallback(() => {
    reconnectCount.current++;
    if (reconnectCount.current < maxReconnects) {
      reconnectTimer.current = setTimeout(connect, reconnectInterval * reconnectCount.current);
    }
  }, [connect]);

  useEffect(() => { connect(); return () => { wsRef.current?.close(); clearTimeout(reconnectTimer.current); }; }, [connect]);

  const send = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { connected, lastMessage, send };
}
