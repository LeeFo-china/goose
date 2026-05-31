"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowUp, Copy, ExternalLink, GripVertical, Layers, Loader2, Megaphone, MousePointerClick, Plus, Save, Send, Sparkles, Trash2, Type } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  AiFillBlockResponse,
  H5Block,
  H5BlockType,
  H5PageConfig,
  H5PageEditorPage,
  H5PageEditorVersion,
} from "@/components/marketing/h5-page-editor-types";
import { blockAiFieldSchema, blockLabel, H5_MARKETING_RETURN_HREF, moduleTemplates } from "@/components/marketing/h5-page-editor-types";
import { getH5BaseUrl, requestEditor } from "@/components/marketing/h5-page-editor-api";
import { createBlock, createBlockId, moveItem, normalizeBlock, normalizeConfig } from "@/components/marketing/h5-page-editor-block-utils";
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
  const router = useRouter();
  const [config, setConfig] = useState(() => normalizeConfig(draftVersion.config, page));
  const [selectedBlockId, setSelectedBlockId] = useState(config.blocks[0]?.id || "");
  const [dragBlockId, setDragBlockId] = useState("");
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiTargetBlockId, setAiTargetBlockId] = useState("");
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiPatch, setAiPatch] = useState<Record<string, string> | null>(null);
  const [aiPending, setAiPending] = useState(false);
  const phoneFrameRef = useRef<HTMLDivElement | null>(null);
  const [pending, startTransition] = useTransition();
  const selectedBlock = useMemo(
    () => config.blocks.find((block) => block.id === selectedBlockId) || null,
    [config.blocks, selectedBlockId],
  );
  const aiTargetBlock = useMemo(
    () => config.blocks.find((block) => block.id === aiTargetBlockId) || null,
    [config.blocks, aiTargetBlockId],
  );
  const pageUrl = tenantSlug
    ? `${getH5BaseUrl()}/t/${encodeURIComponent(tenantSlug)}/p/${encodeURIComponent(page.slug)}`
    : `${getH5BaseUrl()}/p/${encodeURIComponent(page.slug)}`;
  const normalBlocks = config.blocks.filter((block) => block.type !== "floating_phone_cta");
  const floatingBlocks = config.blocks.filter((block) => block.type === "floating_phone_cta");

  function updateConfig(next: Partial<H5PageConfig>) {
    setConfig((current) => ({ ...current, ...next }));
  }

  function addBlock(type: H5BlockType) {
    const block = createBlock(type);
    setConfig((current) => ({
      ...current,
      blocks: [...current.blocks, block],
    }));
    setSelectedBlockId(block.id);
  }

  function updateBlockProps(blockId: string, props: Record<string, unknown>) {
    setConfig((current) => ({
      ...current,
      blocks: current.blocks.map((block) =>
        block.id === blockId ? normalizeBlock({ ...block, props }) : block
      ),
    }));
  }

  function duplicateBlock(blockId: string) {
    const target = config.blocks.find((block) => block.id === blockId);
    if (!target) return;
    const copy = {
      ...target,
      id: createBlockId(target.type),
      props: { ...target.props },
    };
    const index = config.blocks.findIndex((block) => block.id === blockId);
    setConfig((current) => ({
      ...current,
      blocks: [
        ...current.blocks.slice(0, index + 1),
        copy,
        ...current.blocks.slice(index + 1),
      ],
    }));
    setSelectedBlockId(copy.id);
  }

  function deleteBlock(blockId: string) {
    setConfig((current) => {
      const nextBlocks = current.blocks.filter((block) => block.id !== blockId);
      if (selectedBlockId === blockId) {
        setSelectedBlockId(nextBlocks[0]?.id || "");
      }
      return { ...current, blocks: nextBlocks };
    });
  }

  function moveBlock(blockId: string, direction: -1 | 1) {
    const index = config.blocks.findIndex((block) => block.id === blockId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= config.blocks.length) return;
    setConfig((current) => ({
      ...current,
      blocks: moveItem(current.blocks, index, nextIndex),
    }));
  }

  function dropBlock(targetBlockId: string) {
    if (!dragBlockId || dragBlockId === targetBlockId) return;
    const fromIndex = config.blocks.findIndex((block) => block.id === dragBlockId);
    const toIndex = config.blocks.findIndex((block) => block.id === targetBlockId);
    if (fromIndex < 0 || toIndex < 0) return;
    setConfig((current) => ({
      ...current,
      blocks: moveItem(current.blocks, fromIndex, toIndex),
    }));
    setDragBlockId("");
  }

  function openAiFillDialog(block: H5Block) {
    setAiTargetBlockId(block.id);
    setAiPatch(null);
    setAiInstruction("");
    setAiDialogOpen(true);
  }

  async function generateAiPatch() {
    if (!aiTargetBlock) return;
    const fieldSchema = blockAiFieldSchema[aiTargetBlock.type] || {};
    if (Object.keys(fieldSchema).length === 0) {
      toast.error("当前模块暂无可由 AI 填写的字段");
      return;
    }

    setAiPending(true);
    setAiPatch(null);
    try {
      const data = await requestEditor<AiFillBlockResponse>({
        path: `${apiBasePath}/${page.id}/ai-fill-block`,
        method: "POST",
        payload: {
          page: {
            id: page.id,
            title: page.title,
            slug: page.slug,
            status: page.status,
          },
          config: normalizeConfig(config, page),
          block: aiTargetBlock,
          field_schema: fieldSchema,
          instruction: aiInstruction,
        },
      });
      setAiPatch(data.patch);
      toast.success("AI 已生成建议内容");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI 填写失败");
    } finally {
      setAiPending(false);
    }
  }

  function applyAiPatch() {
    if (!aiTargetBlock || !aiPatch) return;
    const currentBlock = config.blocks.find((block) => block.id === aiTargetBlock.id);
    if (!currentBlock) return;
    updateBlockProps(currentBlock.id, {
      ...currentBlock.props,
      ...aiPatch,
    });
    setSelectedBlockId(currentBlock.id);
    setAiDialogOpen(false);
    toast.success("AI 内容已回填，保存草稿后生效");
  }

  function saveDraft() {
    startTransition(async () => {
      try {
        const normalizedConfig = normalizeConfig(config, page);
        setConfig(normalizedConfig);
        await requestEditor({
          path: `${apiBasePath}/${page.id}/draft`,
          method: "PUT",
          payload: { config: normalizedConfig },
        });
        toast.success("草稿已保存");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "保存失败");
      }
    });
  }

  function publishPage() {
    startTransition(async () => {
      try {
        const normalizedConfig = normalizeConfig(config, page);
        setConfig(normalizedConfig);
        await requestEditor({
          path: `${apiBasePath}/${page.id}/draft`,
          method: "PUT",
          payload: { config: normalizedConfig },
        });
        await requestEditor({
          path: `${apiBasePath}/${page.id}/publish`,
          method: "POST",
        });
        toast.success("H5 活动页已发布");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "发布失败");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <Button type="button" variant="ghost" className="mb-2 px-0" onClick={() => router.push(returnHref)}>
            <ArrowLeft data-icon="inline-start" />
            返回营销活动
          </Button>
          <h1 className="text-2xl font-semibold tracking-normal">{page.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{pageUrl}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => window.open(pageUrl, "_blank")}>
            <ExternalLink data-icon="inline-start" />
            预览
          </Button>
          <Button type="button" variant="outline" disabled={pending} onClick={saveDraft}>
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}
            保存草稿
          </Button>
          <Button type="button" disabled={pending} onClick={publishPage}>
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Send data-icon="inline-start" />}
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
                  onClick={() => addBlock(item.type)}
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
              <Input value={config.title || ""} onChange={(event) => updateConfig({ title: event.target.value })} />
            </Field>
            <Field>
              <FieldLabel>主色</FieldLabel>
              <Input
                type="color"
                value={config.theme?.primaryColor || "#0f766e"}
                onChange={(event) => updateConfig({
                  theme: { ...config.theme, primaryColor: event.target.value },
                })}
              />
            </Field>
            <Field>
              <FieldLabel>背景色</FieldLabel>
              <Input
                type="color"
                value={config.theme?.backgroundColor || "#f7f3ea"}
                onChange={(event) => updateConfig({
                  theme: { ...config.theme, backgroundColor: event.target.value },
                })}
              />
            </Field>
          </div>

          <div
            ref={phoneFrameRef}
            className="relative mx-auto min-h-[680px] w-full max-w-[390px] overflow-hidden rounded-[24px] border bg-background p-3 shadow-sm"
          >
            <div className="mb-3 h-5 rounded-full bg-muted" />
            <div className="flex min-h-[620px] flex-col gap-3 rounded-md bg-muted/40 p-2">
              {normalBlocks.length ? normalBlocks.map((block) => (
                <PreviewBlock
                  key={block.id}
                  block={block}
                  selected={block.id === selectedBlockId}
                  onSelect={() => setSelectedBlockId(block.id)}
                  onMoveUp={() => moveBlock(block.id, -1)}
                  onMoveDown={() => moveBlock(block.id, 1)}
                  onDelete={() => deleteBlock(block.id)}
                  onDragStart={() => setDragBlockId(block.id)}
                  onDrop={() => dropBlock(block.id)}
                />
              )) : (
                <div className="grid min-h-[360px] place-items-center rounded-md border border-dashed bg-background p-8 text-center text-sm text-muted-foreground">
                  从左侧添加模块开始搭建页面
                </div>
              )}
            </div>
            {floatingBlocks.map((block) => (
              <FloatingPhonePreview
                key={block.id}
                block={block}
                phoneFrameRef={phoneFrameRef}
                selected={block.id === selectedBlockId}
                onSelect={() => setSelectedBlockId(block.id)}
                onChange={(props) => updateBlockProps(block.id, props)}
              />
            ))}
          </div>
        </section>

        <aside className="rounded-md border bg-background p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="text-sm font-medium">属性面板</div>
            {selectedBlock ? (
              <Button type="button" variant="outline" size="sm" onClick={() => duplicateBlock(selectedBlock.id)}>
                <Copy data-icon="inline-start" />
                复制
              </Button>
            ) : null}
          </div>
          <PropertyPanel
            block={selectedBlock}
            aiPending={aiPending && aiTargetBlockId === selectedBlock?.id}
            onChange={(props) => {
              if (selectedBlock) updateBlockProps(selectedBlock.id, props);
            }}
            onAiFill={openAiFillDialog}
          />
        </aside>
      </div>

      <Dialog open={aiDialogOpen} onOpenChange={(open) => {
        setAiDialogOpen(open);
        if (!open) {
          setAiPatch(null);
          setAiPending(false);
        }
      }}>
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
                  value={aiInstruction}
                  placeholder="例如：突出五一活动、强调免费量房、语气更克制专业"
                  rows={3}
                  onChange={(event) => setAiInstruction(event.target.value)}
                />
                <FieldDescription>
                  可留空。生成后需要点击“应用回填”，不会直接保存或发布。
                </FieldDescription>
              </Field>

              {aiPatch ? (
                <div className="space-y-2 rounded-md border bg-background p-3">
                  <div className="text-sm font-medium">建议回填内容</div>
                  {Object.entries(aiPatch).map(([key, value]) => {
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
            <Button type="button" variant="outline" onClick={() => setAiDialogOpen(false)}>
              取消
            </Button>
            <Button type="button" variant="outline" disabled={aiPending || !aiTargetBlock} onClick={() => void generateAiPatch()}>
              {aiPending ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <Sparkles data-icon="inline-start" />
              )}
              生成建议
            </Button>
            <Button type="button" disabled={!aiPatch || aiPending} onClick={applyAiPatch}>
              应用回填
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
