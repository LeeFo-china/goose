"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Play, Plus, PowerOff } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TenantDialog } from "@/components/platform-tenants/platform-tenant-dialog";
import { requestPlatformTenantJson } from "@/components/platform-tenants/platform-tenant-requests";
import type { PlatformTenantRecord } from "@/components/platform-tenants/platform-tenant-types";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

export function CreatePlatformTenantButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" />
        新建租户
      </Button>
      <TenantDialog mode="create" open={open} onOpenChange={setOpen} />
    </>
  );
}

export function EditPlatformTenantButton({ tenant }: { tenant: PlatformTenantRecord }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil data-icon="inline-start" />
        编辑
      </Button>
      <TenantDialog mode="edit" tenant={tenant} open={open} onOpenChange={setOpen} />
    </>
  );
}

export function PlatformTenantStatusButton({ tenant }: { tenant: PlatformTenantRecord }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const disabled = tenant.status === "archived" || pending;
  const nextAction = tenant.status === "active" ? "suspend" : "activate";
  const label = tenant.status === "active" ? "停用" : "启用";
  const Icon = tenant.status === "active" ? PowerOff : Play;

  function run() {
    if (disabled) return;
    setError("");
    startTransition(async () => {
      try {
        await requestPlatformTenantJson(`/api/backend/platform/tenants/${tenant.id}/${nextAction}`, {
          method: "POST",
        });
        setOpen(false);
        refreshAfterDialogClose(router);
      } catch (err) {
        setError(err instanceof Error ? err.message : `${label}租户失败`);
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
        <Icon data-icon="inline-start" />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={(nextOpen) => {
        if (pending) return;
        setOpen(nextOpen);
        if (!nextOpen) setError("");
      }}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{label}租户</DialogTitle>
            <DialogDescription>
              确认要{label}「{tenant.name}」吗？该操作会影响租户后台访问策略。
            </DialogDescription>
          </DialogHeader>
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="button" disabled={pending} onClick={run}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              确认{label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
