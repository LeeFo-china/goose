"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit3, Eye, Loader2, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { ConfirmActionDialog } from "@/components/admin/action-dialogs";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";
import { CustomerDetailDialog } from "@/components/customers/customer-detail-dialog";
import { CustomerDialog } from "@/components/customers/customer-form-dialog";
import type { CustomerRecord } from "@/components/customers/customer-mutation-types";
import { requestCustomer } from "@/components/customers/customer-mutation-shared";

export type { CustomerFollowUpRecord, CustomerLatestProjectSummary, CustomerRecord } from "@/components/customers/customer-mutation-types";

export function CreateCustomerButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus />
        新增客户
      </Button>
      <CustomerDialog mode="create" open={open} onOpenChange={setOpen} />
    </>
  );
}

export function CustomerRowActions({ customer }: { customer: CustomerRecord }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [detail, setDetail] = useState<CustomerRecord | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const disabled = pending || customer.status === "invalid";

  function openDetail() {
    setError("");
    startTransition(async () => {
      try {
        const data = await requestCustomer({
          path: `/customers/${customer.id}/detail?include_activity=1`,
        });
        setDetail(data as CustomerRecord);
      } catch (err) {
        setError(err instanceof Error ? err.message : "详情加载失败");
      }
    });
  }

  function deleteCustomer() {
    setError("");
    startTransition(async () => {
      try {
        await requestCustomer({
          path: `/customers/${customer.id}`,
          method: "DELETE",
        });
        setDeleteOpen(false);
        refreshAfterDialogClose(router);
      } catch (err) {
        setError(err instanceof Error ? err.message : "作废失败");
      }
    });
  }

  return (
    <div className="relative flex min-w-24 justify-end whitespace-nowrap">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={pending}>
            {pending ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <MoreHorizontal data-icon="inline-start" />
            )}
            操作
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="left" sideOffset={8} className="w-36">
          <DropdownMenuGroup>
            <DropdownMenuItem disabled={pending} onSelect={openDetail}>
              <Eye />
              详情
            </DropdownMenuItem>
            <DropdownMenuItem disabled={disabled} onSelect={() => setEditOpen(true)}>
              <Edit3 />
              编辑
            </DropdownMenuItem>
            <DropdownMenuItem disabled={disabled} onSelect={() => setDeleteOpen(true)}>
              <Trash2 />
              作废
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <CustomerDialog
        mode="edit"
        customer={customer}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      {detail ? <CustomerDetailDialog customer={detail} onClose={() => setDetail(null)} /> : null}
      <ConfirmActionDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="作废客户"
        description={`确认作废客户「${customer.name || customer.phone_masked || customer.id}」？`}
        confirmLabel="确认作废"
        destructive
        pending={pending}
        onConfirm={deleteCustomer}
      />
      {error ? (
        <div className="absolute right-5 mt-10 max-w-[360px] rounded-md border border-destructive/50 bg-background px-3 py-2 text-xs text-destructive shadow-sm">
          {error}
        </div>
      ) : null}
    </div>
  );
}
