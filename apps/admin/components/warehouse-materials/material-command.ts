'use client';

import { useEffect, useRef, useState } from 'react';
import { ADMIN_SESSION_STORAGE_PREFIX } from '@/components/layout/admin-session-scope';
import {
  beginFrozenCommand,
  getBrowserFrozenCommandStorage,
} from '@/components/supplier-purchase-orders/purchase-order-fulfillment-ui-state';
import { materialError, retainCommand } from './material-rules';
import { sendMaterial } from './material-api';

export type MaterialCommand = Readonly<{
  path: string;
  body: string;
  key: string;
  orderId: string;
}>;
export function useMaterialCommand(
  scope: string,
  onResolved: (id: string, path: string) => void,
) {
  const storageKey = `${ADMIN_SESSION_STORAGE_PREFIX}${scope}:warehouse-material-command`;
  const [pending, setPending] = useState<MaterialCommand | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    const storage = getBrowserFrozenCommandStorage();
    try {
      const raw = storage?.getItem(storageKey);
      if (raw) {
        const value: unknown = JSON.parse(raw);
        if (isMaterialCommand(value)) setPending(Object.freeze(value));
        else {
          setMessage('待确认请求记录无效，请联系管理员核实后处理');
          return;
        }
      }
    } catch {
      setMessage('无法读取待确认请求记录，请核实最近一次操作');
      return;
    }
    setReady(true);
    return () => {
      active.current = false;
    };
  }, [storageKey]);

  async function execute(path?: string, payload?: object, orderId?: string) {
    if (!ready || inFlight.current) return;
    const wasUncertain = Boolean(pending);
    let command = pending;
    if (!command) {
      if (!path || !payload || !orderId) return;
      const frozen = beginFrozenCommand(
        {
          fingerprint: JSON.stringify(payload),
          idempotencyKey: crypto.randomUUID(),
        },
        payload,
        path,
      );
      command = Object.freeze({
        path: frozen.resourcePath,
        body: JSON.stringify(frozen.payload),
        key: frozen.attempt.idempotencyKey,
        orderId,
      });
    }
    const storage = getBrowserFrozenCommandStorage();
    try {
      if (!storage) {
        setMessage('无法保存会话请求记录，暂不能执行操作');
        return;
      }
      storage.setItem(storageKey, JSON.stringify(command));
    } catch {
      setMessage('无法保存会话请求记录，暂不能执行操作');
      return;
    }
    setPending(command);
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    try {
      await sendMaterial(command.path, command.body, command.key);
      storage.removeItem(storageKey);
      if (active.current) {
        setPending(null);
        setMessage('操作已成功。下方显示最新单据；读取失败时可重新读取。');
        onResolved(command.orderId, command.path);
      }
    } catch (error: unknown) {
      if (!retainCommand(error, wasUncertain)) {
        storage.removeItem(storageKey);
        if (active.current) {
          setPending(null);
          if (
            error &&
            typeof error === 'object' &&
            'status' in error &&
            error.status === 409
          )
            onResolved(command.orderId, command.path);
        }
      }
      if (active.current) setMessage(materialError(error));
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }
  return { pending, ready, busy, message, execute };
}

function isMaterialCommand(value: unknown): value is MaterialCommand {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.path === 'string' &&
    /^\/warehouse-(issues|returns)\/[\da-f-]{36}\/(save-draft|submit|complete|cancel)$/i.test(
      record.path,
    ) &&
    typeof record.body === 'string' &&
    typeof record.key === 'string' &&
    typeof record.orderId === 'string' &&
    record.path.split('/')[2] === record.orderId
  );
}
