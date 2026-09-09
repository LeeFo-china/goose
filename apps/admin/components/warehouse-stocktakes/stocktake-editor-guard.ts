'use client';
import { useEffect, useRef, useState } from 'react';
export function installStocktakeLeaveGuard({
  page,
  document,
  currentUrl,
  onLeave,
}: {
  page: EventTarget;
  document: EventTarget;
  currentUrl: () => string;
  onLeave: (href: string) => void;
}): () => void {
  const unload = (event: Event) => {
    event.preventDefault();
    (event as BeforeUnloadEvent).returnValue = '';
  };
  const click = (event: Event) => {
    const mouse = event as MouseEvent;
    if (
      event.defaultPrevented ||
      mouse.button !== 0 ||
      mouse.metaKey ||
      mouse.ctrlKey ||
      mouse.shiftKey ||
      mouse.altKey
    )
      return;
    const target = event.target as Element | null;
    const anchor =
      typeof target?.closest === 'function' ? target.closest<HTMLAnchorElement>('a[href]') : null;
    if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;
    const href = new URL(anchor.href, currentUrl());
    if (!['http:', 'https:'].includes(href.protocol) || href.href === currentUrl()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    onLeave(href.href);
  };
  page.addEventListener('beforeunload', unload);
  document.addEventListener('click', click, true);
  return () => {
    page.removeEventListener('beforeunload', unload);
    document.removeEventListener('click', click, true);
  };
}
export function useStocktakeEditorGuard(dirty: boolean, onClose: () => void) {
  const [discard, setDiscard] = useState(false);
  const destination = useRef<(() => void) | null>(null);
  const stopGuard = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!dirty) return;
    const cleanup = installStocktakeLeaveGuard({
      page: window,
      document,
      currentUrl: () => window.location.href,
      onLeave: (href) => {
        destination.current = () => window.location.assign(href);
        setDiscard(true);
      },
    });
    stopGuard.current = cleanup;
    return () => {
      cleanup();
      stopGuard.current = null;
    };
  }, [dirty]);
  const close = () => {
    if (!dirty) {
      onClose();
      return;
    }
    destination.current = onClose;
    setDiscard(true);
  };
  const discardChanges = () => {
    const leave = destination.current;
    destination.current = null;
    stopGuard.current?.();
    setDiscard(false);
    leave?.();
  };
  return { discard, setDiscard, close, discardChanges };
}
