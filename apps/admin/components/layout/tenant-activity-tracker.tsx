"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import type { AdminSession } from "@/lib/backend";
import { createActivityViewReporter, getPermittedActivityScreen, getActivityStorageScope, isActivityViewAcknowledged } from "./tenant-activity-tracker-rules";

let reporter: ReturnType<typeof createActivityViewReporter> | undefined;

function getBrowserReporter() {
  if (reporter) return reporter;
  let storage: Storage | null = null;
  try {
    storage = window.sessionStorage;
  } catch {
    // Private/locked storage falls back to tab memory, without affecting business UI.
  }
  reporter = createActivityViewReporter({
    storage, now: Date.now,
    send: async (screen) => {
      // No business UI updates or client-side redirects here.
      // The existing backend proxy still clears the auth cookie on HTTP 401.
      const response = await fetch("/api/backend/tenant-activity/view", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ screen }), signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return false;
      const payload: unknown = await response.json();
      return isActivityViewAcknowledged(payload);
    },
  });
  return reporter;
}

export function TenantActivityTracker({ session }: { session: AdminSession }) {
  const pathname = usePathname();
  const scope = getActivityStorageScope(session);
  const screen = getPermittedActivityScreen(pathname, session.permissions);
  useEffect(() => {
    if (!scope || !screen) return;
    const reportVisibleView = () => {
      if (document.visibilityState === "visible") void getBrowserReporter()(scope, screen);
    };
    reportVisibleView();
    document.addEventListener("visibilitychange", reportVisibleView);
    return () => document.removeEventListener("visibilitychange", reportVisibleView);
  }, [pathname, scope, screen]);
  return null;
}
