"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
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
import { requestBackendJson } from "@/lib/backend-client";

import {
  buildUnitRelationshipPayload,
  isCatalogVersionConflict,
  newCatalogIdempotencyKey,
} from "./supplier-catalog-rules";
import type {
  CatalogBrand,
  CatalogCategory,
  CatalogRecordKind,
  CatalogUnit,
} from "./supplier-catalog-types";

function Trigger({
  editing,
  label,
}: {
  editing: boolean;
  label: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={editing ? "ghost" : "default"}
    >
      {editing
        ? <Pencil data-icon="inline-start" />
        : <Plus data-icon="inline-start" />}
      {label}
    </Button>
  );
}

function ConflictAlert({ onRefresh }: { onRefresh: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>数据版本已变化</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <p>其他人已更新这条数据，请刷新后重新检查本次修改。</p>
        <Button type="button" size="sm" variant="outline" onClick={onRefresh}>
          刷新最新数据
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function requestOptions(
  kind: CatalogRecordKind,
  editing: boolean,
  body: Record<string, unknown>,
) {
  return {
    method: editing ? "PATCH" : "POST",
    headers: editing
      ? undefined
      : { "Idempotency-Key": newCatalogIdempotencyKey(kind) },
    body: JSON.stringify(body),
  };
}

export function CatalogCategoryDialogButton({
  record,
  parentId,
  parentName,
  parentLevel,
}: {
  record?: CatalogCategory;
  parentId: string | null;
  parentName: string;
  parentLevel: number;
}) {
  const router = useRouter();
  const editing = Boolean(record);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [code, setCode] = useState(record?.code ?? "");
  const [name, setName] = useState(record?.name ?? "");
  const [sortOrder, setSortOrder] = useState(String(record?.sort_order ?? 100));

  function reset() {
    setCode(record?.code ?? "");
    setName(record?.name ?? "");
    setSortOrder(String(record?.sort_order ?? 100));
    setConflict(false);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setConflict(false);
    const body = {
      ...(record
        ? { expected_version: record.version }
        : {
            parent_id: parentId,
            level: parentLevel + 1,
            status: "active",
          }),
      code: code.trim(),
      name: name.trim(),
      sort_order: Number(sortOrder),
    };
    try {
      await requestBackendJson(
        record
          ? `/platform/catalog/categories/${record.id}`
          : "/platform/catalog/categories",
        {
          ...requestOptions("category", editing, body),
          fallbackMessage: editing ? "保存标准类目失败" : "新建标准类目失败",
        },
      );
      toast.success(editing ? "标准类目已保存" : "标准类目已创建");
      setOpen(false);
      router.refresh();
    } catch (error) {
      if (isCatalogVersionConflict(error)) {
        setConflict(true);
      } else {
        toast.error(error instanceof Error ? error.message : "保存标准类目失败");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => {
      if (value) reset();
      if (!pending) setOpen(value);
    }}>
      <DialogTrigger asChild>
        <Trigger editing={editing} label={editing ? "编辑" : "新建类目"} />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "编辑标准类目" : "新建标准类目"}</DialogTitle>
          <DialogDescription>
            当前上级：{record ? parentName || "根级" : parentName}，层级由当前位置确定。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`category-code-${record?.id ?? "new"}`}>编码</FieldLabel>
              <Input id={`category-code-${record?.id ?? "new"}`} required maxLength={64} value={code} onChange={(event) => setCode(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor={`category-name-${record?.id ?? "new"}`}>名称</FieldLabel>
              <Input id={`category-name-${record?.id ?? "new"}`} required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor={`category-sort-${record?.id ?? "new"}`}>排序</FieldLabel>
              <Input id={`category-sort-${record?.id ?? "new"}`} type="number" required value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} />
            </Field>
            {conflict ? <ConflictAlert onRefresh={() => {
              setOpen(false);
              router.refresh();
            }} /> : null}
          </FieldGroup>
          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>取消编辑</Button>
            <Button type="submit" disabled={pending || conflict}>{pending ? "正在保存" : "保存类目"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CatalogBrandDialogButton({ record }: { record?: CatalogBrand }) {
  const router = useRouter();
  const editing = Boolean(record);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [code, setCode] = useState(record?.code ?? "");
  const [name, setName] = useState(record?.name ?? "");
  const [legalName, setLegalName] = useState(record?.legal_name ?? "");
  const [sortOrder, setSortOrder] = useState(String(record?.sort_order ?? 100));

  function reset() {
    setCode(record?.code ?? "");
    setName(record?.name ?? "");
    setLegalName(record?.legal_name ?? "");
    setSortOrder(String(record?.sort_order ?? 100));
    setConflict(false);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setConflict(false);
    const body = {
      ...(record ? { expected_version: record.version } : { status: "active" }),
      code: code.trim(),
      name: name.trim(),
      legal_name: legalName.trim() || null,
      sort_order: Number(sortOrder),
    };
    try {
      await requestBackendJson(
        record ? `/platform/catalog/brands/${record.id}` : "/platform/catalog/brands",
        {
          ...requestOptions("brand", editing, body),
          fallbackMessage: editing ? "保存品牌失败" : "新建品牌失败",
        },
      );
      toast.success(editing ? "品牌已保存" : "品牌已创建");
      setOpen(false);
      router.refresh();
    } catch (error) {
      if (isCatalogVersionConflict(error)) setConflict(true);
      else toast.error(error instanceof Error ? error.message : "保存品牌失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => {
      if (value) reset();
      if (!pending) setOpen(value);
    }}>
      <DialogTrigger asChild><Trigger editing={editing} label={editing ? "编辑" : "新建品牌"} /></DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "编辑品牌" : "新建品牌"}</DialogTitle>
          <DialogDescription>维护统一品牌名称，法定名称可留空。</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field><FieldLabel htmlFor={`brand-code-${record?.id ?? "new"}`}>编码</FieldLabel><Input id={`brand-code-${record?.id ?? "new"}`} required maxLength={64} value={code} onChange={(event) => setCode(event.target.value)} /></Field>
            <Field><FieldLabel htmlFor={`brand-name-${record?.id ?? "new"}`}>品牌</FieldLabel><Input id={`brand-name-${record?.id ?? "new"}`} required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></Field>
            <Field><FieldLabel htmlFor={`brand-legal-${record?.id ?? "new"}`}>法定名称</FieldLabel><Input id={`brand-legal-${record?.id ?? "new"}`} maxLength={160} value={legalName} onChange={(event) => setLegalName(event.target.value)} /></Field>
            <Field><FieldLabel htmlFor={`brand-sort-${record?.id ?? "new"}`}>排序</FieldLabel><Input id={`brand-sort-${record?.id ?? "new"}`} type="number" required value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} /></Field>
            {conflict ? <ConflictAlert onRefresh={() => { setOpen(false); router.refresh(); }} /> : null}
          </FieldGroup>
          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>取消编辑</Button>
            <Button type="submit" disabled={pending || conflict}>{pending ? "正在保存" : "保存品牌"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CatalogUnitDialogButton({
  record,
  baseUnits,
}: {
  record?: CatalogUnit;
  baseUnits: CatalogUnit[];
}) {
  const router = useRouter();
  const editing = Boolean(record);
  const initialMode = record?.base_unit_id ? "derived" : "base";
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [code, setCode] = useState(record?.code ?? "");
  const [name, setName] = useState(record?.name ?? "");
  const [symbol, setSymbol] = useState(record?.symbol ?? "");
  const [mode, setMode] = useState<"base" | "derived">(initialMode);
  const [baseUnitId, setBaseUnitId] = useState(record?.base_unit_id ?? "");
  const [conversionFactor, setConversionFactor] = useState(record?.conversion_factor ?? "1");
  const [sortOrder, setSortOrder] = useState(String(record?.sort_order ?? 100));

  function reset() {
    setCode(record?.code ?? "");
    setName(record?.name ?? "");
    setSymbol(record?.symbol ?? "");
    setMode(initialMode);
    setBaseUnitId(record?.base_unit_id ?? "");
    setConversionFactor(record?.conversion_factor ?? "1");
    setSortOrder(String(record?.sort_order ?? 100));
    setConflict(false);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const relationship = buildUnitRelationshipPayload({
      mode,
      baseUnitId,
      conversionFactor,
    });
    setPending(true);
    setConflict(false);
    try {
      await requestBackendJson(
        record ? `/platform/catalog/units/${record.id}` : "/platform/catalog/units",
        {
          ...requestOptions("unit", editing, {
            ...(record ? { expected_version: record.version } : { status: "active" }),
            code: code.trim(),
            name: name.trim(),
            symbol: symbol.trim(),
            ...relationship,
            sort_order: Number(sortOrder),
          }),
          fallbackMessage: editing ? "保存单位失败" : "新建单位失败",
        },
      );
      toast.success(editing ? "单位已保存" : "单位已创建");
      setOpen(false);
      router.refresh();
    } catch (error) {
      if (isCatalogVersionConflict(error)) setConflict(true);
      else toast.error(error instanceof Error ? error.message : "保存单位失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => {
      if (value) reset();
      if (!pending) setOpen(value);
    }}>
      <DialogTrigger asChild><Trigger editing={editing} label={editing ? "编辑" : "新建单位"} /></DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "编辑单位" : "新建单位"}</DialogTitle>
          <DialogDescription>基准单位系数固定为 1，派生单位按精确十进制字符串换算。</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field><FieldLabel htmlFor={`unit-code-${record?.id ?? "new"}`}>编码</FieldLabel><Input id={`unit-code-${record?.id ?? "new"}`} required maxLength={64} value={code} onChange={(event) => setCode(event.target.value)} /></Field>
            <Field><FieldLabel htmlFor={`unit-name-${record?.id ?? "new"}`}>名称</FieldLabel><Input id={`unit-name-${record?.id ?? "new"}`} required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></Field>
            <Field><FieldLabel htmlFor={`unit-symbol-${record?.id ?? "new"}`}>符号</FieldLabel><Input id={`unit-symbol-${record?.id ?? "new"}`} required maxLength={32} value={symbol} onChange={(event) => setSymbol(event.target.value)} /></Field>
            <Field>
              <FieldLabel htmlFor={`unit-mode-${record?.id ?? "new"}`}>单位类型</FieldLabel>
              <Select value={mode} onValueChange={(value) => {
                const nextMode = value as "base" | "derived";
                setMode(nextMode);
                if (nextMode === "base") setConversionFactor("1");
              }}>
                <SelectTrigger id={`unit-mode-${record?.id ?? "new"}`}><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup><SelectItem value="base">基准单位</SelectItem><SelectItem value="derived">派生单位</SelectItem></SelectGroup></SelectContent>
              </Select>
              <FieldDescription>派生单位必须选择一个启用的基准单位。</FieldDescription>
            </Field>
            {mode === "derived" ? (
              <>
                <Field>
                  <FieldLabel htmlFor={`unit-base-${record?.id ?? "new"}`}>基准单位</FieldLabel>
                  <Select required value={baseUnitId} onValueChange={setBaseUnitId}>
                    <SelectTrigger id={`unit-base-${record?.id ?? "new"}`}><SelectValue placeholder="选择当前页基准单位" /></SelectTrigger>
                    <SelectContent><SelectGroup>{baseUnits.map((unit) => <SelectItem key={unit.id} value={unit.id}>{unit.name}（{unit.symbol}）</SelectItem>)}</SelectGroup></SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`unit-factor-${record?.id ?? "new"}`}>换算系数</FieldLabel>
                  <Input id={`unit-factor-${record?.id ?? "new"}`} inputMode="decimal" required pattern="\d+(?:\.\d+)?" value={conversionFactor} onChange={(event) => setConversionFactor(event.target.value)} />
                  <FieldDescription>最多 18 位有效数字，其中小数最多 6 位。</FieldDescription>
                </Field>
              </>
            ) : null}
            <Field><FieldLabel htmlFor={`unit-sort-${record?.id ?? "new"}`}>排序</FieldLabel><Input id={`unit-sort-${record?.id ?? "new"}`} type="number" required value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} /></Field>
            {conflict ? <ConflictAlert onRefresh={() => { setOpen(false); router.refresh(); }} /> : null}
          </FieldGroup>
          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>取消编辑</Button>
            <Button type="submit" disabled={pending || conflict || (mode === "derived" && !baseUnitId)}>{pending ? "正在保存" : "保存单位"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
