"use client";

import { useEffect, useRef, useState } from "react";
import { useAdminSessionScope } from "@/components/layout/admin-session-scope";
import { getBrowserFrozenCommandStorage, markFrozenCommandUncertain } from "@/components/supplier-purchase-orders/purchase-order-fulfillment-ui-state";
import { createPaymentRequestCommand, paymentCommandStorageKey, restorePaymentRequestCommand, runPaymentRequestCommand,
  type PaymentRequestCommandFacts, type PaymentRequestCommandKind, type PaymentRequestCommandPayload, type PendingPaymentRequestCommand } from "./payment-request-command";

export function usePaymentRequestCommand(slot: "draft" | "actions") {
  const session = useAdminSessionScope();
  const identity = session ? paymentCommandStorageKey(session.storageScope, slot) : null;
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const [stored, setStored] = useState<{ identity: string; pending: PendingPaymentRequestCommand | null } | null>(null);
  const pending = stored?.identity === identity ? stored.pending : null;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const lifecycle = useRef<symbol | null>(null);
  useEffect(() => {
    const generation = Symbol("payment-request-command");
    lifecycle.current = generation;
    lock.current = false;
    setBusy(false);
    setError("");
    if (session && identity) {
      let raw: string | null = null;
      try { raw = getBrowserFrozenCommandStorage()?.getItem(identity) ?? null; }
      catch { /* Storage may be unavailable; in-memory retries remain supported. */ }
      setStored({ identity, pending: restorePaymentRequestCommand(raw, session.storageScope, slot) });
    } else setStored(null);
    setReady(true);
    return () => {
      if (lifecycle.current === generation) lifecycle.current = null;
    };
  }, [identity, session, slot]);

  function persist(next: PendingPaymentRequestCommand | null) {
    if (!identity || !session) return;
    pendingRef.current = next;
    setStored({ identity, pending: next });
    try {
      const storage = getBrowserFrozenCommandStorage();
      if (next) storage?.setItem(identity, JSON.stringify({ scope: session.storageScope, slot, pending: next }));
      else storage?.removeItem(identity);
    } catch { /* The frozen in-memory attempt retains its original key and payload. */ }
  }

  async function execute(kind: PaymentRequestCommandKind, id: string, payload: PaymentRequestCommandPayload, destination: PaymentRequestCommandFacts) {
    const generation = lifecycle.current;
    if (!generation || lock.current || !ready || !identity || identityRef.current !== identity) return null;
    const frozen = pendingRef.current;
    if (frozen && (frozen.kind !== kind || frozen.command.resourcePath !== id)) return null;
    const next = frozen ?? createPaymentRequestCommand(kind, id, payload, destination);
    lock.current = true;
    setBusy(true);
    setError("");
    persist(next);
    const result = await runPaymentRequestCommand(next);
    // The same storage scope can be owned by a newer mount or effect generation.
    // A stale result must neither mutate that owner's storage nor reach its caller.
    if (lifecycle.current !== generation || identityRef.current !== identity) return null;
    lock.current = false;
    setBusy(false);
    if (result.type === "uncertain") {
      persist({ ...next, command: markFrozenCommandUncertain(next.command) });
      setError(`${result.message}。请使用原请求重试，不要重新登记。`);
    } else {
      persist(null);
      if (result.type === "rejected") setError(result.message);
    }
    return result;
  }

  function retry() {
    const frozen = pendingRef.current;
    return frozen ? execute(frozen.kind, frozen.command.resourcePath,
      structuredClone(frozen.command.payload) as PaymentRequestCommandPayload, frozen.destination) : Promise.resolve(null);
  }
  return { pending, busy, ready: ready && Boolean(identity), error, setError, execute, retry };
}
