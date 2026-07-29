"use client";

import { useState } from "react";
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
  readCatalogConflictSnapshot,
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

type ConflictSnapshot = {
  version: number;
  status: CatalogStatus;
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
  const [conflictSnapshot, setConflictSnapshot] =
    useState<ConflictSnapshot | null>(null);
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
      setConflictSnapshot(null);
      setRequestedStatus(null);
      router.refresh();
    } catch (error) {
      if (isCatalogVersionConflict(error)) {
        setConflict(true);
        setConflictSnapshot(readCatalogConflictSnapshot(error));
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

  async function retryStatus() {
    if (!requestedStatus || !conflictSnapshot) return;
    if (resolveCatalogStatusRetry({
      requestedStatus,
      latestStatus: conflictSnapshot.status,
    }) === "already-applied") {
      toast.success(`${record.name}已${label}`);
      setOpen(false);
      setConflictSnapshot(null);
      setRequestedStatus(null);
      router.refresh();
      return;
    }
    await submitStatus(conflictSnapshot.version, requestedStatus);
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => {
          setConflict(false);
          setConflictSnapshot(null);
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
                      setConflictSnapshot(null);
                      setRequestedStatus(null);
                      router.refresh();
                    }}
                  >
                    刷新最新数据
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending || !conflictSnapshot}
                    onClick={() => void retryStatus()}
                  >
                    {pending
                      ? "正在重试"
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
