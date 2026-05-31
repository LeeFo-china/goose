"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Image, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { CaseListItem, ProjectCaseOption, ProjectCaseOptionPagination } from "@/components/marketing/h5-page-editor-types";
import { PROJECT_CASE_SELECTOR_PAGE_SIZE } from "@/components/marketing/h5-page-editor-types";
import { fetchProjectCaseOptions } from "@/components/marketing/h5-page-editor-api";
import { CaseImageCarouselPreview } from "@/components/marketing/h5-page-editor-preview";
import { moveCaseItem, normalizeCaseImageUrls, parseCaseItems, previewImage } from "@/components/marketing/h5-page-editor-block-utils";

export function ProjectCaseSelector({
  items,
  onChange,
}: {
  items: CaseListItem[];
  onChange: (items: CaseListItem[]) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [options, setOptions] = useState<ProjectCaseOption[]>([]);
  const [pagination, setPagination] = useState<ProjectCaseOptionPagination>({
    page: 1,
    pageSize: PROJECT_CASE_SELECTOR_PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    fetchProjectCaseOptions("", 1)
      .then((data) => {
        if (!cancelled) {
          setOptions(data.list);
          setPagination(data.pagination);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "项目案例加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const loadOptions = async (nextPage: number, nextKeyword = keyword) => {
    setLoading(true);
    try {
      const data = await fetchProjectCaseOptions(nextKeyword, nextPage);
      setOptions(data.list);
      setPagination(data.pagination);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "项目案例加载失败");
    } finally {
      setLoading(false);
    }
  };

  const searchOptions = async () => {
    await loadOptions(1, keyword);
  };

  const addOption = (option: ProjectCaseOption) => {
    const projectId = option.projectId || option.id;
    if (projectId && items.some((item) => item.projectId === projectId)) {
      toast.error("该项目已在案例列表");
      return;
    }

    onChange([
      ...items,
      {
        projectId,
        title: option.title || "未命名项目",
        subtitle: option.subtitle || "",
        imageUrl: option.imageUrl || "",
        imageUrls: normalizeCaseImageUrls(option),
      },
    ]);
  };

  return (
    <Field>
      <FieldLabel>项目案例</FieldLabel>
      <div className="flex gap-2">
        <Input
          value={keyword}
          placeholder="搜索项目名称或地址"
          onChange={(event) => setKeyword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void searchOptions();
            }
          }}
        />
        <Button type="button" variant="outline" disabled={loading} onClick={() => void searchOptions()}>
          {loading ? (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          ) : (
            <Search data-icon="inline-start" />
          )}
          搜索
        </Button>
      </div>
      <FieldDescription>
        从项目库选择后会写入当前活动页配置，每页显示 5 个项目。
      </FieldDescription>

      <div className="space-y-2 rounded-md border bg-muted/20 p-2">
        {options.length > 0 ? options.map((option) => {
          const projectId = option.projectId || option.id;
          const optionImageUrls = normalizeCaseImageUrls(option);
          const selected = Boolean(projectId && items.some((item) => item.projectId === projectId));

          return (
            <div
              key={option.id}
              className="flex items-center gap-3 rounded-md border bg-background p-2"
            >
              <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-md bg-muted text-xs text-muted-foreground">
                {optionImageUrls[0]
                  ? previewImage(optionImageUrls[0], option.title, "size-full object-cover")
                  : "无图"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{option.title || "未命名项目"}</div>
                <div className="mt-1 truncate text-xs text-muted-foreground">
                  {option.subtitle || option.status || "项目信息待补"}
                  {optionImageUrls.length > 1 ? ` · ${optionImageUrls.length}图` : ""}
                </div>
              </div>
              <Button
                type="button"
                variant={selected ? "secondary" : "outline"}
                size="sm"
                disabled={selected}
                onClick={() => addOption(option)}
              >
                <Plus data-icon="inline-start" />
                {selected ? "已添加" : "添加"}
              </Button>
            </div>
          );
        }) : (
          <div className="rounded-md border border-dashed bg-background px-3 py-6 text-center text-sm text-muted-foreground">
            {loading ? "项目加载中" : "暂无可选项目"}
          </div>
        )}
      </div>

      {pagination.totalPages > 1 ? (
        <div className="grid grid-cols-[32px_1fr_32px] items-center gap-2 rounded-md border bg-background px-2 py-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="上一页"
            disabled={loading || pagination.page <= 1}
            onClick={() => void loadOptions(Math.max(1, pagination.page - 1))}
          >
            <ArrowLeft />
          </Button>
          <div className="min-w-0 truncate text-center text-xs text-muted-foreground">
            {pagination.page}/{pagination.totalPages} · {pagination.total}个
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="下一页"
            disabled={loading || pagination.page >= pagination.totalPages}
            onClick={() => void loadOptions(Math.min(pagination.totalPages, pagination.page + 1))}
          >
            <ArrowRight />
          </Button>
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">已选案例</div>
          {items.map((item, index) => {
            const itemImageUrls = normalizeCaseImageUrls(item);
            return (
              <div
                key={`${item.projectId || item.title || "case"}-${index}`}
                className="flex items-center gap-3 rounded-md border bg-background p-2"
              >
                <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-md bg-muted text-xs text-muted-foreground">
                  {itemImageUrls[0]
                    ? previewImage(itemImageUrls[0], item.title, "size-full object-cover")
                    : "无图"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{item.title || "未命名项目"}</div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {item.subtitle || "项目信息待补"}
                    {itemImageUrls.length > 1 ? ` · ${itemImageUrls.length}图` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={index === 0}
                    onClick={() => onChange(moveCaseItem(items, index, index - 1))}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={index === items.length - 1}
                    onClick={() => onChange(moveCaseItem(items, index, index + 1))}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </Field>
  );
}
