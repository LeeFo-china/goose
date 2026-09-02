"use client";

import { useState } from "react";
import { Tags } from "lucide-react";
import { toast } from "sonner";

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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

import {
  deleteCostCategoryRule,
  loadCostCategoryOptions,
  loadCostCategoryRule,
  saveCostCategoryRule,
} from "./supplier-cost-category-api";
import type {
  SupplierCostCategoryOption,
  SupplierCostCategoryRule,
  SupplierCostCategoryRuleScope,
} from "./supplier-cost-category-types";

export function CostCategoryRuleDialog({
  scope,
  targetId,
  targetName,
  onSaved,
}: {
  scope: SupplierCostCategoryRuleScope;
  targetId: string;
  targetName: string;
  onSaved?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [options, setOptions] = useState<SupplierCostCategoryOption[]>([]);
  const [rule, setRule] = useState<SupplierCostCategoryRule | null>(null);
  const [costCategoryId, setCostCategoryId] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [optionPage, currentRule] = await Promise.all([
        loadCostCategoryOptions(),
        loadCostCategoryRule(scope, targetId),
      ]);
      setOptions(optionPage.list);
      setRule(currentRule);
      setCostCategoryId(currentRule?.cost_category_id ?? "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "成本归类加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!costCategoryId) return;
    setSaving(true);
    try {
      await saveCostCategoryRule({
        scope,
        targetId,
        costCategoryId,
        expectedVersion: rule?.version ?? 0,
      });
      toast.success(scope === "category" ? "分类默认归类已保存" : "商品归类覆盖已保存");
      setOpen(false);
      await onSaved?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "成本归类保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function restoreInheritance() {
    if (!rule) return;
    setSaving(true);
    try {
      await deleteCostCategoryRule({
        scope,
        targetId,
        expectedVersion: rule.version,
      });
      toast.success(scope === "category" ? "已恢复继承上级分类" : "已恢复随商品分类");
      setOpen(false);
      await onSaved?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "恢复继承失败");
    } finally {
      setSaving(false);
    }
  }

  const description = scope === "category"
    ? "采购时自动归入该成本分类；未单独设置的下级分类会继承此配置。"
    : "仅在该商品需要特殊核算时设置；不设置则自动沿用商品分类。";

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (saving) return;
        setOpen(nextOpen);
        if (nextOpen) void load();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="ghost">
          <Tags data-icon="inline-start" />
          成本归类
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{scope === "category" ? "设置分类默认归类" : "设置商品归类覆盖"}</DialogTitle>
          <DialogDescription>{targetName}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor={`cost-category-${scope}-${targetId}`}>
            成本分类
          </FieldLabel>
          <Select
            value={costCategoryId}
            onValueChange={setCostCategoryId}
            disabled={loading || saving}
          >
            <SelectTrigger id={`cost-category-${scope}-${targetId}`}>
              <SelectValue placeholder={loading ? "正在加载" : "请选择成本分类"} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>{description}</FieldDescription>
        </Field>
        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {rule ? (
              <Button
                type="button"
                variant="ghost"
                disabled={saving}
                onClick={() => void restoreInheritance()}
              >
                恢复继承
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="button" disabled={loading || saving || !costCategoryId} onClick={() => void save()}>
              {saving ? <Spinner data-icon="inline-start" /> : null}
              保存
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
