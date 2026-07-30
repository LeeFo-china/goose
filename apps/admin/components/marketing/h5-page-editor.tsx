"use client";

import { ArrowLeft, Copy, ExternalLink, Loader2, Plus, Save, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  H5PageEditorPage,
  H5PageEditorVersion,
} from "@/components/marketing/h5-page-editor-types";
import { blockAiFieldSchema, blockLabel, H5_MARKETING_RETURN_HREF, moduleTemplates } from "@/components/marketing/h5-page-editor-types";
import { useH5PageEditorState } from "@/components/marketing/h5-page-editor-state";
import { FloatingPhonePreview, PreviewBlock } from "@/components/marketing/h5-page-editor-preview";
import { PropertyPanel } from "@/components/marketing/h5-page-editor-property-panel";

export type { H5PageConfig } from "@/components/marketing/h5-page-editor-types";

export function H5PageEditor({
  page,
  draftVersion,
  returnHref = H5_MARKETING_RETURN_HREF,
  apiBasePath = "/marketing-pages",
  tenantSlug,
}: {
  page: H5PageEditorPage;
  draftVersion: H5PageEditorVersion;
  returnHref?: string;
  apiBasePath?: string;
  tenantSlug?: string | null;
}) {
  const editor = useH5PageEditorState({
    page,
    draftVersion,
    returnHref,
    apiBasePath,
    tenantSlug,
  });
  const selectedBlock = editor.selectedBlock;
  const aiTargetBlock = editor.aiTargetBlock;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pb-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <Button type="button" variant="ghost" className="mb-2 px-0" onClick={editor.goBack}>
            <ArrowLeft data-icon="inline-start" />
            返回营销活动
          </Button>
          <h1 className="text-2xl font-semibold tracking-normal">{page.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{editor.pageUrl}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => window.open(editor.pageUrl, "_blank")}>
            <ExternalLink data-icon="inline-start" />
            预览
          </Button>
          <Button type="button" variant="outline" disabled={editor.pending} onClick={editor.saveDraft}>
            {editor.pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}
            保存草稿
          </Button>
          <Button type="button" disabled={editor.pending} onClick={editor.publishPage}>
            {editor.pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Send data-icon="inline-start" />}
            发布
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[260px_minmax(360px,1fr)_340px]">
        <aside className="rounded-md border bg-background p-4">
          <div className="text-sm font-medium">模块库</div>
          <div className="mt-3 flex flex-col gap-2">
            {moduleTemplates.map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.type}
                  type="button"
                  variant="outline"
                  className="h-auto w-full items-start justify-start gap-3 p-3 text-left font-normal"
                  onClick={() => editor.addBlock(item.type)}
                >
                  <Icon className="mt-0.5 text-muted-foreground" data-icon="inline-start" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{item.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.description}</span>
                  </span>
                  <Plus className="ml-auto text-muted-foreground" data-icon="inline-end" />
                </Button>
              );
            })}
          </div>
        </aside>

        <section className="rounded-md border bg-muted/30 p-4">
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <Field>
              <FieldLabel>页面标题</FieldLabel>
              <Input value={editor.config.title || ""} onChange={(event) => editor.updateConfig({ title: event.target.value })} />
            </Field>
            <Field>
              <FieldLabel>主色</FieldLabel>
              <Input
                type="color"
                value={editor.config.theme?.primaryColor || "#0f766e"}
                onChange={(event) => editor.updateConfig({
                  theme: { ...editor.config.theme, primaryColor: event.target.value },
                })}
              />
            </Field>
            <Field>
              <FieldLabel>背景色</FieldLabel>
              <Input
                type="color"
                value={editor.config.theme?.backgroundColor || "#f7f3ea"}
                onChange={(event) => editor.updateConfig({
                  theme: { ...editor.config.theme, backgroundColor: event.target.value },
                })}
              />
            </Field>
          </div>

          <div
            ref={editor.phoneFrameRef}
            className="relative mx-auto min-h-[680px] w-full max-w-[390px] overflow-hidden rounded-[24px] border bg-background p-3 shadow-sm"
          >
            <div className="mb-3 h-5 rounded-full bg-muted" />
            <div className="flex min-h-[620px] flex-col gap-3 rounded-md bg-muted/40 p-2">
              {editor.normalBlocks.length ? editor.normalBlocks.map((block) => (
                <PreviewBlock
                  key={block.id}
                  block={block}
                  selected={block.id === editor.selectedBlockId}
                  onSelect={() => editor.setSelectedBlockId(block.id)}
                  onMoveUp={() => editor.moveBlock(block.id, -1)}
                  onMoveDown={() => editor.moveBlock(block.id, 1)}
                  onDelete={() => editor.deleteBlock(block.id)}
                  onDragStart={() => editor.setDragBlockId(block.id)}
                  onDrop={() => editor.dropBlock(block.id)}
                />
              )) : (
                <div className="grid min-h-[360px] place-items-center rounded-md border border-dashed bg-background p-8 text-center text-sm text-muted-foreground">
                  从左侧添加模块开始搭建页面
                </div>
              )}
            </div>
            {editor.floatingBlocks.map((block) => (
              <FloatingPhonePreview
                key={block.id}
                block={block}
                phoneFrameRef={editor.phoneFrameRef}
                selected={block.id === editor.selectedBlockId}
                onSelect={() => editor.setSelectedBlockId(block.id)}
                onChange={(props) => editor.updateBlockProps(block.id, props)}
              />
            ))}
          </div>
        </section>

        <aside className="rounded-md border bg-background p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="text-sm font-medium">属性面板</div>
            {selectedBlock ? (
              <Button type="button" variant="outline" size="sm" onClick={() => editor.duplicateBlock(selectedBlock.id)}>
                <Copy data-icon="inline-start" />
                复制
              </Button>
            ) : null}
          </div>
          <PropertyPanel
            block={editor.selectedBlock}
            aiPending={editor.aiPending && editor.aiTargetBlockId === editor.selectedBlock?.id}
            onChange={(props) => {
              if (selectedBlock) editor.updateBlockProps(selectedBlock.id, props);
            }}
            onAiFill={editor.openAiFillDialog}
          />
        </aside>
      </div>

      <Dialog open={editor.aiDialogOpen} onOpenChange={editor.closeAiDialog}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader>
            <DialogTitle>AI 填写模块内容</DialogTitle>
            <DialogDescription>
              AI 会读取当前页面和模块上下文，只回填文案字段。图片、电话、链接和发布状态不会自动修改。
            </DialogDescription>
          </DialogHeader>

          {aiTargetBlock ? (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div className="font-medium">{blockLabel[aiTargetBlock.type]}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  可填写字段：{Object.values(blockAiFieldSchema[aiTargetBlock.type] || {}).map((field) => field.label).join("、") || "无"}
                </div>
              </div>

              <Field>
                <FieldLabel>补充要求</FieldLabel>
                <Textarea
                  value={editor.aiInstruction}
                  placeholder="例如：突出五一活动、强调免费量房、语气更克制专业"
                  rows={3}
                  onChange={(event) => editor.setAiInstruction(event.target.value)}
                />
                <FieldDescription>
                  可留空。生成后需要点击“应用回填”，不会直接保存或发布。
                </FieldDescription>
              </Field>

              {editor.aiPatch ? (
                <div className="space-y-2 rounded-md border bg-background p-3">
                  <div className="text-sm font-medium">建议回填内容</div>
                  {Object.entries(editor.aiPatch).map(([key, value]) => {
                    const field = blockAiFieldSchema[aiTargetBlock.type]?.[key];
                    return (
                      <div key={key} className="rounded-md bg-muted/40 px-3 py-2">
                        <div className="text-xs text-muted-foreground">{field?.label || key}</div>
                        <div className="mt-1 whitespace-pre-wrap text-sm leading-6">{value}</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                  点击生成后，这里会展示 AI 建议内容。
                </div>
              )}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => editor.setAiDialogOpen(false)}>
              取消
            </Button>
            <Button type="button" variant="outline" disabled={editor.aiPending || !editor.aiTargetBlock} onClick={() => void editor.generateAiPatch()}>
              {editor.aiPending ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <Sparkles data-icon="inline-start" />
              )}
              生成建议
            </Button>
            <Button type="button" disabled={!editor.aiPatch || editor.aiPending} onClick={editor.applyAiPatch}>
              应用回填
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
