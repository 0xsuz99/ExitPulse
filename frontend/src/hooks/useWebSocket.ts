import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { WS_BASE } from '../config/api';

interface WsEvent {
  type: 'signal' | 'signal_removed' | 'exit_executed' | 'exit_failed' | 'holdings_update' | 'connection_status' | 'mode_changed';
  data: any;
  timestamp: number;
}

export function useWebSocket() {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [signals, setSignals] = useState<any[]>([]);
  const [exits, setExits] = useState<any[]>([]);
  const [latestSignal, setLatestSignal] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = WS_BASE
      ? `${WS_BASE}/ws`
      : `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] Connected');
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg: WsEvent = JSON.parse(event.data);

        switch (msg.type) {
          case 'signal':
            setSignals(prev => {
              // Update existing signal if same ID (execution status updates)
              const existingIdx = prev.findIndex(s => s.id === msg.data.id);
              if (existingIdx >= 0) {
                const updated = [...prev];
                updated[existingIdx] = msg.data;
                return updated;
              }
              return [msg.data, ...prev].slice(0, 50);
            });
            setLatestSignal(msg.data);
            break;
          case 'signal_removed':
            setSignals(prev => prev.filter(s => s.id !== msg.data?.signalId));
            queryClient.invalidateQueries({ queryKey: ['signals'] });
            queryClient.invalidateQueries({ queryKey: ['stats'] });
            break;
          case 'exit_executed':
            setExits(prev => [msg.data, ...prev].slice(0, 50));
            queryClient.invalidateQueries({ queryKey: ['signals'] });
            queryClient.invalidateQueries({ queryKey: ['holdings'] });
            queryClient.invalidateQueries({ queryKey: ['stats'] });
            queryClient.invalidateQueries({ queryKey: ['live-status'] });
            queryClient.invalidateQueries({ queryKey: ['config'] });
            break;
          case 'exit_failed':
            queryClient.invalidateQueries({ queryKey: ['signals'] });
            queryClient.invalidateQueries({ queryKey: ['stats'] });
            break;
          case 'holdings_update':
            queryClient.invalidateQueries({ queryKey: ['holdings'] });
            queryClient.invalidateQueries({ queryKey: ['stats'] });
            queryClient.invalidateQueries({ queryKey: ['live-status'] });
            break;
          case 'mode_changed':
            // Clear signals when runtime mode changes
            setSignals([]);
            setLatestSignal(null);
            queryClient.invalidateQueries({ queryKey: ['signals'] });
            queryClient.invalidateQueries({ queryKey: ['holdings'] });
            queryClient.invalidateQueries({ queryKey: ['stats'] });
            queryClient.invalidateQueries({ queryKey: ['live-status'] });
            queryClient.invalidateQueries({ queryKey: ['config'] });
            break;
          case 'connection_status':
            setConnected(true);
            break;
        }
      } catch (e) {
        console.error('[WS] Parse error:', e);
      }
    };

    ws.onclose = () => {
      console.log('[WS] Disconnected, reconnecting in 3s...');
      setConnected(false);
      setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [queryClient]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected, signals, exits, latestSignal };
}
