import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_BASE } from '../config/api';

async function fetchApi(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let message = `API error: ${res.status}`;
    try {
      const data = await res.json();
      message = data?.error || data?.message || message;
    } catch {
      // ignore JSON parse errors and keep default message
    }
    throw new Error(message);
  }
  return res.json();
}

export function useHoldings() {
  return useQuery({
    queryKey: ['holdings'],
    queryFn: () => fetchApi('/holdings'),
  });
}

export function useSignals() {
  return useQuery({
    queryKey: ['signals'],
    queryFn: () => fetchApi('/signals'),
  });
}

export function useTrackedWallets() {
  return useQuery({
    queryKey: ['wallets'],
    queryFn: () => fetchApi('/wallets'),
  });
}

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: () => fetchApi('/stats'),
    refetchInterval: 5000,
  });
}

export function useLiveStatus() {
  return useQuery({
    queryKey: ['live-status'],
    queryFn: () => fetchApi('/live-status'),
    refetchInterval: 2000,
  });
}

export function useUserConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => fetchApi('/config'),
  });
}

export function useUpdateConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: any) =>
      fetchApi('/config', { method: 'POST', body: JSON.stringify(config) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      queryClient.invalidateQueries({ queryKey: ['signals'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
    },
  });
}

export function useSetupTelegram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (botToken: string) =>
      fetchApi('/telegram/setup', { method: 'POST', body: JSON.stringify({ botToken }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] });
    },
  });
}

export function useExecuteExit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (signalId: string) =>
      fetchApi('/exit', { method: 'POST', body: JSON.stringify({ signalId }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signals'] });
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['live-status'] });
    },
  });
}

export function useSimulateExit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (signalId: string) =>
      fetchApi('/simulate-exit', { method: 'POST', body: JSON.stringify({ signalId, source: 'dashboard' }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signals'] });
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['live-status'] });
    },
  });
}

export function useBuildExitTx() {
  return useMutation({
    mutationFn: (signalId: string) =>
      fetchApi('/build-exit-tx', { method: 'POST', body: JSON.stringify({ signalId }) }),
  });
}

export function useRecordManualExit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { signalId: string; txHash: string }) =>
      fetchApi('/record-manual-exit', { method: 'POST', body: JSON.stringify(params) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signals'] });
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['live-status'] });
    },
  });
}

export function useDismissSignal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (signalId: string) =>
      fetchApi(`/signals/${encodeURIComponent(signalId)}/dismiss`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signals'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}
