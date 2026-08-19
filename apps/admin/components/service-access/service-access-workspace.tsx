"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
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
    refreshing,
    summary,
  } = useServiceAccess();
  const hasRedirectedRef = useRef(false);
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
  const showRecovery = loadResult.kind === "ready"
    && loadResult.summary.accessStatus !== "workspace_available"
    && loadResult.summary.accessStatus !== "grace_period";

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
            summaryTrialStatus={summary?.trialStatus ?? null}
            onSummaryRefresh={refresh}
          />
        ) : null}
      </div>
    </section>
  );
}
