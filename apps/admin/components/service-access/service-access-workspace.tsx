"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useServiceAccess } from "@/components/service-access/service-access-context";

import { buildServiceAccessDisplay } from "./service-access-display";
import {
  ServiceAccessStatusPanel,
  type ServiceAccessActionHandlers,
} from "./service-access-status-panel";
import { getServiceTrialRecoveryCapabilities } from "./service-trial-api";
import { ServiceTrialSection } from "./service-trial-section";

export function ServiceAccessWorkspace() {
  const router = useRouter();
  const {
    loadResult,
    permissionCodes,
    refresh,
    refreshAfterMutation,
    refreshing,
    summary,
  } = useServiceAccess();
  const hasRedirectedRef = useRef(false);
  const [hasEnteredRecovery, setHasEnteredRecovery] = useState(false);
  const display = useMemo(
    () => buildServiceAccessDisplay(loadResult),
    [loadResult],
  );

  const returnToDashboard = useCallback(() => {
    if (hasRedirectedRef.current) return;

    hasRedirectedRef.current = true;
    router.replace("/dashboard");
    router.refresh();
  }, [router]);

  useEffect(() => {
    const canEnterWorkspace = loadResult.kind === "bypass"
      || (loadResult.kind === "ready" && (
        loadResult.summary.accessStatus === "workspace_available"
        || loadResult.summary.accessStatus === "grace_period"
      ));

    if (canEnterWorkspace) returnToDashboard();
  }, [loadResult, returnToDashboard]);

  const handleRefresh = useCallback(() => {
    void refresh();
  }, [refresh]);

  const actionHandlers = useMemo<ServiceAccessActionHandlers>(() => ({
    enter_workspace: returnToDashboard,
    enter_readonly_workspace: returnToDashboard,
    refresh: handleRefresh,
  }), [handleRefresh, returnToDashboard]);
  const trialCapabilities = useMemo(() => getServiceTrialRecoveryCapabilities(
    [summary?.primaryAction?.key, summary?.secondaryAction?.key].filter(
      (key): key is NonNullable<typeof key> => key !== undefined,
    ),
    permissionCodes,
  ), [permissionCodes, summary?.primaryAction?.key, summary?.secondaryAction?.key]);
  const hasRecoverySummary = loadResult.kind === "ready"
    && loadResult.summary.accessStatus !== "workspace_available"
    && loadResult.summary.accessStatus !== "grace_period";
  useEffect(() => {
    if (hasRecoverySummary) setHasEnteredRecovery(true);
  }, [hasRecoverySummary]);
  const showRecovery = hasRecoverySummary
    || (hasEnteredRecovery && loadResult.kind === "unavailable");

  return (
    <section
      aria-labelledby="service-access-status-title"
      className="h-full min-h-0 overflow-y-auto overscroll-contain"
    >
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col items-start gap-4 py-2 md:py-8">
        <ServiceAccessStatusPanel
          display={display}
          actionHandlers={actionHandlers}
          refreshing={refreshing}
        />
        {showRecovery ? (
          <ServiceTrialSection
            canApply={trialCapabilities.canApply}
            canView={trialCapabilities.canView}
            summaryTrialId={summary?.trialId ?? null}
            summaryTrialStatus={summary?.trialStatus ?? null}
            onSummaryRefresh={refreshAfterMutation}
          />
        ) : null}
      </div>
    </section>
  );
}
