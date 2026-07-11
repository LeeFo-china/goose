"use client";

import { useState } from "react";
import type { SiteContentDraftBlock } from "@gooes/domain";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

import { FormSelect } from "@/components/admin/form-select";
import { SiteContentBlockFields } from "@/components/site-content/site-content-block-fields";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";

const blockLabels: Record<SiteContentDraftBlock["type"], string> = {
  "paragraph": "正文",
  "heading": "标题",
  "image": "图片",
  "quote": "引用",
  "list": "列表",
  "callout": "提示块",
  "metrics": "指标",
  "gallery": "画廊",
};

const blockOptions = Object.entries(blockLabels).map(([value, label]) => ({ value, label }));

export function createEmptySiteContentBlock(type: SiteContentDraftBlock["type"]): SiteContentDraftBlock {
  switch (type) {
    case "paragraph": return { type, text: "" };
    case "heading": return { type, level: 2, text: "" };
    case "image": return { type, fileId: "", alt: "" };
    case "quote": return { type, text: "", attribution: "" };
    case "list": return { type, style: "unordered", items: [""] };
    case "callout": return { type, tone: "info", title: "", text: "" };
    case "metrics": return { type, items: [{ label: "", value: "" }] };
    case "gallery": return { type, images: [{ fileId: "", alt: "" }] };
  }
}

export function SiteContentBlockEditor({
  blocks,
  disabled,
  onChange,
}: {
  blocks: SiteContentDraftBlock[];
  disabled?: boolean;
  onChange: (blocks: SiteContentDraftBlock[]) => void;
}) {
  const [nextType, setNextType] = useState<SiteContentDraftBlock["type"]>("paragraph");
  const [openItems, setOpenItems] = useState(() => new Set<number>([0]));

  function replace(index: number, block: SiteContentDraftBlock) {
    onChange(blocks.map((item, itemIndex) => itemIndex === index ? block : item));
  }

  function move(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  }

  function add() {
    const nextIndex = blocks.length;
    onChange([...blocks, createEmptySiteContentBlock(nextType)]);
    setOpenItems((current) => new Set(current).add(nextIndex));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="w-full sm:max-w-xs">
          <label className="mb-2 block text-sm font-medium" htmlFor="site-content-next-block">内容块类型</label>
          <FormSelect id="site-content-next-block" value={nextType} options={blockOptions} disabled={disabled} onChange={(value) => setNextType(value as SiteContentDraftBlock["type"])} />
        </div>
        <Button type="button" variant="outline" disabled={disabled} onClick={add}>
          <Plus data-icon="inline-start" />
          添加内容块
        </Button>
      </div>

      {blocks.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>还没有内容块</EmptyTitle>
            <EmptyDescription>选择一种内容块并添加，页面不会接受任意 HTML。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      <div className="flex flex-col gap-3">
        {blocks.map((block, index) => {
          const isOpen = openItems.has(index);
          return (
            <Collapsible key={`${block.type}-${index}`} open={isOpen} onOpenChange={(open) => setOpenItems((current) => {
              const next = new Set(current);
              if (open) next.add(index); else next.delete(index);
              return next;
            })}>
              <div className="rounded-md border bg-background">
                <div className="flex min-w-0 items-center gap-2 px-3 py-2">
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant="ghost" className="min-w-0 flex-1 justify-start" aria-label={`${isOpen ? "收起" : "展开"}${blockLabels[block.type]}`}>
                      {isOpen ? <ChevronUp data-icon="inline-start" /> : <ChevronDown data-icon="inline-start" />}
                      <span className="truncate">{index + 1}. {blockLabels[block.type]}</span>
                    </Button>
                  </CollapsibleTrigger>
                  <Button type="button" variant="ghost" size="icon" disabled={disabled || index === 0} aria-label="上移内容块" onClick={() => move(index, -1)}><ChevronUp /></Button>
                  <Button type="button" variant="ghost" size="icon" disabled={disabled || index === blocks.length - 1} aria-label="下移内容块" onClick={() => move(index, 1)}><ChevronDown /></Button>
                  <Button type="button" variant="ghost" size="icon" disabled={disabled} aria-label="删除内容块" onClick={() => onChange(blocks.filter((_, itemIndex) => itemIndex !== index))}><Trash2 /></Button>
                </div>
                <CollapsibleContent>
                  <Separator />
                  <div className="p-4">
                    <SiteContentBlockFields id={`site-content-block-${index}`} block={block} disabled={disabled} onChange={(nextBlock) => replace(index, nextBlock)} />
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
