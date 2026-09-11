"use client";

import { useCallback, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { AdminNav } from "@/components/layout/admin-nav";
import {
  ADMIN_SESSION_STORAGE_PREFIX,
  createAdminSessionScope,
} from "@/components/layout/admin-session-scope";
import type { AdminSession } from "@/lib/backend";

export function getAdminSidebarScrollKey(session: AdminSession) {
  const scope = createAdminSessionScope(session.tenant?.id, session.user_id);
  return `${ADMIN_SESSION_STORAGE_PREFIX}${scope?.storageScope ?? "unknown"}:sidebar-scroll:v1`;
}

export function readAdminSidebarScrollTop(storage: Storage, key: string) {
  try {
    const storedValue = storage.getItem(key);
    if (storedValue === null || storedValue.trim() === "") return null;

    const value = Number(storedValue);
    return Number.isFinite(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

export function writeAdminSidebarScrollTop(
  storage: Storage,
  key: string,
  scrollTop: number,
) {
  try {
    storage.setItem(key, String(Math.max(0, Math.round(scrollTop))));
  } catch {
    // Scroll restoration is best-effort when browser storage is unavailable.
  }
}

export function AdminSidebarScrollArea({
  session,
  collapsed,
}: {
  session: AdminSession;
  collapsed: boolean;
}) {
  const pathname = usePathname();
  const areaRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const storageKey = getAdminSidebarScrollKey(session);

  const persist = useCallback(() => {
    const area = areaRef.current;
    if (!area) return;
    writeAdminSidebarScrollTop(window.sessionStorage, storageKey, area.scrollTop);
  }, [storageKey]);

  const ensureActiveItemVisible = useCallback(() => {
    const area = areaRef.current;
    const activeItem = area?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!area || !activeItem) return;

    const areaRect = area.getBoundingClientRect();
    const itemRect = activeItem.getBoundingClientRect();
    if (itemRect.top < areaRect.top) {
      area.scrollTop -= areaRect.top - itemRect.top;
    } else if (itemRect.bottom > areaRect.bottom) {
      area.scrollTop += itemRect.bottom - areaRect.bottom;
    }
  }, []);

  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return;

    const savedScrollTop = readAdminSidebarScrollTop(
      window.sessionStorage,
      storageKey,
    );
    if (savedScrollTop !== null) area.scrollTop = savedScrollTop;
    ensureActiveItemVisible();
    persist();

    const observer = new MutationObserver(() => {
      ensureActiveItemVisible();
      persist();
    });
    observer.observe(area, {
      attributes: true,
      attributeFilter: ["aria-current"],
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [collapsed, ensureActiveItemVisible, pathname, persist, storageKey]);

  useLayoutEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    persist();
  }, [persist]);

  return (
    <div
      ref={areaRef}
      data-slot="admin-sidebar-scroll-area"
      className="min-h-0 flex-1 overflow-y-auto"
      onScroll={() => {
        if (frameRef.current !== null) return;
        frameRef.current = window.requestAnimationFrame(() => {
          frameRef.current = null;
          persist();
        });
      }}
    >
      <AdminNav session={session} collapsed={collapsed} />
    </div>
  );
}
