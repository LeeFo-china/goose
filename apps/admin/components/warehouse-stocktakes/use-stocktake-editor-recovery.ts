'use client';
import { useEffect, useRef, useState } from 'react';
import { getBrowserFrozenCommandStorage } from '@/components/supplier-purchase-orders/purchase-order-fulfillment-ui-state';
import { createStocktakeEditorStore, type StocktakeEdit } from './stocktake-editor-storage';
import { stocktakeError } from './stocktake-rules';

export function useStocktakeEditorRecovery(scope: string) {
  const store = useRef<ReturnType<typeof createStocktakeEditorStore> | null>(null);
  const [record, setRecord] = useState<StocktakeEdit | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    store.current = createStocktakeEditorStore(getBrowserFrozenCommandStorage(), scope);
    try { setRecord(store.current.read()); setReady(true); }
    catch (caught) { setError(stocktakeError(caught)); }
    return () => { store.current = null; };
  }, [scope]);
  function write(edit: StocktakeEdit) {
    try {
      if (!store.current || !ready) return false;
      store.current.write(edit);
      setRecord(edit); setError(''); return true;
    } catch (caught) { setError(stocktakeError(caught)); return false; }
  }
  function clear() {
    try {
      if (!store.current) return false;
      store.current.clear(); setRecord(null); setError(''); setReady(true); return true;
    } catch (caught) { setError(stocktakeError(caught)); return false; }
  }
  return { record, ready, error, write, clear };
}
