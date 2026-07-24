"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { BaseUnitPicker } from "./base-unit-picker";
import {
  CatalogConflictAlert,
  CatalogDialogTrigger,
} from "./catalog-dialog-shared";
import { buildCatalogMutationRequest } from "./supplier-catalog-api";
import {
  buildUnitRelationshipPayload,
  initializeCatalogCreateIntent,
  isCatalogVersionConflict,
  newCatalogIdempotencyKey,
  resolveCatalogCreateIntent,
  validateConversionFactor,
} from "./supplier-catalog-rules";
import type {
  CatalogCreateIntent,
  CatalogUnit,
} from "./supplier-catalog-types";
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
  FieldError,
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

export function CatalogUnitDialogButton({
  record,
}: {
  record?: CatalogUnit;
}) {
  const router = useRouter();
  const editing = Boolean(record);
  const initialMode = record?.base_unit_id ? "derived" : "base";
  const intentRef = useRef<CatalogCreateIntent | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [code, setCode] = useState(record?.code ?? "");
  const [name, setName] = useState(record?.name ?? "");
  const [symbol, setSymbol] = useState(record?.symbol ?? "");
  const [mode, setMode] = useState<"base" | "derived">(initialMode);
  const [baseUnitId, setBaseUnitId] = useState(record?.base_unit_id ?? "");
  const [conversionFactor, setConversionFactor] = useState(
    record?.conversion_factor ?? "1",
  );
  const [factorError, setFactorError] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState(String(record?.sort_order ?? 100));

  function reset() {
    setCode(record?.code ?? "");
    setName(record?.name ?? "");
    setSymbol(record?.symbol ?? "");
    setMode(initialMode);
    setBaseUnitId(record?.base_unit_id ?? "");
    setConversionFactor(record?.conversion_factor ?? "1");
    setFactorError(null);
    setSortOrder(String(record?.sort_order ?? 100));
    setConflict(false);
  }

  function close() {
    intentRef.current = null;
    setOpen(false);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextFactorError = mode === "derived"
      ? validateConversionFactor(conversionFactor)
      : null;
    setFactorError(nextFactorError);
    if (nextFactorError || (mode === "derived" && !baseUnitId)) return;

    const payload = {
      ...(record ? { expected_version: record.version } : { status: "active" }),
      code: code.trim(),
      name: name.trim(),
      symbol: symbol.trim(),
      ...buildUnitRelationshipPayload({
        mode,
        baseUnitId,
        conversionFactor,
      }),
      sort_order: Number(sortOrder),
    };
    setPending(true);
    setConflict(false);
    try {
      if (record) {
        await requestBackendJson(`/platform/catalog/units/${record.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
          fallbackMessage: "保存单位失败",
        });
      } else {
        const intent = resolveCatalogCreateIntent(
          intentRef.current,
          payload,
          () => newCatalogIdempotencyKey("unit"),
        );
        intentRef.current = intent;
        const request = buildCatalogMutationRequest({
          kind: "unit",
          payload,
          intent,
        });
        await requestBackendJson(request.path, {
          ...request.init,
          fallbackMessage: "新建单位失败",
        });
      }
      toast.success(editing ? "单位已保存" : "单位已创建");
      close();
      router.refresh();
    } catch (error) {
      if (isCatalogVersionConflict(error)) setConflict(true);
      else {
        toast.error(error instanceof Error ? error.message : "保存单位失败");
      }
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
          if (!record) {
            intentRef.current = initializeCatalogCreateIntent(
              () => newCatalogIdempotencyKey("unit"),
            );
          }
        } else {
          intentRef.current = null;
        }
        setOpen(value);
      }}
    >
      <DialogTrigger asChild>
        <CatalogDialogTrigger
          editing={editing}
          label={editing ? "编辑" : "新建单位"}
        />
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "编辑单位" : "新建单位"}</DialogTitle>
          <DialogDescription>
            基准单位系数固定为 1，派生单位使用精确十进制换算。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`unit-code-${record?.id ?? "new"}`}>
                编码
              </FieldLabel>
              <Input
                id={`unit-code-${record?.id ?? "new"}`}
                required
                maxLength={64}
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`unit-name-${record?.id ?? "new"}`}>
                  名称
                </FieldLabel>
                <Input
                  id={`unit-name-${record?.id ?? "new"}`}
                  required
                  maxLength={80}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`unit-symbol-${record?.id ?? "new"}`}>
                  符号
                </FieldLabel>
                <Input
                  id={`unit-symbol-${record?.id ?? "new"}`}
                  required
                  maxLength={32}
                  value={symbol}
                  onChange={(event) => setSymbol(event.target.value)}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor={`unit-mode-${record?.id ?? "new"}`}>
                单位类型
              </FieldLabel>
              <Select
                value={mode}
                onValueChange={(value) => {
                  const nextMode = value as "base" | "derived";
                  setMode(nextMode);
                  setFactorError(null);
                  if (nextMode === "base") setConversionFactor("1");
                }}
              >
                <SelectTrigger id={`unit-mode-${record?.id ?? "new"}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="base">基准单位</SelectItem>
                    <SelectItem value="derived">派生单位</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                派生单位必须关联一个启用的基准单位。
              </FieldDescription>
            </Field>
            {mode === "derived" ? (
              <>
                <Field data-invalid={!baseUnitId}>
                  <FieldLabel>基准单位</FieldLabel>
                  <BaseUnitPicker
                    value={baseUnitId}
                    pinned={record?.base_unit ?? null}
                    onChange={setBaseUnitId}
                  />
                  {!baseUnitId ? (
                    <FieldError>请选择基准单位。</FieldError>
                  ) : null}
                </Field>
                <Field data-invalid={Boolean(factorError)}>
                  <FieldLabel htmlFor={`unit-factor-${record?.id ?? "new"}`}>
                    换算系数
                  </FieldLabel>
                  <Input
                    id={`unit-factor-${record?.id ?? "new"}`}
                    inputMode="decimal"
                    required
                    aria-invalid={Boolean(factorError)}
                    value={conversionFactor}
                    onChange={(event) => {
                      const value = event.target.value;
                      setConversionFactor(value);
                      if (factorError) {
                        setFactorError(validateConversionFactor(value));
                      }
                    }}
                  />
                  <FieldDescription>
                    整数部分最多 12 位，小数部分最多 6 位，总精度最多 18 位。
                  </FieldDescription>
                  <FieldError>{factorError}</FieldError>
                </Field>
              </>
            ) : null}
            <Field>
              <FieldLabel htmlFor={`unit-sort-${record?.id ?? "new"}`}>
                排序
              </FieldLabel>
              <Input
                id={`unit-sort-${record?.id ?? "new"}`}
                type="number"
                required
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
              />
            </Field>
            {conflict ? (
              <CatalogConflictAlert onRefresh={() => {
                close();
                router.refresh();
              }} />
            ) : null}
          </FieldGroup>
          <DialogFooter className="mt-5">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={close}
            >
              取消编辑
            </Button>
            <Button
              type="submit"
              disabled={
                pending ||
                conflict ||
                (mode === "derived" && !baseUnitId)
              }
            >
              {pending ? "正在保存" : "保存单位"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
