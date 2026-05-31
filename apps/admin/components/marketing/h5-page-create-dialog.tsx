"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { FormSelect } from "@/components/admin/form-select";
import { h5PageDisplaySceneOptions } from "@/components/marketing/marketing-constants";
import type { H5MarketingPageDisplayScene } from "@/components/marketing/marketing-types";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { buildDefaultConfig, buildPagePayload, buildPageUrl, buildRandomSlug, createDefaultH5PageValues, DEFAULT_H5_PAGE_API_BASE_PATH, H5PageFormSchema, type AiCreateSnapshot, type AiFillCreateResponse, type H5MarketingPageRouteOptions, type H5PageFormValues, normalizeSlug, requestH5Page } from "@/components/marketing/h5-page-mutation-shared";

export function CreateH5MarketingPageButton({
  apiBasePath = DEFAULT_H5_PAGE_API_BASE_PATH,
  tenantSlug,
  activePageCount = 0,
}: H5MarketingPageRouteOptions = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<H5PageFormValues>(() => createDefaultH5PageValues());
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiPending, setAiPending] = useState(false);
  const [aiSnapshot, setAiSnapshot] = useState<AiCreateSnapshot | null>(null);
  const [aiError, setAiError] = useState("");
  const [error, setError] = useState("");
  const validation = useMemo(() => H5PageFormSchema.safeParse(values), [values]);

  function updateOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setValues((current) => current.slug ? current : {
        ...current,
        slug: buildRandomSlug(),
      });
      return;
    }

    setAdvancedOpen(false);
    setAiError("");
    setError("");
  }

  function updateValue(key: keyof H5PageFormValues, value: string | number) {
    setError("");
    setValues((current) => ({
      ...current,
      [key]: key === "slug" && typeof value === "string" ? normalizeSlug(value) : value,
    }));
  }

  function regenerateSlug() {
    setError("");
    setValues((current) => ({
      ...current,
      slug: buildRandomSlug(),
    }));
  }

  async function generateAiCreateCopy() {
    const instruction = aiInstruction.trim();
    if (instruction.length < 4) {
      setAiError("请输入更具体的活动要求");
      return;
    }

    setAiError("");
    setAiPending(true);
    const snapshot: AiCreateSnapshot = {
      title: values.title,
      description: values.description || "",
    };

    try {
      const data = await requestH5Page<AiFillCreateResponse>({
        path: `${apiBasePath}/ai-fill-create`,
        method: "POST",
        payload: { instruction },
      });

      setValues((current) => ({
        ...current,
        title: typeof data.title === "string" ? data.title : current.title,
        description: typeof data.description === "string" ? data.description : current.description,
      }));
      setAiSnapshot(snapshot);
      toast.success("AI 已回填标题和描述，可继续修改");
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "AI 生成失败");
    } finally {
      setAiPending(false);
    }
  }

  function undoAiCreateCopy() {
    if (!aiSnapshot) return;
    setValues((current) => ({
      ...current,
      ...aiSnapshot,
    }));
    setAiSnapshot(null);
    setAiError("");
    toast.success("已撤销 AI 回填");
  }

  function submit() {
    const result = H5PageFormSchema.safeParse(values);
    if (!result.success) {
      if (result.error.issues.some((issue) => issue.path[0] === "slug")) {
        setAdvancedOpen(true);
      }
      setError(result.error.issues[0]?.message || "请检查表单内容");
      return;
    }

    startTransition(async () => {
      try {
        await requestH5Page({
          path: apiBasePath,
          method: "POST",
          payload: {
            ...buildPagePayload(result.data),
            config: buildDefaultConfig(result.data),
          },
        });
        toast.success("H5 活动页已创建");
        setOpen(false);
        setAdvancedOpen(false);
        setAiInstruction("");
        setAiSnapshot(null);
        setAiError("");
        setValues(createDefaultH5PageValues());
        router.refresh();
      } catch (error) {
        setError(error instanceof Error ? error.message : "创建失败");
      }
    });
  }

  const firstIssue = validation.success ? null : validation.error.issues[0];

  return (
    <>
      <Button type="button" onClick={() => updateOpen(true)}>
        <Plus data-icon="inline-start" />
        新建 H5 页面
      </Button>
      <Dialog open={open} onOpenChange={updateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建 H5 活动页</DialogTitle>
            <DialogDescription>
              创建后会生成默认 Banner、预约表单和底部信息，可先发布验证 web-view 链路。
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-sm font-medium">AI 辅助生成</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    输入活动要求，AI 会直接回填页面标题和页面描述，路径不会被修改。
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {aiSnapshot ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={aiPending}
                      onClick={undoAiCreateCopy}
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
                    onClick={() => void generateAiCreateCopy()}
                  >
                    {aiPending ? (
                      <Loader2 className="animate-spin" data-icon="inline-start" />
                    ) : aiSnapshot ? (
                      <RefreshCw data-icon="inline-start" />
                    ) : (
                      <Sparkles data-icon="inline-start" />
                    )}
                    {aiSnapshot ? "重新生成" : "AI 生成"}
                  </Button>
                </div>
              </div>
              <Field data-invalid={Boolean(aiError)}>
                <FieldLabel htmlFor="h5-page-create-ai-instruction">活动要求</FieldLabel>
                <Textarea
                  id="h5-page-create-ai-instruction"
                  value={aiInstruction}
                  rows={3}
                  aria-invalid={Boolean(aiError)}
                  placeholder="例如：面向郑州老房翻新客户，突出免费量房、限时优惠、预约咨询"
                  onChange={(event) => {
                    setAiError("");
                    setAiInstruction(event.target.value);
                  }}
                />
                {aiError ? <FieldError>{aiError}</FieldError> : null}
              </Field>
            </div>
            <Field data-invalid={Boolean(firstIssue?.path[0] === "title")}>
              <FieldLabel htmlFor="h5-page-title">页面标题</FieldLabel>
              <Input
                id="h5-page-title"
                value={values.title}
                aria-invalid={Boolean(firstIssue?.path[0] === "title")}
                onChange={(event) => updateValue("title", event.target.value)}
                placeholder="例如：春季装修预约活动"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="h5-page-description">页面描述</FieldLabel>
              <Textarea
                id="h5-page-description"
                value={values.description || ""}
                onChange={(event) => updateValue("description", event.target.value)}
                placeholder="一句话描述活动权益"
              />
            </Field>
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">高级设置</div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    活动路径已自动生成：
                    {tenantSlug
                      ? `/t/${tenantSlug}/p/${values.slug || "auto"}`
                      : `/p/${values.slug || "auto"}`}
                  </div>
                </div>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
                    {advancedOpen ? "收起" : "展开"}
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="mt-3">
                <Field data-invalid={Boolean(firstIssue?.path[0] === "slug")}>
                  <FieldLabel htmlFor="h5-page-slug">活动路径</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id="h5-page-slug"
                      value={values.slug}
                      aria-invalid={Boolean(firstIssue?.path[0] === "slug")}
                      onChange={(event) => updateValue("slug", event.target.value)}
                      placeholder="h5-20260510-a1b2c3"
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton onClick={regenerateSlug}>
                        <RefreshCw data-icon="inline-start" />
                        重新生成
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                  <FieldDescription>
                    发布后访问地址为 {buildPageUrl(values.slug || "auto", tenantSlug)}
                  </FieldDescription>
                  {firstIssue?.path[0] === "slug" ? (
                    <FieldError>{firstIssue.message}</FieldError>
                  ) : null}
                </Field>
              </CollapsibleContent>
            </Collapsible>
            <div className="grid gap-3 md:grid-cols-2">
              <Field data-invalid={Boolean(firstIssue?.path[0] === "display_scene")}>
                <FieldLabel htmlFor="h5-page-display-scene">展示场景</FieldLabel>
                <FormSelect
                  id="h5-page-display-scene"
                  value={values.display_scene}
                  options={h5PageDisplaySceneOptions.map(([value, label]) => ({ value, label }))}
                  invalid={Boolean(firstIssue?.path[0] === "display_scene")}
                  onChange={(value) => updateValue("display_scene", value as H5MarketingPageDisplayScene)}
                />
              </Field>
              <Field>
                <FieldLabel>发布后顺序</FieldLabel>
                <div className="flex min-h-9 items-center rounded-md border bg-muted/40 px-3 text-sm font-medium">
                  第 {activePageCount + 1} 位
                </div>
                <FieldDescription>
                  草稿不占展示位，发布时会按当时有效活动自动排到最后。
                </FieldDescription>
              </Field>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="h5-page-start-at">开始展示</FieldLabel>
                <Input
                  id="h5-page-start-at"
                  type="datetime-local"
                  value={values.start_at || ""}
                  onChange={(event) => updateValue("start_at", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="h5-page-end-at">结束展示</FieldLabel>
                <Input
                  id="h5-page-end-at"
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
            <Button type="button" variant="outline" onClick={() => updateOpen(false)}>
              取消
            </Button>
            <Button type="button" disabled={pending} onClick={submit}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
