"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SiteContentArticleMetadataSchema,
  SiteContentCaseMetadataSchema,
  SiteContentCityMetadataSchema,
  SiteContentDraftSchema,
  type SiteContentDraftBlock,
  type SiteContentMetadata,
  type SiteContentType,
} from "@gooes/domain";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FormSelect } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
import { SiteContentActions } from "@/components/site-content/site-content-actions";
import {
  createSiteContent,
  createSiteContentVersion,
  getSiteContentErrorMessage,
  updateSiteContentSlug,
  type SiteContentVersionPayload,
} from "@/components/site-content/site-content-api";
import { SiteContentBlockEditor } from "@/components/site-content/site-content-block-editor";
import { SiteContentImageField } from "@/components/site-content/site-content-image-field";
import type { SiteContentDetail } from "@/components/site-content/site-content-types";
import { SiteContentVersionPanel } from "@/components/site-content/site-content-version-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const SlugSchema = z.string().trim().min(1, "slug 不能为空").max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "仅支持小写字母、数字和单个连字符");
const EditorSchema = SiteContentDraftSchema.extend({
  contentType: z.enum(["article", "case", "city"]),
  slug: SlugSchema,
  metadata: z.record(z.string(), z.unknown()),
});

type SiteContentEditorValues = {
  contentType: SiteContentType;
  slug: string;
  title: string;
  summary: string | null;
  coverFileId: string | null;
  blocks: SiteContentDraftBlock[];
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  metadata: Record<string, unknown>;
};

const typeOptions = [
  { value: "article", label: "文章" },
  { value: "case", label: "案例" },
  { value: "city", label: "城市页" },
];

function emptyMetadata(contentType: SiteContentType): Record<string, unknown> {
  if (contentType === "article") return { category: "", author: "", displayPublishedAt: new Date().toISOString() };
  if (contentType === "case") return { city: "", areaSquareMeters: 0, decorationType: "", metrics: [] };
  return { administrativeCode: "", cityName: "", localServiceIntroduction: "" };
}

function getDefaults(detail?: SiteContentDetail): SiteContentEditorValues {
  const contentType = detail?.entry.content_type ?? "article";
  const version = detail?.latestVersion;
  return {
    contentType,
    slug: detail?.entry.slug ?? "",
    title: version?.title ?? "",
    summary: version?.summary ?? null,
    coverFileId: version?.cover_file_id ?? null,
    blocks: version?.content_blocks ?? [],
    seoTitle: version?.seo_title ?? null,
    seoDescription: version?.seo_description ?? null,
    canonicalUrl: version?.canonical_url ?? null,
    metadata: version?.metadata as Record<string, unknown> ?? emptyMetadata(contentType),
  };
}

function parseMetadata(contentType: SiteContentType, metadata: Record<string, unknown>): SiteContentMetadata {
  if (contentType === "article") return SiteContentArticleMetadataSchema.parse(metadata);
  if (contentType === "case") return SiteContentCaseMetadataSchema.parse(metadata);
  return SiteContentCityMetadataSchema.parse(metadata);
}

function buildVersionPayload(values: SiteContentEditorValues): SiteContentVersionPayload {
  const draft = SiteContentDraftSchema.parse({
    title: values.title,
    summary: values.summary,
    coverFileId: values.coverFileId,
    blocks: values.blocks,
    seoTitle: values.seoTitle,
    seoDescription: values.seoDescription,
    canonicalUrl: values.canonicalUrl,
  });
  return {
    title: draft.title,
    summary: draft.summary ?? null,
    coverFileId: draft.coverFileId ?? null,
    blocks: draft.blocks,
    seoTitle: draft.seoTitle ?? null,
    seoDescription: draft.seoDescription ?? null,
    canonicalUrl: draft.canonicalUrl ?? null,
    metadata: parseMetadata(values.contentType, values.metadata),
  };
}

export function SiteContentEditor({
  detail,
  canRead,
  canManage,
  canPublish,
}: {
  detail?: SiteContentDetail;
  canRead: boolean;
  canManage: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  const defaults = useMemo(() => getDefaults(detail), [detail]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const form = useForm<SiteContentEditorValues>({
    resolver: zodResolver(EditorSchema as never) as Resolver<SiteContentEditorValues>,
    defaultValues: defaults,
  });
  const contentType = form.watch("contentType");
  const metadata = form.watch("metadata");
  const isExisting = Boolean(detail);

  async function submit(values: SiteContentEditorValues) {
    setPending(true);
    setError("");
    try {
      const version = buildVersionPayload(values);
      if (!detail) {
        const created = await createSiteContent({ contentType: values.contentType, slug: values.slug.trim(), version });
        toast.success("官网内容已创建");
        router.replace(`/platform/site-content/${created.entry.id}`);
      } else {
        if (values.slug.trim() !== detail.entry.slug) await updateSiteContentSlug(detail.entry.id, values.slug.trim());
        await createSiteContentVersion(detail.entry.id, version);
        toast.success("新草稿版本已保存");
        router.refresh();
      }
    } catch (submitError) {
      setError(submitError instanceof z.ZodError
        ? submitError.issues[0]?.message || "内容未通过校验，请检查类型元数据和内容块"
        : getSiteContentErrorMessage(submitError, isExisting ? "保存草稿版本失败" : "创建官网内容失败"));
    } finally {
      setPending(false);
    }
  }

  function updateMetadata(key: string, value: unknown) {
    form.setValue("metadata", { ...metadata, [key]: value }, { shouldDirty: true, shouldValidate: true });
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto pb-6">
      <div className="flex flex-col justify-between gap-3 border-b pb-4 md:flex-row md:items-end">
        <div>
          <Button type="button" variant="ghost" className="mb-2 px-0" onClick={() => router.push("/platform/site-content")}><ArrowLeft data-icon="inline-start" />返回内容列表</Button>
          <h1 className="text-xl font-semibold tracking-normal">{isExisting ? detail?.latestVersion?.title || "编辑官网内容" : "新建官网内容"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">保存会创建新版本，不会自动覆盖公开内容。</p>
        </div>
        {detail ? <SiteContentActions id={detail.entry.id} latestVersionId={detail.latestVersion?.id} canRead={canRead} canPublish={canPublish} onWarning={setWarning} /> : null}
      </div>

      {warning ? <Alert><AlertTitle>官网缓存刷新未完成</AlertTitle><AlertDescription>{warning}</AlertDescription></Alert> : null}
      {error ? <StatusAlert>{error}</StatusAlert> : null}
      {!canManage ? <StatusAlert tone="warning" title="只读模式">当前账号没有 platform.site_content.manage 权限，可以查看和预览，但不能保存草稿。</StatusAlert> : null}

      <Tabs defaultValue="editor" className="min-h-0">
        <TabsList className="h-auto justify-start rounded-none border-0 border-b bg-transparent p-0">
          <TabsTrigger value="editor" className="rounded-none border-0 border-b-2 border-transparent px-0 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent">内容编辑</TabsTrigger>
          {detail ? <TabsTrigger value="versions" className="ml-5 rounded-none border-0 border-b-2 border-transparent px-0 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent">版本历史</TabsTrigger> : null}
        </TabsList>
        <TabsContent value="editor" className="mt-5">
          <form className="flex flex-col gap-6" onSubmit={form.handleSubmit(submit, () => setError("表单校验未通过，请检查标记字段和内容块"))}>
            <section className="flex flex-col gap-4" aria-labelledby="site-content-basic-heading">
              <div><h2 id="site-content-basic-heading" className="text-base font-semibold">基础信息</h2><p className="mt-1 text-sm text-muted-foreground">内容类型决定元数据字段，创建后不可切换。</p></div>
              <FieldGroup className="grid gap-4 md:grid-cols-2">
                <Controller name="contentType" control={form.control} render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid}><FieldLabel htmlFor="site-content-type">内容类型</FieldLabel><FormSelect id="site-content-type" value={field.value} options={typeOptions} disabled={pending || !canManage || isExisting} invalid={fieldState.invalid} onChange={(value) => { const nextType = value as SiteContentType; field.onChange(nextType); form.setValue("metadata", emptyMetadata(nextType)); }} /><FieldError errors={[fieldState.error]} /></Field>} />
                <Field data-invalid={Boolean(form.formState.errors.slug)}><FieldLabel htmlFor="site-content-slug">slug</FieldLabel><Input id="site-content-slug" {...form.register("slug")} disabled={pending || !canManage || detail?.entry.status === "published"} aria-invalid={Boolean(form.formState.errors.slug)} placeholder="example-content-slug" /><FieldDescription>{detail?.entry.status === "published" ? "已发布内容需先归档，才能修改 slug。" : "用于公开页面路径，只支持小写字母、数字和连字符。"}</FieldDescription><FieldError errors={[form.formState.errors.slug]} /></Field>
                <Field className="md:col-span-2" data-invalid={Boolean(form.formState.errors.title)}><FieldLabel htmlFor="site-content-title">标题</FieldLabel><Input id="site-content-title" {...form.register("title")} disabled={pending || !canManage} aria-invalid={Boolean(form.formState.errors.title)} /><FieldError errors={[form.formState.errors.title]} /></Field>
                <Controller name="summary" control={form.control} render={({ field, fieldState }) => <Field className="md:col-span-2" data-invalid={fieldState.invalid}><FieldLabel htmlFor="site-content-summary">摘要</FieldLabel><Textarea id="site-content-summary" rows={3} value={field.value ?? ""} disabled={pending || !canManage} aria-invalid={fieldState.invalid} onChange={(event) => field.onChange(event.target.value || null)} /><FieldError errors={[fieldState.error]} /></Field>} />
                <Controller name="coverFileId" control={form.control} render={({ field }) => <div className="md:col-span-2"><SiteContentImageField id="site-content-cover" value={{ fileId: field.value ?? "", alt: form.watch("title") }} disabled={pending || !canManage} onChange={(image) => field.onChange(image.fileId || null)} /></div>} />
              </FieldGroup>
            </section>

            <Separator />
            <MetadataFields contentType={contentType} metadata={metadata} disabled={pending || !canManage} onChange={updateMetadata} />
            <Separator />

            <section className="flex flex-col gap-4" aria-labelledby="site-content-block-heading">
              <div><h2 id="site-content-block-heading" className="text-base font-semibold">页面内容</h2><p className="mt-1 text-sm text-muted-foreground">仅支持八类白名单内容块，可折叠、上移、下移和删除。</p></div>
              <Controller name="blocks" control={form.control} render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid}><SiteContentBlockEditor blocks={field.value} disabled={pending || !canManage} onChange={field.onChange} /><FieldError errors={[fieldState.error]} /></Field>} />
            </section>

            <Separator />
            <SeoFields form={form} disabled={pending || !canManage} />

            <div className="sticky bottom-0 flex flex-col gap-2 border-t bg-background/95 py-3 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">保存前会再次按共享内容 Schema 校验元数据和所有内容块。</p>
              <Button type="submit" disabled={pending || !canManage}>{pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}{isExisting ? "保存新版本" : "创建内容"}</Button>
            </div>
          </form>
        </TabsContent>
        {detail ? <TabsContent value="versions" className="mt-5"><SiteContentVersionPanel id={detail.entry.id} publishedVersionId={detail.entry.published_version_id} canPublish={canPublish} onWarning={setWarning} /></TabsContent> : null}
      </Tabs>
    </div>
  );
}

function MetadataFields({ contentType, metadata, disabled, onChange }: { contentType: SiteContentType; metadata: Record<string, unknown>; disabled: boolean; onChange: (key: string, value: unknown) => void }) {
  return (
    <section className="flex flex-col gap-4" aria-labelledby="site-content-metadata-heading">
      <div><h2 id="site-content-metadata-heading" className="text-base font-semibold">类型元数据</h2><p className="mt-1 text-sm text-muted-foreground">字段随文章、案例或城市页类型固定。</p></div>
      <FieldGroup className="grid gap-4 md:grid-cols-2">
        {contentType === "article" ? <><Field><FieldLabel htmlFor="article-category">分类</FieldLabel><Input id="article-category" value={String(metadata.category ?? "")} disabled={disabled} onChange={(event) => onChange("category", event.target.value)} /></Field><Field><FieldLabel htmlFor="article-author">作者</FieldLabel><Input id="article-author" value={String(metadata.author ?? "")} disabled={disabled} onChange={(event) => onChange("author", event.target.value)} /></Field><Field className="md:col-span-2"><FieldLabel htmlFor="article-published-at">展示发布时间（ISO 8601）</FieldLabel><Input id="article-published-at" value={String(metadata.displayPublishedAt ?? "")} disabled={disabled} placeholder="2026-07-12T08:00:00.000+08:00" onChange={(event) => onChange("displayPublishedAt", event.target.value)} /></Field></> : null}
        {contentType === "case" ? <><Field><FieldLabel htmlFor="case-city">城市</FieldLabel><Input id="case-city" value={String(metadata.city ?? "")} disabled={disabled} onChange={(event) => onChange("city", event.target.value)} /></Field><Field><FieldLabel htmlFor="case-area">面积（㎡）</FieldLabel><Input id="case-area" type="number" min="0.01" step="0.01" value={Number(metadata.areaSquareMeters ?? 0)} disabled={disabled} onChange={(event) => onChange("areaSquareMeters", event.target.valueAsNumber)} /></Field><Field className="md:col-span-2"><FieldLabel htmlFor="case-type">装修类型</FieldLabel><Input id="case-type" value={String(metadata.decorationType ?? "")} disabled={disabled} onChange={(event) => onChange("decorationType", event.target.value)} /></Field></> : null}
        {contentType === "city" ? <><Field><FieldLabel htmlFor="city-code">行政区划代码</FieldLabel><Input id="city-code" inputMode="numeric" value={String(metadata.administrativeCode ?? "")} disabled={disabled} onChange={(event) => onChange("administrativeCode", event.target.value)} /></Field><Field><FieldLabel htmlFor="city-name">城市名称</FieldLabel><Input id="city-name" value={String(metadata.cityName ?? "")} disabled={disabled} onChange={(event) => onChange("cityName", event.target.value)} /></Field><Field className="md:col-span-2"><FieldLabel htmlFor="city-introduction">本地服务介绍</FieldLabel><Textarea id="city-introduction" rows={5} value={String(metadata.localServiceIntroduction ?? "")} disabled={disabled} onChange={(event) => onChange("localServiceIntroduction", event.target.value)} /></Field></> : null}
      </FieldGroup>
    </section>
  );
}

function SeoFields({ form, disabled }: { form: ReturnType<typeof useForm<SiteContentEditorValues>>; disabled: boolean }) {
  return <section className="flex flex-col gap-4" aria-labelledby="site-content-seo-heading"><div><h2 id="site-content-seo-heading" className="text-base font-semibold">SEO</h2><p className="mt-1 text-sm text-muted-foreground">为空时公开页会回退到标题和摘要。</p></div><FieldGroup className="grid gap-4 md:grid-cols-2"><NullableField name="seoTitle" label="SEO 标题" form={form} disabled={disabled} /><NullableField name="canonicalUrl" label="Canonical URL" form={form} disabled={disabled} /><Controller name="seoDescription" control={form.control} render={({ field, fieldState }) => <Field className="md:col-span-2" data-invalid={fieldState.invalid}><FieldLabel htmlFor="seoDescription">SEO 描述</FieldLabel><Textarea id="seoDescription" rows={3} value={field.value ?? ""} disabled={disabled} aria-invalid={fieldState.invalid} onChange={(event) => field.onChange(event.target.value || null)} /><FieldDescription>建议控制在搜索结果可完整展示的长度内。</FieldDescription><FieldError errors={[fieldState.error]} /></Field>} /></FieldGroup></section>;
}

function NullableField({ name, label, form, disabled }: { name: "seoTitle" | "canonicalUrl"; label: string; form: ReturnType<typeof useForm<SiteContentEditorValues>>; disabled: boolean }) {
  return <Controller name={name} control={form.control} render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid}><FieldLabel htmlFor={name}>{label}</FieldLabel><Input id={name} value={field.value ?? ""} disabled={disabled} aria-invalid={fieldState.invalid} onChange={(event) => field.onChange(event.target.value || null)} /><FieldError errors={[fieldState.error]} /></Field>} />;
}
