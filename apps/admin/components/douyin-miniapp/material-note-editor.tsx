"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  type DouyinMaterialNoteBlock,
  type DouyinMaterialNoteTenantVersion,
  type DouyinMaterialNoteVersionDraft,
  type SiteContentDraftBlock,
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
import { SiteContentBlockEditor } from "@/components/site-content/site-content-block-editor";
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
] as const satisfies readonly SiteContentDraftBlock["type"][];

const emptyDraft: DouyinMaterialNoteVersionDraft = {
  title: "",
  summary: "",
  category: "",
  applicable_to: null,
  content_blocks: [],
};

export function narrowMaterialNoteEditorBlocks(
  blocks: SiteContentDraftBlock[],
): DouyinMaterialNoteBlock[] | null {
  const result: DouyinMaterialNoteBlock[] = [];
  for (const block of blocks) {
    if (
      block.type !== "heading"
      && block.type !== "paragraph"
      && block.type !== "list"
      && block.type !== "quote"
      && block.type !== "callout"
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
    applicable_to: version.applicable_to,
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
  const [error, setError] = useState("");
  const isExisting = Boolean(noteId);

  function setField<Key extends keyof DouyinMaterialNoteVersionDraft>(
    key: Key,
    value: DouyinMaterialNoteVersionDraft[Key],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError("");
  }

  function updateBlocks(blocks: SiteContentDraftBlock[]) {
    const result = narrowMaterialNoteEditorBlocks(blocks);
    if (result) setField("content_blocks", result);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;
    setPending(true);
    setError("");
    try {
      if (noteId) {
        const result = await appendMaterialNoteVersion(noteId, draft);
        toast.success(`新版本 v${result.version_no} 已保存`);
        onSaved?.(result.version_id);
        router.refresh();
      } else {
        const result = await createMaterialNote(draft);
        toast.success("资料和版本 1 已创建");
        router.replace(`/douyin-miniapp/materials/${result.note_id}`);
        router.refresh();
      }
    } catch (submitError) {
      setError(submitError instanceof z.ZodError
        ? submitError.issues[0]?.message || "资料内容未通过校验"
        : getMaterialNoteErrorMessage(
          submitError,
          isExisting ? "保存新版本失败" : "创建资料失败",
        ));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!canManage ? <StatusAlert tone="warning" title="只读模式">
        当前账号缺少 douyin_material_note.manage 权限，不能创建新版本。
      </StatusAlert> : null}
      {error ? <StatusAlert>{error}</StatusAlert> : null}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>{isExisting ? "创建新版本" : "新建资料"}</CardTitle>
            <CardDescription>
              {isExisting
                ? "保存会追加不可变版本，不会修改历史版本或自动替换已发布内容。"
                : "一次提交会同时创建资料和不可变版本 1，创建后即可选择发布。"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-6" onSubmit={submit}>
              <section className="flex flex-col gap-4" aria-labelledby="material-basic-heading">
                <h2 id="material-basic-heading" className="text-base font-semibold">基础信息</h2>
                <FieldGroup className="grid gap-4 md:grid-cols-2">
                  <Field className="md:col-span-2"><FieldLabel htmlFor="material-title">标题</FieldLabel>
                    <Input id="material-title" value={draft.title} maxLength={300} disabled={pending || !canManage} onChange={(event) => setField("title", event.target.value)} />
                    <FieldDescription>1～300 个字符。</FieldDescription>
                  </Field>
                  <Field><FieldLabel htmlFor="material-category">分类</FieldLabel>
                    <Input id="material-category" value={draft.category} maxLength={100} disabled={pending || !canManage} onChange={(event) => setField("category", event.target.value)} />
                  </Field>
                  <Field><FieldLabel htmlFor="material-applicable">适用场景</FieldLabel>
                    <Input id="material-applicable" value={draft.applicable_to ?? ""} maxLength={300} disabled={pending || !canManage} onChange={(event) => setField("applicable_to", event.target.value || null)} />
                  </Field>
                  <Field className="md:col-span-2"><FieldLabel htmlFor="material-summary">摘要</FieldLabel>
                    <Textarea id="material-summary" rows={4} value={draft.summary} maxLength={1_000} disabled={pending || !canManage} onChange={(event) => setField("summary", event.target.value)} />
                    <FieldDescription>摘要会在领取前公开展示，请勿写入只应领取后查看的正文。</FieldDescription>
                  </Field>
                </FieldGroup>
              </section>
              <Separator />
              <section className="flex flex-col gap-4" aria-labelledby="material-content-heading">
                <div><h2 id="material-content-heading" className="text-base font-semibold">正文内容</h2>
                  <p className="mt-1 text-sm text-muted-foreground">仅支持标题、段落、列表、引用和提示块，不接受图片、HTML 或外部链接。</p>
                </div>
                <Field><SiteContentBlockEditor
                  blocks={draft.content_blocks}
                  allowedTypes={MATERIAL_NOTE_ALLOWED_BLOCK_TYPES}
                  disabled={pending || !canManage}
                  onChange={updateBlocks}
                /><FieldError /></Field>
              </section>
              <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">服务端会再次按资料窄 Schema 校验全部字段。</p>
                <Button type="submit" disabled={pending || !canManage}>
                  {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}
                  {isExisting ? "保存新版本" : "创建资料和版本 1"}
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
  return <Alert><AlertTitle>{block.title}</AlertTitle><AlertDescription>{block.text}</AlertDescription></Alert>;
}
