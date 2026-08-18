"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

import {
  buildProductResourcePath,
  buildSkuResourcePath,
  mutateSupplierResource,
} from "./supplier-product-api";
import {
  resolveSupplierCommandAttempt,
  type SupplierCommandAttempt,
} from "./supplier-command-attempt";
import type { ProductApiScope } from "./supplier-product-types";

export type MutationTarget = ({
  id: string;
  name: string;
  action: "activate" | "deactivate";
  version: number;
} & (
  | { kind: "product" }
  | { kind: "sku"; supplierProductId: string }
)) | null;

export function SupplierStatusDialog({
  target,
  scope,
  onOpenChange,
  onChanged,
}: {
  target: MutationTarget;
  scope: ProductApiScope;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void | Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const attemptRef = useRef<SupplierCommandAttempt | null>(null);
  if (!target) return null;

  async function submit() {
    if (!target) return;
    setSaving(true);
    const base = target.kind === "product"
      ? buildProductResourcePath(scope, target.id)
      : buildSkuResourcePath(scope, target.supplierProductId, target.id);
    const path = `${base}/${target.action}`;
    const payload = { expected_version: target.version };
    try {
      const attempt = resolveSupplierCommandAttempt(attemptRef.current, {
        scope: `${scope.kind}-supplier-${target.kind}-${target.action}`,
        resourcePath: path,
        payload,
      });
      attemptRef.current = attempt;
      await mutateSupplierResource(path, scope, payload, attempt.idempotencyKey);
      attemptRef.current = null;
      toast.success(target.action === "activate" ? "已启用" : "已停用");
      onOpenChange(false);
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "状态变更失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{target.action === "activate" ? "启用" : "停用"} {target.name}</DialogTitle>
          <DialogDescription>
            此操作使用当前版本 v{target.version}，版本冲突时请刷新后重试。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button type="button" disabled={saving} onClick={() => void submit()}>
            {saving ? <Spinner data-icon="inline-start" /> : null}
            确认{target.action === "activate" ? "启用" : "停用"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
