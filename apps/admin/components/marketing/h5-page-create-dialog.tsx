"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { H5PageCreateFields } from "@/components/marketing/h5-page-create-fields";
import { buildDefaultConfig, buildPagePayload, buildRandomSlug, createDefaultH5PageValues, DEFAULT_H5_PAGE_API_BASE_PATH, H5PageFormSchema, type AiCreateSnapshot, type AiFillCreateResponse, type H5MarketingPageRouteOptions, type H5PageFormValues, normalizeSlug, requestH5Page } from "@/components/marketing/h5-page-mutation-shared";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

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
        refreshAfterDialogClose(router);
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
          <H5PageCreateFields
            values={values}
            tenantSlug={tenantSlug}
            activePageCount={activePageCount}
            advancedOpen={advancedOpen}
            aiInstruction={aiInstruction}
            aiPending={aiPending}
            aiSnapshot={aiSnapshot}
            aiError={aiError}
            error={error}
            firstIssue={firstIssue}
            setAdvancedOpen={setAdvancedOpen}
            setAiInstruction={setAiInstruction}
            setAiError={setAiError}
            updateValue={updateValue}
            regenerateSlug={regenerateSlug}
            generateAiCreateCopy={() => void generateAiCreateCopy()}
            undoAiCreateCopy={undoAiCreateCopy}
          />
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
