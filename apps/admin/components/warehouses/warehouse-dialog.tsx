"use client";

import { useEffect, useState } from "react";

import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import {
  hasWarehouseDraftErrors,
  normalizeWarehouseDraft,
  validateWarehouseDraft,
} from "./warehouse-rules";
import type {
  Warehouse,
  WarehouseCreateRequest,
  WarehouseDraft,
  WarehouseDraftErrors,
  WarehouseUpdateRequest,
} from "./warehouse-types";

type WarehouseDialogProps = {
  open: boolean;
  warehouse: Warehouse | null;
  submitting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onCreate: (payload: WarehouseCreateRequest) => Promise<void>;
  onUpdate: (payload: WarehouseUpdateRequest) => Promise<void>;
};

const emptyDraft: WarehouseDraft = {
  name: "",
  address: "",
  contactName: "",
  contactPhone: "",
  managerEmployeeId: "",
  isDefault: false,
};

export function WarehouseDialog({
  open,
  warehouse,
  submitting,
  error,
  onOpenChange,
  onCreate,
  onUpdate,
}: WarehouseDialogProps) {
  const [draft, setDraft] = useState<WarehouseDraft>(emptyDraft);
  const [errors, setErrors] = useState<WarehouseDraftErrors>({});

  useEffect(() => {
    if (!open) return;
    setDraft(warehouse
      ? {
        name: warehouse.name,
        address: warehouse.address ?? "",
        contactName: warehouse.contact_name ?? "",
        contactPhone: warehouse.contact_phone ?? "",
        managerEmployeeId: warehouse.manager_employee_id ?? "",
        isDefault: warehouse.is_default,
      }
      : emptyDraft);
    setErrors({});
  }, [open, warehouse]);

  async function handleSubmit() {
    const nextErrors = validateWarehouseDraft(draft);
    setErrors(nextErrors);
    if (hasWarehouseDraftErrors(nextErrors)) return;
    const normalized = normalizeWarehouseDraft(draft);
    if (warehouse) {
      await onUpdate({
        expected_version: warehouse.version,
        ...normalized,
      });
    } else {
      await onCreate(normalized);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{warehouse ? "编辑仓库" : "新增仓库"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          <div className="grid gap-2">
            <Label htmlFor="warehouse-name">仓库名称</Label>
            <Input
              id="warehouse-name"
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  name: event.target.value,
                }))}
              placeholder="例如：公司主仓"
            />
            {errors.name ? (
              <p className="text-xs text-destructive">{errors.name}</p>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="warehouse-address">地址</Label>
            <Textarea
              id="warehouse-address"
              value={draft.address ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  address: event.target.value,
                }))}
              placeholder="仓库收货地址"
            />
            {errors.address ? (
              <p className="text-xs text-destructive">{errors.address}</p>
            ) : null}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="warehouse-contact-name">联系人</Label>
              <Input
                id="warehouse-contact-name"
                value={draft.contactName ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    contactName: event.target.value,
                  }))}
                placeholder="仓库联系人"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="warehouse-contact-phone">联系电话</Label>
              <Input
                id="warehouse-contact-phone"
                value={draft.contactPhone ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    contactPhone: event.target.value,
                  }))}
                placeholder="手机号或座机"
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label htmlFor="warehouse-default">设为默认</Label>
            <Switch
              id="warehouse-default"
              checked={draft.isDefault ?? false}
              disabled={warehouse?.is_default || submitting}
              onCheckedChange={(checked) =>
                setDraft((current) => ({
                  ...current,
                  isDefault: checked,
                }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
