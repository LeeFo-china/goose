"use client";

import { useEffect, useRef, useState } from "react";
import { useAdminSessionScope } from "@/components/layout/admin-session-scope";
import {
  getBrowserFrozenCommandStorage,
  markFrozenCommandUncertain,
} from "@/components/supplier-purchase-orders/purchase-order-fulfillment-ui-state";
import { sendBatchCommand } from "./batch-api";
import type { BatchRevision } from "./batch-revision-notice";
import {
  MISSING_BATCH_DESTINATION,
  originalBatchDestination,
} from "./batch-command-destination";
import {
  commandStorageKey,
  createBatchCommand,
  type PendingBatchCommand,
  restoreBatchCommand,
  runBatchCommand,
} from "./batch-command";
import type {
  BatchCommandKind,
  BatchCommandPayload,
  BatchCommandResult,
  BatchDestination,
} from "./batch-types";

export function useBatchCommand(
  slot: string,
  onAccepted: (result: BatchCommandResult) => void,
  onRevision: (revision: BatchRevision) => void,
) {
  const session = useAdminSessionScope();
  const identity = session
    ? commandStorageKey(session.storageScope, slot)
    : null;
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const [stored, setStored] = useState<
    { identity: string; pending: PendingBatchCommand | null } | null
  >(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const pending = stored?.identity === identity ? stored.pending : null;
  useEffect(() => {
    lock.current = false;
    setBusy(false);
    setError("");
    if (session && identity) {
      const storage = getBrowserFrozenCommandStorage();
      let raw: string | null = null;
      try {
        raw = storage?.getItem(identity) ?? null;
      } catch { /* Memory remains usable if browser storage is unavailable. */ }
      setStored({
        identity,
        pending: restoreBatchCommand(raw, session.storageScope, slot),
      });
    } else setStored(null);
    setReady(true);
  }, [identity, session, slot]);

  function persist(next: PendingBatchCommand | null) {
    if (!identity || !session) return;
    setStored({ identity, pending: next });
    try {
      const storage = getBrowserFrozenCommandStorage();
      if (next) {
        storage?.setItem(
          identity,
          JSON.stringify({ scope: session.storageScope, slot, pending: next }),
        );
      } else storage?.removeItem(identity);
    } catch { /* The in-memory frozen command still preserves safe retries. */ }
  }
  async function execute(
    kind: BatchCommandKind,
    id: string,
    payload: BatchCommandPayload,
    destination?: BatchDestination,
  ) {
    if (lock.current || !ready || !identity) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const next = pending ?? createBatchCommand(kind, id, payload, destination);
    persist(next);
    const result = await runBatchCommand(next, sendBatchCommand);
    if (identityRef.current !== identity) return;
    lock.current = false;
    setBusy(false);
    if (result.type === "uncertain") {
      persist({ ...next, command: markFrozenCommandUncertain(next.command) });
      setError(
        `${result.message}。结果尚未确认，请使用原请求重试，不要重复新建。`,
      );
      return;
    }
    persist(null);
    if (result.type === "rejected") {
      setError(result.message);
      if (result.revision) onRevision(result.revision);
      return;
    }
    // A successful mutation is terminal; the caller handles refresh failures separately.
    onAccepted(result.result);
  }
  function retry() {
    if (!pending) return;
    void execute(
      pending.kind,
      pending.command.resourcePath,
      JSON.parse(
        JSON.stringify(pending.command.payload),
      ) as BatchCommandPayload,
    );
  }
  return {
    busy,
    pending,
    error: pending && !originalBatchDestination(pending)
      ? MISSING_BATCH_DESTINATION
      : error,
    canRetry: Boolean(pending && originalBatchDestination(pending)),
    ready: ready && Boolean(identity),
    execute,
    retry,
    setError,
  };
}
