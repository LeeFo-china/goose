"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  ReleaseRuntimeVersionData,
  ReleaseRun,
  ReleaseSuccessfulRef,
  Pagination,
} from "@/components/ops/ops-types";
import {
  fetchReleaseRuntimeVersions,
  fetchReleaseRuns,
  fetchSuccessfulRefs,
  isReleaseRunActive,
  RELEASE_RUN_POLL_MS,
  type ReleaseSearchEnvironment,
} from "@/components/ops/release-deployments-shared";

export function useReleaseDeploymentSnapshots({
  runs,
  runsPagination,
  successfulRefs,
  successfulRefsPagination,
  runtimeVersions,
}: {
  runs: ReleaseRun[];
  runsPagination: Pagination;
  successfulRefs: ReleaseSuccessfulRef[];
  successfulRefsPagination: Pagination;
  runtimeVersions: ReleaseRuntimeVersionData | null;
}) {
  const [currentRuns, setCurrentRuns] = useState(runs);
  const [currentRunsPagination, setCurrentRunsPagination] = useState(runsPagination);
  const [currentSuccessfulRefs, setCurrentSuccessfulRefs] = useState(successfulRefs);
  const [currentSuccessfulRefsPagination, setCurrentSuccessfulRefsPagination] = useState(successfulRefsPagination);
  const [currentRuntimeVersions, setCurrentRuntimeVersions] = useState(runtimeVersions);
  const [runsRefreshing, setRunsRefreshing] = useState(false);
  const [successfulRefsRefreshing, setSuccessfulRefsRefreshing] = useState(false);
  const [runsPollError, setRunsPollError] = useState("");
  const [lastRunsRefreshedAt, setLastRunsRefreshedAt] = useState<string | null>(null);
  const [forcePollUntil, setForcePollUntil] = useState(0);
  const [runsPage, setRunsPage] = useState(runsPagination.page || 1);
  const [successfulRefsPage, setSuccessfulRefsPage] = useState(successfulRefsPagination.page || 1);
  const [successfulRefEnvironment, setSuccessfulRefEnvironment] = useState<ReleaseSearchEnvironment>("all");
  const [successfulRefKeyword, setSuccessfulRefKeyword] = useState("");
  const hasActiveRuns = useMemo(() => currentRuns.some(isReleaseRunActive), [currentRuns]);
  const shouldPollRuns = hasActiveRuns || Date.now() < forcePollUntil;

  useEffect(() => {
    setCurrentRuns(runs);
  }, [runs]);

  useEffect(() => {
    setCurrentRunsPagination(runsPagination);
    setRunsPage(runsPagination.page || 1);
  }, [runsPagination]);

  useEffect(() => {
    setCurrentSuccessfulRefs(successfulRefs);
  }, [successfulRefs]);

  useEffect(() => {
    setCurrentSuccessfulRefsPagination(successfulRefsPagination);
    setSuccessfulRefsPage(successfulRefsPagination.page || 1);
  }, [successfulRefsPagination]);

  useEffect(() => {
    setCurrentRuntimeVersions(runtimeVersions);
  }, [runtimeVersions]);

  const refreshReleaseSnapshots = useCallback(async ({
    silent = false,
    nextRunsPage = runsPage,
    nextSuccessfulRefsPage = successfulRefsPage,
    nextSuccessfulRefEnvironment = successfulRefEnvironment,
    nextSuccessfulRefKeyword = successfulRefKeyword,
  }: {
    silent?: boolean;
    nextRunsPage?: number;
    nextSuccessfulRefsPage?: number;
    nextSuccessfulRefEnvironment?: ReleaseSearchEnvironment;
    nextSuccessfulRefKeyword?: string;
  } = {}) => {
    if (!silent) setRunsRefreshing(true);
    if (!silent) setSuccessfulRefsRefreshing(true);
    try {
      const [nextRuns, nextSuccessfulRefs, nextRuntimeVersions] = await Promise.all([
        fetchReleaseRuns({ page: nextRunsPage, pageSize: 5 }),
        fetchSuccessfulRefs({
          page: nextSuccessfulRefsPage,
          pageSize: 5,
          environment: nextSuccessfulRefEnvironment,
          keyword: nextSuccessfulRefKeyword,
        }),
        fetchReleaseRuntimeVersions(),
      ]);
      setCurrentRuns(nextRuns.list || []);
      setCurrentRunsPagination(nextRuns.pagination);
      setRunsPage(nextRuns.pagination.page || nextRunsPage);
      setCurrentSuccessfulRefs(nextSuccessfulRefs.list || []);
      setCurrentSuccessfulRefsPagination(nextSuccessfulRefs.pagination);
      setSuccessfulRefsPage(nextSuccessfulRefs.pagination.page || nextSuccessfulRefsPage);
      setCurrentRuntimeVersions(nextRuntimeVersions);
      setLastRunsRefreshedAt(new Date().toISOString());
      setRunsPollError("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "发布状态刷新失败";
      setRunsPollError(message);
      if (!silent) toast.error(message);
    } finally {
      if (!silent) setRunsRefreshing(false);
      if (!silent) setSuccessfulRefsRefreshing(false);
    }
  }, [runsPage, successfulRefEnvironment, successfulRefKeyword, successfulRefsPage]);

  useEffect(() => {
    if (!shouldPollRuns) return undefined;

    let cancelled = false;
    const tick = async () => {
      if (document.visibilityState !== "visible" || cancelled) return;
      setRunsRefreshing(true);
      try {
        const [nextRuns, nextSuccessfulRefs, nextRuntimeVersions] = await Promise.all([
          fetchReleaseRuns({ page: runsPage, pageSize: 5 }),
          fetchSuccessfulRefs({
            page: successfulRefsPage,
            pageSize: 5,
            environment: successfulRefEnvironment,
            keyword: successfulRefKeyword,
          }),
          fetchReleaseRuntimeVersions(),
        ]);
        if (cancelled) return;
        setCurrentRuns(nextRuns.list || []);
        setCurrentRunsPagination(nextRuns.pagination);
        setCurrentSuccessfulRefs(nextSuccessfulRefs.list || []);
        setCurrentSuccessfulRefsPagination(nextSuccessfulRefs.pagination);
        setCurrentRuntimeVersions(nextRuntimeVersions);
        setLastRunsRefreshedAt(new Date().toISOString());
        setRunsPollError("");
      } catch (err) {
        if (!cancelled) setRunsPollError(err instanceof Error ? err.message : "发布状态刷新失败");
      } finally {
        if (!cancelled) setRunsRefreshing(false);
      }
    };

    const timer = window.setInterval(tick, RELEASE_RUN_POLL_MS);
    void tick();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [runsPage, shouldPollRuns, successfulRefEnvironment, successfulRefKeyword, successfulRefsPage]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSuccessfulRefsPage(1);
      setSuccessfulRefsRefreshing(true);
      fetchSuccessfulRefs({
        page: 1,
        pageSize: 5,
        environment: successfulRefEnvironment,
        keyword: successfulRefKeyword,
      })
        .then((data) => {
          if (cancelled) return;
          setCurrentSuccessfulRefs(data.list || []);
          setCurrentSuccessfulRefsPagination(data.pagination);
          setSuccessfulRefsPage(data.pagination.page || 1);
        })
        .catch((err) => {
          if (!cancelled) setRunsPollError(err instanceof Error ? err.message : "发布辅助刷新失败");
        })
        .finally(() => {
          if (!cancelled) setSuccessfulRefsRefreshing(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [successfulRefEnvironment, successfulRefKeyword]);

  function changeRunsPage(nextPage: number) {
    const normalized = Math.max(1, Math.min(nextPage, Math.max(currentRunsPagination.totalPages, 1)));
    setRunsPage(normalized);
    void refreshReleaseSnapshots({ nextRunsPage: normalized });
  }

  function changeSuccessfulRefsPage(nextPage: number) {
    const normalized = Math.max(1, Math.min(nextPage, Math.max(currentSuccessfulRefsPagination.totalPages, 1)));
    setSuccessfulRefsPage(normalized);
    void refreshReleaseSnapshots({ nextSuccessfulRefsPage: normalized });
  }

  return {
    currentRuns,
    currentRunsPagination,
    currentSuccessfulRefs,
    currentSuccessfulRefsPagination,
    currentRuntimeVersions,
    runsRefreshing,
    successfulRefsRefreshing,
    runsPollError,
    lastRunsRefreshedAt,
    hasActiveRuns,
    successfulRefEnvironment,
    successfulRefKeyword,
    setSuccessfulRefEnvironment,
    setSuccessfulRefKeyword,
    setForcePollUntil,
    refreshReleaseSnapshots,
    changeRunsPage,
    changeSuccessfulRefsPage,
  };
}
