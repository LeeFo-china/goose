"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Settings, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { FormSelect } from "@/components/admin/form-select";
import { h5PageDisplaySceneOptions } from "@/components/marketing/marketing-constants";
import type { H5MarketingPageDisplayScene, H5MarketingPageRecord } from "@/components/marketing/marketing-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";
import { buildPagePayload, buildPageUrl, DEFAULT_H5_PAGE_API_BASE_PATH, H5PageFormSchema, normalizeSlug, requestH5Page, settingsAiFieldSchema, toDateTimeLocalValue, type AiFillSettingsResponse, type AiSettingsSnapshot, type H5PageFormValues } from "@/components/marketing/h5-page-mutation-shared";

export function H5PageSettingsButton({
  page,
  pages = [],
  apiBasePath = DEFAULT_H5_PAGE_API_BASE_PATH,
  variant = "button",
  tenantSlug,
}: {
  page: H5MarketingPageRecord;
  pages?: H5MarketingPageRecord[];
  apiBasePath?: string;
  variant?: "button" | "menu";
  tenantSlug?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [aiPending, setAiPending] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiSnapshot, setAiSnapshot] = useState<AiSettingsSnapshot | null>(null);
  const [error, setError] = useState("");
  const [values, setValues] = useState<H5PageFormValues>({
    title: page.title || "",
    slug: page.slug || "",
    description: page.description || "",
    display_scene: page.display_scene || "all",
    start_at: toDateTimeLocalValue(page.start_at),
    end_at: toDateTimeLocalValue(page.end_at),
  });
  const validation = useMemo(() => H5PageFormSchema.safeParse(values), [values]);
  const firstIssue = validation.success ? null : validation.error.issues[0];

  function updateValue(key: keyof H5PageFormValues, value: string | number) {
    setError("");
    setValues((current) => ({
      ...current,
      [key]: key === "slug" && typeof value === "string" ? normalizeSlug(value) : value,
    }));
  }

  async function generateAiSettings() {
    setError("");
    setAiPending(true);
    const snapshot: AiSettingsSnapshot = {
      title: values.title,
      slug: values.slug,
      description: values.description || "",
      display_scene: values.display_scene,
    };
    try {
      const data = await requestH5Page<AiFillSettingsResponse>({
        path: `${apiBasePath}/${page.id}/ai-fill-settings`,
        method: "POST",
        payload: {
          page: {
            id: page.id,
            title: values.title,
            slug: values.slug,
            status: page.status,
            description: values.description || null,
            display_scene: values.display_scene,
          },
          pages: pages.map((item) => ({
            title: item.title,
            slug: item.slug,
            status: item.status,
            description: item.description,
            display_scene: item.display_scene,
          })),
          field_schema: settingsAiFieldSchema,
          instruction: aiInstruction,
        },
      });
      setValues((current) => ({
        ...current,
        title: typeof data.patch.title === "string" ? data.patch.title : current.title,
        slug: typeof data.patch.slug === "string" ? normalizeSlug(data.patch.slug) : current.slug,
        description: typeof data.patch.description === "string" ? data.patch.description : current.description,
        display_scene: typeof data.patch.display_scene === "string"
          ? data.patch.display_scene as H5MarketingPageDisplayScene
          : current.display_scene,
      }));
      setAiSnapshot(snapshot);
      toast.success("AI 已回填，可继续修改或一键撤销");
    } catch (error) {
      setError(error instanceof Error ? error.message : "AI 回填失败");
    } finally {
      setAiPending(false);
    }
  }

  function undoAiSettings() {
    if (!aiSnapshot) return;
    setValues((current) => ({
      ...current,
      ...aiSnapshot,
    }));
    setAiSnapshot(null);
    toast.success("已撤销 AI 回填");
  }

  function submit() {
    const result = H5PageFormSchema.safeParse(values);
    if (!result.success) {
      setError(result.error.issues[0]?.message || "请检查表单内容");
      return;
    }

    startTransition(async () => {
      try {
        await requestH5Page({
          path: `${apiBasePath}/${page.id}`,
          method: "PATCH",
          payload: buildPagePayload(result.data),
        });
        toast.success("H5 活动页配置已保存");
        setOpen(false);
        refreshAfterDialogClose(router);
      } catch (error) {
        setError(error instanceof Error ? error.message : "保存失败");
      }
    });
  }

  return (
    <>
      {variant === "menu" ? (
        <Button type="button" variant="ghost" className="h-auto w-full justify-start p-0 font-normal" onClick={() => setOpen(true)}>
          <Settings data-icon="inline-start" />
          配置
        </Button>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Settings data-icon="inline-start" />
          配置
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>活动展示配置</DialogTitle>
            <DialogDescription>
              配置小程序展示场景和活动有效时间；展示顺序在列表中用上移、下移和置顶调整。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-sm font-medium">AI 配置回填</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  根据当前活动页和列表上下文生成标题、路径、描述和展示场景建议。
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {aiSnapshot ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={aiPending}
                    onClick={undoAiSettings}
                  >
                    <RefreshCw data-icon="inline-start" />
                    撤销 AI 回填
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={aiPending}
                  onClick={() => void generateAiSettings()}
                >
                  {aiPending ? (
                    <Loader2 className="animate-spin" data-icon="inline-start" />
                  ) : (
                    <Sparkles data-icon="inline-start" />
                  )}
                  AI 生成
                </Button>
              </div>
            </div>
            <Field>
              <FieldLabel htmlFor={`h5-page-ai-instruction-${page.id}`}>补充要求</FieldLabel>
              <Textarea
                id={`h5-page-ai-instruction-${page.id}`}
                value={aiInstruction}
                rows={2}
                placeholder="例如：突出老客户专属、面向首页展示、标题更短"
                onChange={(event) => setAiInstruction(event.target.value)}
              />
            </Field>
            <div className="text-xs text-muted-foreground">
              AI 生成后会直接填入下方表单；保存前可继续手动修改，也可以一键撤销本次 AI 回填。
            </div>
          </div>
          <FieldGroup>
            <Field data-invalid={Boolean(firstIssue?.path[0] === "title")}>
              <FieldLabel htmlFor={`h5-page-title-${page.id}`}>页面标题</FieldLabel>
              <Input
                id={`h5-page-title-${page.id}`}
                value={values.title}
                aria-invalid={Boolean(firstIssue?.path[0] === "title")}
                onChange={(event) => updateValue("title", event.target.value)}
              />
            </Field>
            <Field data-invalid={Boolean(firstIssue?.path[0] === "slug")}>
              <FieldLabel htmlFor={`h5-page-slug-${page.id}`}>页面路径</FieldLabel>
              <Input
                id={`h5-page-slug-${page.id}`}
                value={values.slug}
                aria-invalid={Boolean(firstIssue?.path[0] === "slug")}
                onChange={(event) => updateValue("slug", event.target.value)}
              />
              <FieldDescription>
                发布后访问地址为 {buildPageUrl(values.slug || "spring-sale", tenantSlug)}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`h5-page-description-${page.id}`}>页面描述</FieldLabel>
              <Textarea
                id={`h5-page-description-${page.id}`}
                value={values.description || ""}
                onChange={(event) => updateValue("description", event.target.value)}
              />
            </Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field data-invalid={Boolean(firstIssue?.path[0] === "display_scene")}>
                <FieldLabel htmlFor={`h5-page-display-scene-${page.id}`}>展示场景</FieldLabel>
                <FormSelect
                  id={`h5-page-display-scene-${page.id}`}
                  value={values.display_scene}
                  options={h5PageDisplaySceneOptions.map(([value, label]) => ({ value, label }))}
                  invalid={Boolean(firstIssue?.path[0] === "display_scene")}
                  onChange={(value) => updateValue("display_scene", value as H5MarketingPageDisplayScene)}
                />
              </Field>
              <Field>
                <FieldLabel>展示顺序</FieldLabel>
                <div className="flex min-h-9 items-center rounded-md border bg-muted/40 px-3 text-sm">
                  在活动页列表中调整
                </div>
                <FieldDescription>只有已发布且当前有效的活动页参与小程序入口排序。</FieldDescription>
              </Field>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`h5-page-start-at-${page.id}`}>开始展示</FieldLabel>
                <Input
                  id={`h5-page-start-at-${page.id}`}
                  type="datetime-local"
                  value={values.start_at || ""}
                  onChange={(event) => updateValue("start_at", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`h5-page-end-at-${page.id}`}>结束展示</FieldLabel>
                <Input
                  id={`h5-page-end-at-${page.id}`}
                  type="datetime-local"
                  value={values.end_at || ""}
                  onChange={(event) => updateValue("end_at", event.target.value)}
                />
              </Field>
            </div>
            {error ? (
              <Field data-invalid>
                <FieldError>{error}</FieldError>
              </Field>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="button" disabled={pending} onClick={submit}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
