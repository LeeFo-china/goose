"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  createMaterialNoteCategory,
  getMaterialNoteErrorMessage,
  listMaterialNoteCategories,
} from "@/components/douyin-miniapp/material-note-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type MaterialNoteCategoryOption = {
  id: string;
  name: string;
};

type MaterialNoteCategorySelection = {
  id: string;
  name: string;
};

export function MaterialNoteCategorySelect({
  categoryId,
  categoryName,
  disabled,
  invalid,
  onChange,
}: {
  categoryId?: string | null;
  categoryName: string;
  disabled?: boolean;
  invalid?: boolean;
  onChange: (category: MaterialNoteCategorySelection) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [options, setOptions] = useState<MaterialNoteCategoryOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const selectedValue = categoryId ?? "";

  const visibleOptions = useMemo(() => {
    if (!categoryId || !categoryName) return options;
    if (options.some((option) => option.id === categoryId)) return options;
    return [{ id: categoryId, name: categoryName }, ...options];
  }, [categoryId, categoryName, options]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listMaterialNoteCategories({
      page: 1,
      pageSize: 20,
      keyword: keyword.trim(),
      status: "active",
    }).then((result) => {
      if (cancelled) return;
      setOptions(result.list.map((item) => ({ id: item.id, name: item.name })));
    }).catch((error) => {
      if (cancelled) return;
      toast.error(getMaterialNoteErrorMessage(error, "资料分类加载失败"));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [keyword]);

  async function createCategory() {
    const name = (keyword || categoryName).trim();
    if (!name) {
      toast.error("请输入分类名称");
      return;
    }
    setCreating(true);
    try {
      const category = await createMaterialNoteCategory({
        name,
        description: null,
        sort_order: 0,
      });
      setOptions((current) => [
        { id: category.id, name: category.name },
        ...current.filter((item) => item.id !== category.id),
      ]);
      setKeyword("");
      onChange({ id: category.id, name: category.name });
      toast.success("资料分类已创建");
    } catch (error) {
      toast.error(getMaterialNoteErrorMessage(error, "创建资料分类失败"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Select
        value={selectedValue}
        disabled={disabled || loading}
        onValueChange={(value) => {
          const option = visibleOptions.find((item) => item.id === value);
          if (option) onChange(option);
        }}
      >
        <SelectTrigger
          id="material-category"
          aria-invalid={invalid}
          aria-describedby="material-category-error"
        >
          <SelectValue placeholder={loading ? "正在加载分类" : "请选择资料分类"} />
        </SelectTrigger>
        <SelectContent>
          {visibleOptions.length > 0
            ? visibleOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}
              </SelectItem>
            ))
            : <SelectItem value="__empty__" disabled>暂无分类</SelectItem>}
        </SelectContent>
      </Select>
      <div className="flex gap-2">
        <Input
          value={keyword}
          maxLength={100}
          placeholder="搜索或输入新分类名称"
          disabled={disabled || creating}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          disabled={disabled || creating || loading}
          onClick={createCategory}
        >
          {creating ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
          新建分类
        </Button>
      </div>
    </div>
  );
}
