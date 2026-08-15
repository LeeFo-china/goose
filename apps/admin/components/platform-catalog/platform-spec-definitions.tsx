"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

import {
  createPlatformSpecDefinition,
  loadPlatformSpecDefinitions,
  type PlatformSpecDefinition,
} from "./platform-catalog-api";

const VALUE_TYPE_OPTIONS = [
  { value: "text", label: "文本" },
  { value: "number", label: "数值" },
  { value: "boolean", label: "布尔" },
  { value: "single_enum", label: "单选枚举" },
  { value: "multi_enum", label: "多选枚举" },
  { value: "date", label: "日期" },
];

export function PlatformSpecDefinitions({ categoryId }: { categoryId: string }) {
  const [specs, setSpecs] = useState<PlatformSpecDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!categoryId) return;
    let active = true;
    setLoading(true);
    setError(null);
    loadPlatformSpecDefinitions(categoryId).then((page) => {
      if (active) setSpecs(page.list);
    }).catch((caught) => {
      if (active) setError(caught instanceof Error ? caught.message : "加载失败");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [categoryId, reload]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between p-4">
        <div className="text-sm font-medium">规格模板</div>
        <Button type="button" size="sm" onClick={() => setCreating(true)}>
          新增规格
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-4"><Skeleton className="h-12 w-full" /></div>
        ) : error ? (
          <div className="p-4 text-sm text-muted-foreground">{error}</div>
        ) : specs.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">暂无规格模板</div>
        ) : (
          <ul className="divide-y text-sm">
            {specs.map((spec) => (
              <li key={spec.id} className="flex items-center gap-3 p-3">
                <span className="font-medium">{spec.name}</span>
                <span className="text-muted-foreground">{spec.code}</span>
                <span className="text-muted-foreground">
                  {VALUE_TYPE_OPTIONS.find((item) => item.value === spec.value_type)
                    ?.label ?? spec.value_type}
                </span>
                {spec.unit_dimension ? (
                  <span className="text-muted-foreground">
                    计量维度：{spec.unit_dimension}
                  </span>
                ) : null}
                {spec.required ? <span>必填</span> : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {creating ? (
        <SpecDefinitionCreateDialog
          categoryId={categoryId}
          onClose={() => setCreating(false)}
          onSaved={() => setReload((current) => current + 1)}
        />
      ) : null}
    </Card>
  );
}

function SpecDefinitionCreateDialog({
  categoryId,
  onClose,
  onSaved,
}: {
  categoryId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [valueType, setValueType] = useState("text");
  const [required, setRequired] = useState(false);
  const [enumOptions, setEnumOptions] = useState("");
  const [unitDimension, setUnitDimension] = useState("");
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    try {
      await createPlatformSpecDefinition(
        categoryId,
        {
          code,
          name,
          value_type: valueType,
          required,
          enum_options: enumOptions
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          unit_dimension: unitDimension.trim() || null,
          participates_in_sku_name: false,
          filterable: false,
        },
        crypto.randomUUID(),
      );
      toast.success("规格模板已新增");
      onSaved();
      onClose();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "新增失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新增规格模板</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="spec-code">规格编码</FieldLabel>
            <Input
              id="spec-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="spec-name">规格名称</FieldLabel>
            <Input
              id="spec-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="spec-value-type">值类型</FieldLabel>
            <Select value={valueType} onValueChange={setValueType}>
              <SelectTrigger id="spec-value-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VALUE_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="spec-enum-options">枚举选项（逗号分隔）</FieldLabel>
            <Input
              id="spec-enum-options"
              value={enumOptions}
              onChange={(event) => setEnumOptions(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="spec-unit-dimension">计量维度（可选）</FieldLabel>
            <Input
              id="spec-unit-dimension"
              value={unitDimension}
              onChange={(event) => setUnitDimension(event.target.value)}
            />
          </Field>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="spec-required">必填</FieldLabel>
            <Switch
              id="spec-required"
              checked={required}
              onCheckedChange={setRequired}
            />
          </Field>
          <Button type="button" disabled={pending} onClick={save}>
            {pending ? "保存中..." : "保存"}
          </Button>
        </FieldGroup>
      </DialogContent>
    </Dialog>
  );
}
