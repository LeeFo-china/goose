"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { requestBackendJson } from "@/lib/backend-client";

import {
  buildCatalogStatusRequest,
  isCatalogVersionConflict,
  resolveCatalogStatusRetry,
} from "./supplier-catalog-rules";
import type {
  CatalogRecordKind,
  CatalogStatus,
} from "./supplier-catalog-types";

type StatusRecord = {
  id: string;
  name: string;
  status: CatalogStatus;
  version: number;
};

export function SupplierCatalogStatusAction({
  kind,
  record,
}: {
  kind: CatalogRecordKind;
  record: StatusRecord;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [conflictVersion, setConflictVersion] = useState<number | null>(null);
  const [waitingForRefresh, setWaitingForRefresh] = useState(false);
  const [requestedStatus, setRequestedStatus] = useState<CatalogStatus | null>(
    null,
  );
  const nextStatus = record.status === "active" ? "inactive" : "active";
  const targetStatus = requestedStatus ?? nextStatus;
  const label = targetStatus === "active" ? "启用" : "停用";

  async function submitStatus(
    expectedVersion: number,
    status: CatalogStatus = targetStatus,
  ) {
    setPending(true);
    setConflict(false);
    const request = buildCatalogStatusRequest({
      kind,
      id: record.id,
      status,
      expectedVersion,
    });
    try {
      await requestBackendJson(request.path, {
        ...request.init,
        fallbackMessage: `${label}目录数据失败`,
      });
      toast.success(`${record.name}已${label}`);
      setOpen(false);
      setConflictVersion(null);
      setWaitingForRefresh(false);
      setRequestedStatus(null);
      router.refresh();
    } catch (error) {
      if (isCatalogVersionConflict(error)) {
        setConflict(true);
        setConflictVersion(expectedVersion);
        setRequestedStatus(status);
      } else {
        toast.error(
          error instanceof Error ? error.message : `${label}目录数据失败`,
        );
      }
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    if (
      !waitingForRefresh ||
      conflictVersion === null ||
      record.version === conflictVersion
    ) {
      return;
    }
    if (!requestedStatus) return;
    if (resolveCatalogStatusRetry({
      requestedStatus,
      latestStatus: record.status,
    }) === "already-applied") {
      toast.success(`${record.name}已${label}`);
      setOpen(false);
      setConflictVersion(null);
      setWaitingForRefresh(false);
      setRequestedStatus(null);
      return;
    }
    setConflictVersion(null);
    setWaitingForRefresh(false);
    void submitStatus(record.version, requestedStatus);
  }, [
    conflictVersion,
    record.status,
    record.version,
    requestedStatus,
    waitingForRefresh,
  ]);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => {
          setConflict(false);
          setConflictVersion(null);
          setWaitingForRefresh(false);
          setRequestedStatus(nextStatus);
          setOpen(true);
        }}
      >
        {label}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!pending) setOpen(nextOpen);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{label}“{record.name}”</DialogTitle>
            <DialogDescription>
              {targetStatus === "active"
                ? "启用后可继续在供应商业务中选择该项。"
                : "停用后不再用于新增业务，历史记录仍会保留。"}
            </DialogDescription>
          </DialogHeader>
          {conflict ? (
            <Alert variant="destructive">
              <AlertTitle>数据版本已变化</AlertTitle>
              <AlertDescription className="flex flex-col gap-3">
                <p>其他人已更新这条数据，请刷新最新版本后再提交。</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setOpen(false);
                      setConflictVersion(null);
                      setWaitingForRefresh(false);
                      setRequestedStatus(null);
                      router.refresh();
                    }}
                  >
                    刷新最新数据
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending || waitingForRefresh}
                    onClick={() => {
                      setWaitingForRefresh(true);
                      router.refresh();
                    }}
                  >
                    {waitingForRefresh
                      ? "正在刷新"
                      : "重试本次操作"}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              取消操作
            </Button>
            <Button
              type="button"
              variant={targetStatus === "inactive" ? "destructive" : "default"}
              disabled={pending || conflict}
              onClick={() => void submitStatus(record.version)}
            >
              {pending ? "正在提交" : `${label}目录数据`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
