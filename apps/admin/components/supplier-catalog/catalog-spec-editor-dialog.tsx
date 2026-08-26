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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
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
  initializeCatalogCreateIntent,
  resolveCatalogCreateIntent,
} from "./supplier-catalog-rules";
import type {
  CatalogCreateIntent,
  CatalogSpecDefinition,
  CatalogSpecValueType,
} from "./supplier-catalog-types";
import { buildPlatformSpecCommand } from "./supplier-catalog-v2-requests";
import { buildTenantSpecCommand } from "../tenant-supplier-catalog/tenant-catalog-requests";

export type CatalogSpecScope = "platform" | "tenant";

const valueTypeLabels: Record<CatalogSpecValueType, string> = {
  text: "文本",
  number: "数值",
  boolean: "布尔",
  single_enum: "单选枚举",
  multi_enum: "多选枚举",
  date: "日期",
};

export function CatalogSpecEditorDialog({
  scope,
  categoryId,
  record,
  open,
  onOpenChange,
  onSaved,
}: {
  scope: CatalogSpecScope;
  categoryId: string;
  record: CatalogSpecDefinition | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const intentRef = useRef<CatalogCreateIntent | null>(null);
  const [pending, setPending] = useState(false);
  const [code, setCode] = useState(record?.code ?? "");
  const [name, setName] = useState(record?.name ?? "");
  const [valueType, setValueType] = useState<CatalogSpecValueType>(
    record?.value_type ?? "text",
  );
  const [enumOptions, setEnumOptions] = useState(
    record?.enum_options.join("，") ?? "",
  );
  const [unitDimension, setUnitDimension] = useState(record?.unit_dimension ?? "");
  const [isRequired, setIsRequired] = useState(record?.is_required ?? false);
  const [inSkuName, setInSkuName] = useState(
    record?.participates_in_sku_name ?? false,
  );
  const [isFilterable, setIsFilterable] = useState(record?.is_filterable ?? false);
  const [sortOrder, setSortOrder] = useState(String(record?.sort_order ?? 100));
  const showCodeField = scope === "platform";

  function reset() {
    setCode(record?.code ?? "");
    setName(record?.name ?? "");
    setValueType(record?.value_type ?? "text");
    setEnumOptions(record?.enum_options.join("，") ?? "");
    setUnitDimension(record?.unit_dimension ?? "");
    setIsRequired(record?.is_required ?? false);
    setInSkuName(record?.participates_in_sku_name ?? false);
    setIsFilterable(record?.is_filterable ?? false);
    setSortOrder(String(record?.sort_order ?? 100));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const isEnum = valueType === "single_enum" || valueType === "multi_enum";
    const payload = {
      ...(record ? { expected_version: record.version } : {}),
      ...(showCodeField ? { code: code.trim() } : {}),
      name: name.trim(),
      value_type: valueType,
      enum_options: isEnum
        ? enumOptions.split(/[，,\n]/u).map((item) => item.trim()).filter(Boolean)
        : [],
      unit_dimension: valueType === "number" ? unitDimension.trim() || null : null,
      is_required: isRequired,
      participates_in_sku_name: inSkuName,
      is_filterable: isFilterable,
      sort_order: Number(sortOrder),
      status: record?.status ?? "active",
    };
    const intent = resolveCatalogCreateIntent(
      intentRef.current,
      payload,
      () => `catalog-${scope}-spec:${crypto.randomUUID()}`,
    );
    intentRef.current = intent;
    const request = scope === "platform"
      ? buildPlatformSpecCommand({
          categoryId,
          definitionId: record?.id,
          payload,
          idempotencyKey: intent.key,
        })
      : buildTenantSpecCommand({
          categoryId,
          definitionId: record?.id,
          payload,
          idempotencyKey: intent.key,
        });
    setPending(true);
    try {
      await requestBackendJson(request.path, {
        ...request.init,
        fallbackMessage: "保存规格定义失败",
      });
      toast.success(record ? "规格定义已保存" : "规格定义已创建");
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存规格定义失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (pending) return;
        if (value) {
          reset();
          intentRef.current = initializeCatalogCreateIntent(
            () => `catalog-${scope}-spec:${crypto.randomUUID()}`,
          );
        } else {
          intentRef.current = null;
        }
        onOpenChange(value);
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{record ? "编辑规格" : "新建规格"}</DialogTitle>
          <DialogDescription>结构化规格用于商品校验、筛选和 SKU 命名。</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            {showCodeField ? (
              <Field>
                <FieldLabel htmlFor="catalog-spec-code">规格编码</FieldLabel>
                <Input id="catalog-spec-code" required maxLength={64} value={code} onChange={(event) => setCode(event.target.value)} />
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="catalog-spec-name">规格名称</FieldLabel>
              <Input id="catalog-spec-name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel>值类型</FieldLabel>
              <Select value={valueType} onValueChange={(value) => setValueType(value as CatalogSpecValueType)}>
                <SelectTrigger aria-label="值类型"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>
                  {Object.entries(valueTypeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectGroup></SelectContent>
              </Select>
            </Field>
            {valueType === "single_enum" || valueType === "multi_enum" ? (
              <Field>
                <FieldLabel htmlFor="catalog-spec-options">枚举选项</FieldLabel>
                <Input id="catalog-spec-options" required value={enumOptions} onChange={(event) => setEnumOptions(event.target.value)} placeholder="用逗号分隔" />
              </Field>
            ) : null}
            {valueType === "number" ? (
              <Field>
                <FieldLabel htmlFor="catalog-spec-dimension">计量维度</FieldLabel>
                <Input id="catalog-spec-dimension" value={unitDimension} onChange={(event) => setUnitDimension(event.target.value)} />
              </Field>
            ) : null}
            <BooleanField label="必填规格" checked={isRequired} onCheckedChange={setIsRequired} />
            <BooleanField label="参与 SKU 命名" checked={inSkuName} onCheckedChange={setInSkuName} />
            <BooleanField label="可用于筛选" checked={isFilterable} onCheckedChange={setIsFilterable} />
            <Field>
              <FieldLabel htmlFor="catalog-spec-sort">排序</FieldLabel>
              <Input id="catalog-spec-sort" type="number" required value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} />
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>取消编辑</Button>
            <Button type="submit" disabled={pending}>{pending ? "正在保存" : "保存规格"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BooleanField({ label, checked, onCheckedChange }: { label: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <Field orientation="horizontal" className="justify-between rounded-md border p-3">
      <FieldLabel>{label}</FieldLabel>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </Field>
  );
}
