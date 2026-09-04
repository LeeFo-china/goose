"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  type DouyinMaterialNoteBlock,
  type DouyinMaterialNoteTenantVersion,
  type DouyinMaterialNoteVersionDraft,
  DouyinMaterialNoteVersionDraftSchema,
} from "@gooes/domain";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { StatusAlert } from "@/components/admin/status-alert";
import {
  appendMaterialNoteVersion,
  createMaterialNote,
  getMaterialNoteErrorMessage,
} from "@/components/douyin-miniapp/material-note-api";
import { MaterialNoteCategorySelect } from "@/components/douyin-miniapp/material-note-category-select";
import { MaterialNoteRichEditor } from "@/components/douyin-miniapp/material-note-rich-editor";
import { buildMaterialNoteImagePreviewUrl } from "@/components/douyin-miniapp/material-note-rich-editor-adapter";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const MATERIAL_NOTE_ALLOWED_BLOCK_TYPES = [
  "heading",
  "paragraph",
  "list",
  "quote",
  "callout",
  "image",
] as const satisfies readonly DouyinMaterialNoteBlock["type"][];

const emptyDraft: DouyinMaterialNoteVersionDraft = {
  title: "",
  summary: "",
  category: "",
  category_id: null,
  applicable_to: null,
  content_blocks: [],
};

type MaterialNoteEditorField = keyof DouyinMaterialNoteVersionDraft;
type MaterialNoteEditorFieldErrors = Partial<Record<MaterialNoteEditorField, string>>;

const materialNoteFieldErrorMessages = {
  title: "请输入 1～300 个字符的资料标题",
  summary: "请输入 1～1000 个字符的资料摘要",
  category: "请输入 1～100 个字符的资料分类",
  category_id: "请选择资料分类",
  content_blocks: "请检查正文内容块，确保必填内容完整且格式有效",
} satisfies Partial<Record<MaterialNoteEditorField, string>>;
type MaterialNoteEditorErrorField = keyof typeof materialNoteFieldErrorMessages;

function hasMaterialNoteFieldErrorMessage(field: string): field is MaterialNoteEditorErrorField {
  return Object.prototype.hasOwnProperty.call(materialNoteFieldErrorMessages, field);
}

export function validateMaterialNoteEditorDraft(value: unknown):
  | { success: true; data: DouyinMaterialNoteVersionDraft }
  | { success: false; fieldErrors: MaterialNoteEditorFieldErrors } {
  const result = DouyinMaterialNoteVersionDraftSchema.safeParse(value);
  if (result.success) return { success: true, data: result.data };

  const fieldErrors: MaterialNoteEditorFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (
      typeof field === "string"
      && hasMaterialNoteFieldErrorMessage(field)
      && !fieldErrors[field]
    ) {
      fieldErrors[field] = materialNoteFieldErrorMessages[field];
    }
  }
  return { success: false, fieldErrors };
}

export function narrowMaterialNoteEditorBlocks(
  blocks: DouyinMaterialNoteBlock[],
): DouyinMaterialNoteBlock[] | null {
  const result: DouyinMaterialNoteBlock[] = [];
  for (const block of blocks) {
    if (
      block.type !== "heading"
      && block.type !== "paragraph"
      && block.type !== "list"
      && block.type !== "quote"
      && block.type !== "callout"
      && block.type !== "image"
    ) return null;
    result.push(block);
  }
  return result;
}

function draftFromVersion(
  version: DouyinMaterialNoteTenantVersion | undefined,
): DouyinMaterialNoteVersionDraft {
  if (!version) return emptyDraft;
  return {
    title: version.title,
    summary: version.summary,
    category: version.category,
    category_id: version.category_id ?? null,
    applicable_to: null,
    content_blocks: version.content_blocks,
  };
}

export function MaterialNoteEditor({
  noteId,
  baseVersion,
  canManage,
  onSaved,
}: {
  noteId?: string;
  baseVersion?: DouyinMaterialNoteTenantVersion;
  canManage: boolean;
  onSaved?: (versionId: string) => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => draftFromVersion(baseVersion));
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<MaterialNoteEditorFieldErrors>({});
  const isExisting = Boolean(noteId);

  function setField<Key extends keyof DouyinMaterialNoteVersionDraft>(
    key: Key,
    value: DouyinMaterialNoteVersionDraft[Key],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setError("");
  }

  function updateBlocks(blocks: DouyinMaterialNoteBlock[]) {
    const result = narrowMaterialNoteEditorBlocks(blocks);
    if (result) setField("content_blocks", result);
  }

  function setCategory(category: { id: string; name: string }) {
    setDraft((current) => ({
      ...current,
      category: category.name,
      category_id: category.id,
    }));
    setFieldErrors((current) => {
      if (!current.category && !current.category_id) return current;
      const next = { ...current };
      delete next.category;
      delete next.category_id;
      return next;
    });
    setError("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;
    const validation = validateMaterialNoteEditorDraft(draft);
    if (!validation.success) {
      setFieldErrors(validation.fieldErrors);
      setError("表单校验未通过，请检查标记字段和正文内容块");
      return;
    }
    setPending(true);
    setError("");
    try {
      if (noteId) {
        const result = await appendMaterialNoteVersion(noteId, validation.data);
        toast.success("修改已保存");
        onSaved?.(result.version_id);
        router.refresh();
      } else {
        const result = await createMaterialNote(validation.data);
        toast.success("资料已创建");
        router.replace(`/douyin-miniapp/materials/${result.note_id}`);
        router.refresh();
      }
    } catch (submitError) {
      setError(submitError instanceof z.ZodError
        ? submitError.issues[0]?.message || "资料内容未通过校验"
        : getMaterialNoteErrorMessage(
          submitError,
          isExisting ? "保存修改失败" : "创建资料失败",
        ));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!canManage ? <StatusAlert tone="warning" title="只读模式">
        当前账号缺少 douyin_material_note.manage 权限，不能编辑资料。
      </StatusAlert> : null}
      {error ? <StatusAlert>{error}</StatusAlert> : null}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>{isExisting ? "编辑资料" : "新建资料"}</CardTitle>
            <CardDescription>
              {isExisting
                ? "保存后会更新当前编辑内容；发布前请先保存修改。"
                : "一次提交会创建资料，创建后即可发布。"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-6" noValidate onSubmit={submit}>
              <section className="flex flex-col gap-4" aria-labelledby="material-basic-heading">
                <h2 id="material-basic-heading" className="text-base font-semibold">基础信息</h2>
                <FieldGroup className="grid gap-4 md:grid-cols-2">
                  <Field className="md:col-span-2" data-invalid={Boolean(fieldErrors.title)}><FieldLabel htmlFor="material-title">标题</FieldLabel>
                    <Input id="material-title" value={draft.title} maxLength={300} required aria-required aria-invalid={Boolean(fieldErrors.title)} aria-describedby="material-title-error" disabled={pending || !canManage} onChange={(event) => setField("title", event.target.value)} />
                    <FieldDescription>1～300 个字符。</FieldDescription>
                    <FieldError id="material-title-error">{fieldErrors.title}</FieldError>
                  </Field>
                  <Field data-invalid={Boolean(fieldErrors.category || fieldErrors.category_id)}>
                    <FieldLabel htmlFor="material-category">分类</FieldLabel>
                    <MaterialNoteCategorySelect
                      categoryId={draft.category_id}
                      categoryName={draft.category}
                      disabled={pending || !canManage}
                      invalid={Boolean(fieldErrors.category || fieldErrors.category_id)}
                      onChange={setCategory}
                    />
                    <FieldError id="material-category-error">
                      {fieldErrors.category ?? fieldErrors.category_id}
                    </FieldError>
                  </Field>
                  <Field className="md:col-span-2" data-invalid={Boolean(fieldErrors.summary)}><FieldLabel htmlFor="material-summary">摘要</FieldLabel>
                    <Textarea id="material-summary" rows={4} value={draft.summary} maxLength={1_000} required aria-required aria-invalid={Boolean(fieldErrors.summary)} aria-describedby="material-summary-error" disabled={pending || !canManage} onChange={(event) => setField("summary", event.target.value)} />
                    <FieldDescription>摘要会在领取前公开展示，请勿写入只应领取后查看的正文。</FieldDescription>
                    <FieldError id="material-summary-error">{fieldErrors.summary}</FieldError>
                  </Field>
                </FieldGroup>
              </section>
              <Separator />
              <section className="flex flex-col gap-4" aria-labelledby="material-content-heading">
                <div><h2 id="material-content-heading" className="text-base font-semibold">正文内容</h2>
                  <p className="mt-1 text-sm text-muted-foreground">支持标题、段落、列表、引用、提示块和图片；不会保存 HTML、外链图片或 base64。</p>
                </div>
                <Field data-invalid={Boolean(fieldErrors.content_blocks)} aria-describedby="material-blocks-error"><MaterialNoteRichEditor
                  blocks={draft.content_blocks}
                  disabled={pending || !canManage}
                  onUploadStateChange={setUploading}
                  onChange={updateBlocks}
                /><FieldError id="material-blocks-error">{fieldErrors.content_blocks}</FieldError></Field>
              </section>
              <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">服务端会再次按资料窄 Schema 校验全部字段；图片领取时解析为公开 CDN 地址。</p>
                <Button type="submit" disabled={pending || uploading || !canManage}>
                  {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}
                  {uploading ? "图片上传中" : isExisting ? "保存修改" : "创建资料"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
        <MaterialNoteDraftPreview draft={draft} />
      </div>
      {!isExisting ? <Button type="button" variant="ghost" className="self-start" onClick={() => router.push("/douyin-miniapp/materials")}>
        <ArrowLeft data-icon="inline-start" />返回资料列表
      </Button> : null}
    </div>
  );
}

export function MaterialNoteDraftPreview({ draft }: { draft: DouyinMaterialNoteVersionDraft }) {
  return (
    <Card className="h-fit shadow-none">
      <CardHeader><CardTitle>小程序预览</CardTitle>
        <CardDescription>预览仅供编辑核对，保存不会自动发布。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div><p className="text-lg font-semibold">{draft.title || "资料标题"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{draft.category || "资料分类"}</p>
        </div>
        <p className="text-sm text-muted-foreground">{draft.summary || "资料摘要将在这里展示。"}</p>
        <Separator />
        <div className="flex flex-col gap-3">
          {draft.content_blocks.length > 0
            ? draft.content_blocks.map((block, index) => <MaterialBlock key={index} block={block} />)
            : <p className="text-sm text-muted-foreground">尚未添加正文内容块。</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export function resolveMaterialNoteDraftPreviewImageSrc(
  block: Extract<DouyinMaterialNoteBlock, { type: "image" }>,
): string {
  return buildMaterialNoteImagePreviewUrl(block.fileId);
}

function MaterialBlock({ block }: { block: DouyinMaterialNoteVersionDraft["content_blocks"][number] }) {
  if (block.type === "heading") {
    return block.level === 2
      ? <h3 className="text-base font-semibold">{block.text || "二级标题"}</h3>
      : <h4 className="text-sm font-semibold">{block.text || "三级标题"}</h4>;
  }
  if (block.type === "paragraph") return <p className="whitespace-pre-wrap text-sm leading-6">{block.text}</p>;
  if (block.type === "quote") return <blockquote className="border-l-2 pl-3 text-sm text-muted-foreground">{block.text}{block.attribution ? <footer className="mt-1 text-xs">— {block.attribution}</footer> : null}</blockquote>;
  if (block.type === "list") {
    const List = block.style === "ordered" ? "ol" : "ul";
    return <List className={cn(
      "list-inside text-sm leading-6",
      block.style === "ordered" ? "list-decimal" : "list-disc",
    )}>{block.items.map((item, index) => <li key={index}>{item}</li>)}</List>;
  }
  if (block.type === "image") {
    return <figure className="rounded-md border bg-muted/30 p-3">
      <img
        src={resolveMaterialNoteDraftPreviewImageSrc(block)}
        alt={block.alt}
        className="max-h-48 w-full rounded bg-background object-contain"
      />
      {block.caption ? <figcaption className="mt-2 text-xs text-muted-foreground">{block.caption}</figcaption> : null}
    </figure>;
  }
  return <Alert><AlertTitle>{block.title}</AlertTitle><AlertDescription>{block.text}</AlertDescription></Alert>;
}
