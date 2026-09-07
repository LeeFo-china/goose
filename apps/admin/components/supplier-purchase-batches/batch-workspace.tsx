"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useAdminSessionScope } from "@/components/layout/admin-session-scope";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import {
  type BatchFilters as Filters,
  loadBatches,
  loadBatchSettings,
} from "./batch-api";
import { BatchDetail } from "./batch-detail";
import { BatchEditor } from "./batch-editor";
import { BatchFilters } from "./batch-filters";
import { BatchList } from "./batch-list";
import { BatchPager, BatchReadState } from "./batch-page-parts";
import { batchError, warehouseCreationBlocker } from "./batch-rules";
import type {
  BatchAccess,
  BatchCommandResult,
  BatchDetail as BatchDetailRecord,
  BatchSettings,
  PageData,
} from "./batch-types";

export function BatchWorkspace({ access }: { access: BatchAccess }) {
  const session = useAdminSessionScope();
  // Remount the complete workspace on identity changes, including dialogs and read responses.
  return (
    <BatchWorkspaceSession
      key={session?.storageScope ?? "no-session"}
      access={access}
    />
  );
}
function BatchWorkspaceSession({ access }: { access: BatchAccess }) {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Filters>({});
  const [result, setResult] = useState<PageData<BatchDetailRecord> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<
    { record: BatchDetailRecord | null } | null
  >(null);
  const [receipt, setReceipt] = useState<BatchCommandResult | null>(null);
  const [settings, setSettings] = useState<BatchSettings | null>(null);
  const [settingsError, setSettingsError] = useState("");
  const [settingsRetry, setSettingsRetry] = useState(0);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get(
      "purchase_batch_id",
    );
    if (
      id &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ) setSelectedId(id);
  }, []);
  useEffect(() => {
    if (!access.canView) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    loadBatches(page, filters, controller.signal).then((next) => {
      if (controller.signal.aborted) return;
      if (page > Math.max(1, next.pagination.totalPages)) {
        setPage(Math.max(1, next.pagination.totalPages));
        return;
      }
      setResult(next);
    }).catch((caught: unknown) => {
      if (!controller.signal.aborted) setError(batchError(caught));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [access.canView, page, filters, retry]);
  useEffect(() => {
    if (
      !access.canView || !access.canManage || !access.canReadSettings ||
      !access.canViewWarehouses || !access.canManageWarehouses
    ) return;
    const controller = new AbortController();
    setSettings(null);
    setSettingsError("");
    loadBatchSettings(controller.signal).then((next) => {
      if (!controller.signal.aborted) setSettings(next);
    }).catch((caught: unknown) => {
      if (!controller.signal.aborted) setSettingsError(batchError(caught));
    });
    return () => controller.abort();
  }, [
    access.canView,
    access.canManage,
    access.canReadSettings,
    access.canViewWarehouses,
    access.canManageWarehouses,
    settingsRetry,
  ]);
  function select(id: string | null) {
    setSelectedId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("purchase_batch_id", id);
    else url.searchParams.delete("purchase_batch_id");
    window.history.replaceState(null, "", url);
  }
  function accepted(next: BatchCommandResult) {
    setEditor(null);
    setReceipt(next);
    select(next.batch.id);
    setRetry((value) => value + 1);
  }
  const blocker = settingsError
    ? `仓库补货设置暂不可用：${settingsError}；项目采购仍可使用`
    : warehouseCreationBlocker(access, settings);
  const rows = !loading && !error ? result?.list ?? [] : [];
  if (!access.canView) {
    return (
      <StatusAlert tone="warning" title="暂无采购批次查看权限">
        请联系管理员开通采购申请查看权限。
      </StatusAlert>
    );
  }
  return (
    <div className="flex h-[calc(100dvh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="flex shrink-0 items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">采购批次</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            按项目或仓库汇总采购，多供应商统一提交审批。
          </p>
        </div>
        {access.canManage
          ? (
            <Button
              type="button"
              className="shrink-0"
              onClick={() => {
                setReceipt(null);
                setEditor({ record: null });
              }}
            >
              <Plus className="size-4" />新建批次
            </Button>
          )
          : null}
      </div>
      {settingsError
        ? (
          <StatusAlert tone="warning">
            {blocker}
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => setSettingsRetry((value) => value + 1)}
            >
              重试设置
            </Button>
          </StatusAlert>
        )
        : null}
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="max-h-[45dvh] shrink-0 overflow-y-auto border-b">
          <BatchFilters
            filters={filters}
            canViewWarehouses={access.canViewWarehouses}
            onChange={(next) => {
              setFilters(next);
              setPage(1);
            }}
          />
        </CardHeader>
        <div
          className={rows.length ? "contents" : "min-h-0 flex-1 overflow-auto"}
        >
          <BatchReadState
            loading={loading}
            error={error}
            empty={!rows.length}
            onRetry={() => setRetry((value) => value + 1)}
            onClear={() => {
              setFilters({});
              setPage(1);
            }}
          />
          {rows.length
            ? (
              <BatchList
                rows={rows}
                onOpen={(id) => {
                  setReceipt(null);
                  select(id);
                }}
              />
            )
            : null}
        </div>
        <CardFooter className="shrink-0 border-t pt-4">
          <BatchPager
            pagination={!loading && !error ? result?.pagination : null}
            loading={loading}
            onPage={setPage}
          />
        </CardFooter>
      </Card>
      {selectedId && !editor
        ? (
          <BatchDetail
            key={selectedId}
            id={selectedId}
            access={access}
            receipt={receipt}
            onClose={() => select(null)}
            onEdit={(record) => {
              setReceipt(null);
              setEditor({ record });
            }}
            onChanged={(next) => {
              setReceipt(next ?? null);
              setRetry((value) => value + 1);
            }}
          />
        )
        : null}
      {editor
        ? (
          <BatchEditor
            key={editor.record?.id ?? "new"}
            record={editor.record}
            warehouseBlocker={blocker}
            onClose={() => setEditor(null)}
            onAccepted={accepted}
          />
        )
        : null}
    </div>
  );
}
