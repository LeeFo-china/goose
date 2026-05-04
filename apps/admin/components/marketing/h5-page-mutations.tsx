"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Copy, ExternalLink, Loader2, PauseCircle, Pencil, PlayCircle, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import type { H5MarketingPageRecord } from "@/components/marketing/marketing-types";
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
});

type H5PageFormValues = z.infer<typeof H5PageFormSchema>;

function getH5BaseUrl() {
  return (process.env.NEXT_PUBLIC_GOOES_H5_BASE_URL || "https://h5.goodcms.cn").replace(/\/+$/, "");
}

function buildPageUrl(slug: string) {
  return `${getH5BaseUrl()}/p/${slug}`;
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

export function CreateH5MarketingPageButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<H5PageFormValues>({
    title: "",
    slug: "",
    description: "",
  });
  const [error, setError] = useState("");
  const validation = useMemo(() => H5PageFormSchema.safeParse(values), [values]);

  function updateValue(key: keyof H5PageFormValues, value: string) {
    setError("");
    setValues((current) => ({
      ...current,
      [key]: key === "slug" ? normalizeSlug(value) : value,
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
          path: "/marketing-pages",
          method: "POST",
          payload: {
            ...result.data,
            description: result.data.description || null,
            config: buildDefaultConfig(result.data),
          },
        });
        toast.success("H5 活动页已创建");
        setOpen(false);
        setValues({ title: "", slug: "", description: "" });
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

export function H5PageRowActions({ page }: { page: H5MarketingPageRecord }) {
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
          <Link href={`/marketing/h5-pages/${page.id}/edit`}>
            <Pencil data-icon="inline-start" />
            编辑
          </Link>
        </Button>
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
              path: `/marketing-pages/${page.id}/duplicate`,
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
                path: `/marketing-pages/${page.id}/offline`,
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
                path: `/marketing-pages/${page.id}/publish`,
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
                    path: `/marketing-pages/${page.id}`,
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
