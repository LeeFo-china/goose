"use client";

import { useCallback, useEffect, useRef } from "react";
import { handleBrowserAdminSessionExpiry } from "@/lib/admin-session-expiry";

const ADMIN_SESSION_CHECK_INTERVAL_MS = 5 * 60 * 1_000;

type AdminSessionCheckResult = "active" | "expired" | "unavailable";

export async function checkAdminSession(input: {
  fetchSession?: () => Promise<Response>;
} = {}): Promise<AdminSessionCheckResult> {
  const fetchSession = input.fetchSession ?? (() => fetch("/api/auth/me", {
    cache: "no-store",
  }));

  try {
    const response = await fetchSession();
    if (response.ok) return "active";
    return response.status === 401 ? "expired" : "unavailable";
  } catch {
    return "unavailable";
  }
}

export function AdminSessionGuard() {
  const checkInFlightRef = useRef(false);

  const verifySession = useCallback(async () => {
    if (checkInFlightRef.current) return;
    checkInFlightRef.current = true;
    try {
      const result = await checkAdminSession();
      if (result === "expired") {
        handleBrowserAdminSessionExpiry({ status: 401, code: "TOKEN_EXPIRED" });
      }
    } finally {
      checkInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void verifySession();
    }, ADMIN_SESSION_CHECK_INTERVAL_MS);
    const handleFocus = () => {
      void verifySession();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void verifySession();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [verifySession]);

  return null;
}
