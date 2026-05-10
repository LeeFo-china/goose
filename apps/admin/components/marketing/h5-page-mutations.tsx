"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Copy, ExternalLink, Loader2, PauseCircle, Pencil, PlayCircle, Plus, RefreshCw, Settings, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { FormSelect } from "@/components/admin/form-select";
import { h5PageDisplaySceneOptions } from "@/components/marketing/marketing-constants";
import type { H5MarketingPageDisplayScene, H5MarketingPageRecord } from "@/components/marketing/marketing-types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const H5PageFormSchema = z.object({
  title: z.string().trim().min(1, "页面标题不能为空").max(120, "页面标题不能超过 120 个字符"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "页面路径不能为空")
    .max(80, "页面路径不能超过 80 个字符")
    .regex(
      /^[a-z0-9]([a-z0-9-]{0,78}[a-z0-9])?$/,
      "页面路径只能包含小写字母、数字和中划线",
    ),
  description: z.string().trim().max(500, "页面描述不能超过 500 个字符").optional(),
  display_scene: z.enum(["all", "home", "customer_home", "project_detail", "marketing_list"]),
  sort_order: z.coerce.number().int("排序值必须是整数").min(0, "排序值不能小于 0").max(9999, "排序值不能超过 9999"),
  start_at: z.string().optional(),
  end_at: z.string().optional(),
});

type H5PageFormValues = z.infer<typeof H5PageFormSchema>;

type AiFieldDefinition = {
  type: "string" | "text" | "select";
  label: string;
  maxLength: number;
  options?: string[];
};

type AiFillSettingsResponse = {
  patch: Partial<Record<keyof H5PageFormValues, string>>;
  fields: string[];
};

type AiSettingsSnapshot = Pick<
  H5PageFormValues,
  "title" | "slug" | "description" | "display_scene"
>;

const settingsAiFieldSchema: Record<string, AiFieldDefinition> = {
  title: { type: "string", label: "页面标题", maxLength: 120 },
  slug: { type: "string", label: "页面路径", maxLength: 80 },
  description: { type: "text", label: "页面描述", maxLength: 500 },
  display_scene: {
    type: "select",
    label: "展示场景",
    maxLength: 20,
    options: h5PageDisplaySceneOptions.map(([value]) => value),
  },
};

function getH5BaseUrl() {
  return (process.env.NEXT_PUBLIC_GOOES_H5_BASE_URL || "https://h5.goodcms.cn").replace(/\/+$/, "");
}

type H5MarketingPageRouteOptions = {
  apiBasePath?: string;
  editBasePath?: string;
  returnTo?: string;
};

const DEFAULT_H5_PAGE_API_BASE_PATH = "/marketing-pages";
const DEFAULT_H5_PAGE_EDIT_BASE_PATH = "/marketing/h5-pages";
const DEFAULT_H5_PAGE_RETURN_TO = "/marketing?tab=h5";

function buildH5PageEditHref(
  pageId: string,
  editBasePath = DEFAULT_H5_PAGE_EDIT_BASE_PATH,
  returnTo = DEFAULT_H5_PAGE_RETURN_TO,
) {
  const query = new URLSearchParams({
    returnTo,
  });
  return `${editBasePath}/${pageId}/edit?${query}`;
}

function buildPageUrl(slug: string) {
  return `${getH5BaseUrl()}/p/${slug}`;
}

function toApiDateTime(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toDateTimeLocalValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function buildPagePayload(values: H5PageFormValues) {
  return {
    title: values.title,
    slug: values.slug,
    description: values.description || null,
    display_scene: values.display_scene,
    sort_order: values.sort_order,
    start_at: toApiDateTime(values.start_at),
    end_at: toApiDateTime(values.end_at),
  };
}

function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function requestH5Page<T>(input: {
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  payload?: unknown;
}) {
  const response = await fetch(`/api/backend${input.path}`, {
    method: input.method || "GET",
    headers: input.payload ? { "content-type": "application/json" } : undefined,
    body: input.payload ? JSON.stringify(input.payload) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(getPayloadMessage(payload, "操作失败"));
  }
  return payload.data as T;
}

function buildDefaultConfig(values: H5PageFormValues) {
  return {
    schemaVersion: 1,
    title: values.title,
    theme: {
      primaryColor: "#0f766e",
      backgroundColor: "#f7f3ea",
      textColor: "#1f2933",
    },
    blocks: [
      {
        id: "hero_001",
        type: "hero",
        props: {
          kicker: "GOODCMS 活动",
          title: values.title,
          subtitle: values.description || "填写信息，获取专属活动咨询。",
          buttonText: "立即预约",
          buttonAction: {
            type: "scroll_to_form",
          },
        },
      },
      {
        id: "form_001",
        type: "lead_form",
        props: {
          title: "预约咨询",
          description: "留下联系方式，我们会尽快与您确认活动权益。",
          fields: ["name", "phone", "community"],
          submitText: "提交预约",
        },
      },
      {
        id: "footer_001",
        type: "footer",
        props: {
          text: "GoodCMS",
        },
      },
    ],
  };
}

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export function CreateH5MarketingPageButton({
  apiBasePath = DEFAULT_H5_PAGE_API_BASE_PATH,
}: H5MarketingPageRouteOptions = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<H5PageFormValues>({
    title: "",
    slug: "",
    description: "",
    display_scene: "all",
    sort_order: 100,
    start_at: "",
    end_at: "",
  });
  const [error, setError] = useState("");
  const validation = useMemo(() => H5PageFormSchema.safeParse(values), [values]);

  function updateValue(key: keyof H5PageFormValues, value: string | number) {
    setError("");
    setValues((current) => ({
      ...current,
      [key]: key === "slug" && typeof value === "string" ? normalizeSlug(value) : value,
    }));
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
          path: apiBasePath,
          method: "POST",
          payload: {
            ...buildPagePayload(result.data),
            config: buildDefaultConfig(result.data),
          },
        });
        toast.success("H5 活动页已创建");
        setOpen(false);
        setValues({
          title: "",
          slug: "",
          description: "",
          display_scene: "all",
          sort_order: 100,
          start_at: "",
          end_at: "",
        });
        router.refresh();
      } catch (error) {
        setError(error instanceof Error ? error.message : "创建失败");
      }
    });
  }

  const firstIssue = validation.success ? null : validation.error.issues[0];

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" />
        新建 H5 页面
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建 H5 活动页</DialogTitle>
            <DialogDescription>
              创建后会生成默认 Banner、预约表单和底部信息，可先发布验证 web-view 链路。
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
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
            <Field data-invalid={Boolean(firstIssue?.path[0] === "slug")}>
              <FieldLabel htmlFor="h5-page-slug">页面路径</FieldLabel>
              <Input
                id="h5-page-slug"
                value={values.slug}
                aria-invalid={Boolean(firstIssue?.path[0] === "slug")}
                onChange={(event) => updateValue("slug", event.target.value)}
                placeholder="spring-sale"
              />
              <FieldDescription>
                发布后访问地址为 {buildPageUrl(values.slug || "spring-sale")}
              </FieldDescription>
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
              <Field data-invalid={Boolean(firstIssue?.path[0] === "sort_order")}>
                <FieldLabel htmlFor="h5-page-sort-order">排序</FieldLabel>
                <Input
                  id="h5-page-sort-order"
                  type="number"
                  min={0}
                  max={9999}
                  value={values.sort_order}
                  aria-invalid={Boolean(firstIssue?.path[0] === "sort_order")}
                  onChange={(event) => updateValue("sort_order", Number(event.target.value))}
                />
                <FieldDescription>数值越小，小程序入口越靠前。</FieldDescription>
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
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
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

function H5PageSettingsButton({
  page,
  pages = [],
  apiBasePath = DEFAULT_H5_PAGE_API_BASE_PATH,
}: {
  page: H5MarketingPageRecord;
  pages?: H5MarketingPageRecord[];
  apiBasePath?: string;
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
    sort_order: page.sort_order ?? 100,
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
        router.refresh();
      } catch (error) {
        setError(error instanceof Error ? error.message : "保存失败");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Settings data-icon="inline-start" />
        配置
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>活动展示配置</DialogTitle>
            <DialogDescription>
              配置小程序展示场景、排序和活动有效时间，发布页列表会按这里过滤。
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
                发布后访问地址为 {buildPageUrl(values.slug || "spring-sale")}
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
              <Field data-invalid={Boolean(firstIssue?.path[0] === "sort_order")}>
                <FieldLabel htmlFor={`h5-page-sort-order-${page.id}`}>排序</FieldLabel>
                <Input
                  id={`h5-page-sort-order-${page.id}`}
                  type="number"
                  min={0}
                  max={9999}
                  value={values.sort_order}
                  aria-invalid={Boolean(firstIssue?.path[0] === "sort_order")}
                  onChange={(event) => updateValue("sort_order", Number(event.target.value))}
                />
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

export function H5PageRowActions({
  page,
  pages = [],
  apiBasePath = DEFAULT_H5_PAGE_API_BASE_PATH,
  editBasePath = DEFAULT_H5_PAGE_EDIT_BASE_PATH,
  returnTo = DEFAULT_H5_PAGE_RETURN_TO,
}: {
  page: H5MarketingPageRecord;
  pages?: H5MarketingPageRecord[];
  apiBasePath?: string;
  editBasePath?: string;
  returnTo?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const pageUrl = buildPageUrl(page.slug);

  function runAction(label: string, action: () => Promise<unknown>) {
    startTransition(async () => {
      try {
        await action();
        toast.success(label);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "操作失败");
      }
    });
  }

  function copyUrl() {
    navigator.clipboard.writeText(pageUrl)
      .then(() => toast.success("页面链接已复制"))
      .catch(() => toast.error("复制失败"));
  }

  return (
    <>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" asChild>
          <Link href={buildH5PageEditHref(page.id, editBasePath, returnTo)}>
            <Pencil data-icon="inline-start" />
            编辑
          </Link>
        </Button>
        <H5PageSettingsButton page={page} pages={pages} apiBasePath={apiBasePath} />
        <Button type="button" variant="outline" size="sm" onClick={copyUrl}>
          <Copy data-icon="inline-start" />
          复制链接
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => window.open(pageUrl, "_blank")}>
          <ExternalLink data-icon="inline-start" />
          预览
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => runAction("已复制为新页面", () =>
            requestH5Page({
              path: `${apiBasePath}/${page.id}/duplicate`,
              method: "POST",
              payload: {},
            })
          )}
        >
          <RefreshCw data-icon="inline-start" />
          复制
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => setArchiveOpen(true)}
        >
          <Archive data-icon="inline-start" />
          结束
        </Button>
        {page.status === "published" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => runAction("H5 活动页已下线", () =>
              requestH5Page({
                path: `${apiBasePath}/${page.id}/offline`,
                method: "POST",
              })
            )}
          >
            <PauseCircle data-icon="inline-start" />
            停止
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => runAction("H5 活动页已发布", () =>
              requestH5Page({
                path: `${apiBasePath}/${page.id}/publish`,
                method: "POST",
              })
            )}
          >
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <PlayCircle data-icon="inline-start" />}
            发布
          </Button>
        )}
      </div>
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>结束 H5 活动页</DialogTitle>
            <DialogDescription>
              结束后页面会归档，不再出现在活动页列表中，已投放的 H5 地址也不能继续作为有效活动页访问。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setArchiveOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => {
                setArchiveOpen(false);
                runAction("H5 活动页已结束", () =>
                  requestH5Page({
                    path: `${apiBasePath}/${page.id}`,
                    method: "DELETE",
                  })
                );
              }}
            >
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Archive data-icon="inline-start" />}
              确认结束
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
