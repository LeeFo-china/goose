'use client';

import { useEffect, useRef, useState } from 'react';

import { ADMIN_SESSION_STORAGE_PREFIX } from '@/components/layout/admin-session-scope';
import { beginFrozenCommand, getBrowserFrozenCommandStorage } from '@/components/supplier-purchase-orders/purchase-order-fulfillment-ui-state';

import { sendTransfer } from './transfer-api';
import { clearStoredTransferCommand, createTransferCommandLifecycle, matchStoredTransferCommand, parseStoredTransferCommand, type TransferCommand } from './transfer-command-state';
import { retainTransferCommand, transferError } from './transfer-rules';

export function useTransferCommand(scope: string, onResolved: (id: string) => void) {
  const storageKey = `${ADMIN_SESSION_STORAGE_PREFIX}${scope}:warehouse-transfer-command`;
  const [pending, setPending] = useState<TransferCommand | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const lifecycle = useRef(createTransferCommandLifecycle());
  const owner = useRef(0);
  const inFlight = useRef(false);
  useEffect(() => {
    owner.current = lifecycle.current.activate();
    const storage = getBrowserFrozenCommandStorage();
    try {
      const raw = storage?.getItem(storageKey);
      if (raw) {
        const restored = parseStoredTransferCommand(raw);
        if (!restored) { setMessage('待确认请求记录无效，请联系管理员核实后处理'); return; }
        else setPending(restored);
      }
      setReady(true);
    } catch { setMessage('无法读取待确认请求记录，请核实最近一次操作'); }
    return () => { lifecycle.current.deactivate(); };
  }, [storageKey]);

  async function execute(path?: string, payload?: object, orderId?: string) {
    if (!ready || inFlight.current) return;
    const executionOwner = owner.current;
    const isOwnerCurrent = () => lifecycle.current.isCurrent(executionOwner);
    const wasUncertain = Boolean(pending);
    let command = pending;
    if (!command) {
      if (!path || !payload || !orderId) return;
      const frozen = beginFrozenCommand({ fingerprint: JSON.stringify(payload), idempotencyKey: crypto.randomUUID() }, payload, path);
      command = Object.freeze({ path: frozen.resourcePath, body: JSON.stringify(frozen.payload), key: frozen.attempt.idempotencyKey, orderId });
    }
    const storage = getBrowserFrozenCommandStorage();
    try {
      if (!storage) { setMessage('无法保存会话请求记录，暂不能执行操作'); return; }
      storage.setItem(storageKey, JSON.stringify(command));
    } catch { setMessage('无法保存会话请求记录，暂不能执行操作'); return; }
    setPending(command); inFlight.current = true; setBusy(true); setMessage('');
    try {
      await sendTransfer(command.path, command.body, command.key);
      const cleared = clearStoredTransferCommand(storage, storageKey, command, isOwnerCurrent);
      if (cleared === 'inactive') return;
      if (cleared === 'error') {
        if (isOwnerCurrent()) setMessage('操作已成功，但无法清理待确认记录；请勿继续操作并刷新核实');
        return;
      }
      if (cleared === 'cleared' && isOwnerCurrent()) {
        setPending(null); setMessage('操作已成功，已重新读取最新单据。'); onResolved(command.orderId);
      }
    } catch (error: unknown) {
      if (!retainTransferCommand(error, wasUncertain)) {
        const cleared = clearStoredTransferCommand(storage, storageKey, command, isOwnerCurrent);
        if (cleared === 'inactive') return;
        if (cleared === 'error') {
          if (isOwnerCurrent()) setMessage('无法清理待确认请求记录，请刷新并核实最近一次操作');
          return;
        }
        if (cleared === 'cleared' && isOwnerCurrent()) {
          setPending(null);
          if (error && typeof error === 'object' && 'status' in error && error.status === 409) onResolved(command.orderId);
          setMessage(transferError(error));
        }
        return;
      }
      const match = matchStoredTransferCommand(storage, storageKey, command);
      if (isOwnerCurrent() && match === 'current') setMessage(transferError(error));
      if (isOwnerCurrent() && match === 'error') setMessage('无法读取待确认请求记录，请刷新并核实最近一次操作');
    } finally { inFlight.current = false; if (isOwnerCurrent()) setBusy(false); }
  }
  return { pending, ready, busy, message, execute };
}
