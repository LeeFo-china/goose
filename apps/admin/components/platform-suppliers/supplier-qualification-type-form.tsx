"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { requestBackendJson } from "@/lib/backend-client";

import {
  newIdempotencyKey,
  supplierTypeOptions,
  type SupplierQualificationType,
  type SupplierRecordStatus,
  type SupplierType,
} from "./platform-supplier-types";

type QualificationTypeFormState = {
  code: string;
  name: string;
  applicableTypes: SupplierType[];
  warningDays: string;
  isRequired: boolean;
  blocksNewOrders: boolean;
  status: SupplierRecordStatus;
  sortOrder: string;
};

function initialForm(
  record?: SupplierQualificationType,
): QualificationTypeFormState {
  return record
    ? {
      code: record.code,
      name: record.name,
      applicableTypes: record.applicable_supplier_types,
      warningDays: String(record.warning_days),
      isRequired: record.is_required,
      blocksNewOrders: record.blocks_new_orders,
      status: record.status,
      sortOrder: String(record.sort_order),
    }
    : {
      code: "",
      name: "",
      applicableTypes: [],
      warningDays: "30",
      isRequired: false,
      blocksNewOrders: false,
      status: "active",
      sortOrder: "100",
    };
}

export function SupplierQualificationTypeFormButton({
  record,
  expected_version,
}: {
  record?: SupplierQualificationType;
  expected_version?: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [form, setForm] = useState(() => initialForm(record));

  function toggleSupplierType(type: SupplierType, checked: boolean) {
    setForm((current) => ({
      ...current,
      applicableTypes: checked
        ? [...current.applicableTypes, type]
        : current.applicableTypes.filter((item) => item !== type),
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setConflict(false);
    try {
      await requestBackendJson(
        record
          ? `/platform/supplier-qualification-types/${record.id}`
          : "/platform/supplier-qualification-types",
        {
          method: record ? "PATCH" : "POST",
          headers: record
            ? undefined
            : {
              "Idempotency-Key": newIdempotencyKey(
                "supplier-qualification-type-create",
              ),
            },
          body: JSON.stringify({
            ...(record
              ? { expected_version: expected_version ?? record.version }
              : {}),
            code: form.code.trim(),
            name: form.name.trim(),
            applicable_supplier_types: form.applicableTypes,
            warning_days: Number(form.warningDays),
            is_required: form.isRequired,
            blocks_new_orders: form.blocksNewOrders,
            status: form.status,
            sort_order: Number(form.sortOrder),
          }),
          fallbackMessage: record ? "保存资质类型失败" : "新增资质类型失败",
        },
      );
      toast.success(record ? "资质类型已保存" : "资质类型已创建");
      setOpen(false);
      router.refresh();
    } catch (error) {
      if ((error as { status?: number }).status === 409) {
        setConflict(true);
      } else {
        toast.error(error instanceof Error ? error.message : "保存资质类型失败");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setForm(initialForm(record));
          setConflict(false);
        }
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant={record ? "outline" : "default"}>
          {record ? (
            <Pencil data-icon="inline-start" />
          ) : (
            <Plus data-icon="inline-start" />
          )}
          {record ? "编辑资质类型" : "新增资质类型"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{record ? "编辑资质类型" : "新增资质类型"}</DialogTitle>
          <DialogDescription>
            停用后保留历史资质记录，不会删除供应商已提交的材料。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="qualification-type-code">编码</FieldLabel>
                <Input
                  id="qualification-type-code"
                  value={form.code}
                  required
                  maxLength={64}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      code: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="qualification-type-name">名称</FieldLabel>
                <Input
                  id="qualification-type-name"
                  value={form.name}
                  required
                  maxLength={120}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="qualification-warning-days">
                  到期预警天数
                </FieldLabel>
                <Input
                  id="qualification-warning-days"
                  type="number"
                  min={0}
                  max={3650}
                  value={form.warningDays}
                  required
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      warningDays: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="qualification-sort-order">排序</FieldLabel>
                <Input
                  id="qualification-sort-order"
                  type="number"
                  value={form.sortOrder}
                  required
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      sortOrder: event.target.value,
                    }))
                  }
                />
              </Field>
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">适用供应商类型</legend>
              <FieldDescription>
                不勾选表示适用于全部供应商类型。
              </FieldDescription>
              <FieldGroup className="grid gap-3 md:grid-cols-2">
                {supplierTypeOptions.map((option) => (
                  <Field
                    key={option.value}
                    className="flex-row items-center gap-2"
                  >
                    <Checkbox
                      id={`qualification-type-${option.value}`}
                      checked={form.applicableTypes.includes(option.value)}
                      onCheckedChange={(checked) =>
                        toggleSupplierType(option.value, checked === true)
                      }
                    />
                    <FieldLabel htmlFor={`qualification-type-${option.value}`}>
                      {option.label}
                    </FieldLabel>
                  </Field>
                ))}
              </FieldGroup>
            </fieldset>

            <div className="grid gap-4 md:grid-cols-2">
              <Field className="flex-row items-start gap-3 rounded-md border p-3">
                <Switch
                  id="qualification-required"
                  checked={form.isRequired}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({ ...current, isRequired: checked }))
                  }
                />
                <div className="space-y-1">
                  <FieldLabel htmlFor="qualification-required">必填资质</FieldLabel>
                  <FieldDescription>缺失时标记供应商资质风险。</FieldDescription>
                </div>
              </Field>
              <Field className="flex-row items-start gap-3 rounded-md border p-3">
                <Switch
                  id="qualification-blocks-orders"
                  checked={form.blocksNewOrders}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({
                      ...current,
                      blocksNewOrders: checked,
                    }))
                  }
                />
                <div className="space-y-1">
                  <FieldLabel htmlFor="qualification-blocks-orders">
                    阻止新订单
                  </FieldLabel>
                  <FieldDescription>资质不合格时阻止创建采购单。</FieldDescription>
                </div>
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="qualification-type-status">
                配置状态
              </FieldLabel>
              <Select
                value={form.status}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    status: value as SupplierRecordStatus,
                  }))
                }
              >
                <SelectTrigger id="qualification-type-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="active">启用</SelectItem>
                    <SelectItem value="inactive">停用并保留历史记录</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>

          {conflict ? (
            <Alert variant="destructive" className="mt-4">
              <AlertTitle>资质类型版本已变化</AlertTitle>
              <AlertDescription className="flex flex-col gap-3">
                <p>请刷新最新数据后重新编辑，避免覆盖其他人的修改。</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setOpen(false);
                    router.refresh();
                  }}
                >
                  刷新最新数据
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter className="mt-5">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              取消编辑
            </Button>
            <Button type="submit" disabled={pending || conflict}>
              {pending ? "正在保存" : "保存资质类型"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
