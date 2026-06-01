"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type {
  AiFillBlockResponse,
  H5Block,
  H5BlockType,
  H5PageConfig,
  H5PageEditorPage,
  H5PageEditorVersion,
} from "@/components/marketing/h5-page-editor-types";
import { blockAiFieldSchema } from "@/components/marketing/h5-page-editor-types";
import { getH5BaseUrl, requestEditor } from "@/components/marketing/h5-page-editor-api";
import {
  createBlock,
  createBlockId,
  moveItem,
  normalizeBlock,
  normalizeConfig,
} from "@/components/marketing/h5-page-editor-block-utils";

export function useH5PageEditorState({
  page,
  draftVersion,
  returnHref,
  apiBasePath,
  tenantSlug,
}: {
  page: H5PageEditorPage;
  draftVersion: H5PageEditorVersion;
  returnHref: string;
  apiBasePath: string;
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

  function closeAiDialog(open: boolean) {
    setAiDialogOpen(open);
    if (!open) {
      setAiPatch(null);
      setAiPending(false);
    }
  }

  return {
    addBlock,
    aiDialogOpen,
    aiInstruction,
    aiPatch,
    aiPending,
    aiTargetBlock,
    aiTargetBlockId,
    applyAiPatch,
    closeAiDialog,
    config,
    deleteBlock,
    dropBlock,
    duplicateBlock,
    floatingBlocks,
    generateAiPatch,
    goBack: () => router.push(returnHref),
    moveBlock,
    normalBlocks,
    openAiFillDialog,
    pageUrl,
    pending,
    phoneFrameRef,
    publishPage,
    saveDraft,
    selectedBlock,
    selectedBlockId,
    setAiDialogOpen,
    setAiInstruction,
    setSelectedBlockId,
    setDragBlockId,
    updateBlockProps,
    updateConfig,
  };
}
