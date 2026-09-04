"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { DouyinMaterialNoteBlock } from "@gooes/domain";
import Image from "@tiptap/extension-image";
import StarterKit from "@tiptap/starter-kit";
import {
  EditorContent,
  Node,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  mergeAttributes,
  useEditor,
  type JSONContent,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { GripVertical, Heading2, Heading3, ImagePlus, Loader2, List, ListOrdered, Quote, Trash2 } from "lucide-react";

import {
  buildMaterialNoteImagePreviewUrl,
  materialNoteBlocksToTiptapDoc,
  removeMaterialNoteImageBlock,
  tiptapDocToMaterialNoteBlocks,
} from "@/components/douyin-miniapp/material-note-rich-editor-adapter";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import { buildUploadPreviewUrl, uploadDirectToCos, validateUploadFile } from "@/lib/cos-direct-upload";
import { cn } from "@/lib/utils";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const MaterialImage = Image.extend({
  name: "materialImage",
  group: "block",
  inline: false,
  draggable: true,
  addAttributes() {
    return {
      ...this.parent?.(),
      fileId: {
        default: "",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-file-id") ?? "",
        renderHTML: (attributes: Record<string, unknown>) =>
          typeof attributes.fileId === "string" && attributes.fileId
            ? { "data-file-id": attributes.fileId }
            : {},
      },
      caption: {
        default: "",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-caption") ?? "",
        renderHTML: (attributes: Record<string, unknown>) =>
          typeof attributes.caption === "string" && attributes.caption
            ? { "data-caption": attributes.caption }
            : {},
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    return ["figure", mergeAttributes(HTMLAttributes, {
      class: "material-note-editor-image",
    }), ["img", {
      src: HTMLAttributes.src || "",
      alt: HTMLAttributes.alt || "",
    }], ["figcaption", {}, HTMLAttributes.caption || ""]];
  },
  addNodeView() {
    return ReactNodeViewRenderer(MaterialImageNodeView);
  },
}).configure({
  allowBase64: false,
  HTMLAttributes: {
    class: "max-h-72 rounded-md border object-contain",
  },
});

function MaterialImageNodeView({
  deleteNode,
  node,
  selected,
}: ReactNodeViewProps) {
  const src = readNodeStringAttr(node.attrs, "src");
  const alt = readNodeStringAttr(node.attrs, "alt") || "资料图片";
  const caption = readNodeStringAttr(node.attrs, "caption");

  return (
    <NodeViewWrapper
      as="figure"
      className={cn(
        "group relative my-3 rounded-lg border bg-background p-2 transition",
        "hover:border-primary/40 hover:bg-muted/20",
        selected && "border-primary/60 ring-2 ring-primary/20",
      )}
    >
      <span
        role="button"
        data-drag-handle=""
        draggable
        contentEditable={false}
        aria-label="拖动图片调整位置"
        className={cn(
          "absolute left-2 top-2 z-10 inline-flex h-8 w-8 cursor-grab items-center justify-center rounded-md border bg-background/95 text-muted-foreground shadow-sm",
          "opacity-0 transition hover:text-foreground active:cursor-grabbing group-hover:opacity-100 group-focus-within:opacity-100",
        )}
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </span>
      <button
        type="button"
        contentEditable={false}
        aria-label="删除当前图片"
        className={cn(
          "absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background/95 text-destructive shadow-sm",
          "opacity-0 transition hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100 group-focus-within:opacity-100",
        )}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          deleteNode();
        }}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="max-h-72 w-full rounded-md border object-contain"
      />
      {caption ? (
        <figcaption className="mt-2 text-center text-xs text-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
    </NodeViewWrapper>
  );
}

function readNodeStringAttr(attrs: unknown, key: string): string {
  if (!attrs || typeof attrs !== "object") return "";
  const value = (attrs as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

const MaterialCallout = Node.create({
  name: "materialCallout",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      tone: { default: "info" },
      title: { default: "" },
      text: { default: "" },
    };
  },
  parseHTML() {
    return [{ tag: "section[data-material-callout]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["section", mergeAttributes(HTMLAttributes, {
      "data-material-callout": "true",
      class: "rounded-md border bg-muted/40 px-3 py-2 text-sm",
    }), ["strong", {}, HTMLAttributes.title || "提示"], ["p", {}, HTMLAttributes.text || ""]];
  },
});

const materialNoteEditorExtensions = [
  StarterKit.configure({
    code: false,
    codeBlock: false,
    horizontalRule: false,
    link: false,
    strike: false,
    underline: false,
    heading: { levels: [2, 3] },
  }),
  MaterialImage,
  MaterialCallout,
];

export function MaterialNoteRichEditor({
  blocks,
  disabled,
  onChange,
  onUploadStateChange,
}: {
  blocks: DouyinMaterialNoteBlock[];
  disabled?: boolean;
  onChange: (blocks: DouyinMaterialNoteBlock[]) => void;
  onUploadStateChange?: (uploading: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const latestSerializedBlocksRef = useRef(JSON.stringify(blocks));
  const [imagePreviews, setImagePreviews] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const editor = useEditor({
    extensions: materialNoteEditorExtensions,
    content: materialNoteBlocksToTiptapDoc(blocks, imagePreviews),
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          "min-h-80 rounded-md border bg-background px-4 py-3 text-sm leading-6 outline-none",
          "prose-p:my-2 prose-headings:my-3 prose-blockquote:border-l-2 prose-blockquote:pl-3",
        ),
        "aria-label": "资料笔记富文本正文",
      },
      transformPastedHTML: removePastedImageTags,
      handlePaste: (_view, event) => {
        const imageFiles = extractImageFiles(event.clipboardData?.items, event.clipboardData?.files);
        if (imageFiles.length === 0) return false;
        const hasTextPayload = hasClipboardTextPayload(event.clipboardData);
        if (disabled || uploading) {
          if (!hasTextPayload) event.preventDefault();
          return !hasTextPayload;
        }
        if (!hasTextPayload) event.preventDefault();
        void handleFiles(imageFiles);
        return !hasTextPayload;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const imageFiles = extractImageFiles(event.dataTransfer?.items, event.dataTransfer?.files);
        if (imageFiles.length === 0) return false;
        event.preventDefault();
        if (disabled || uploading) return true;
        const dropPosition = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        })?.pos;
        void handleFiles(imageFiles, dropPosition);
        return true;
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      const nextBlocks = tiptapDocToMaterialNoteBlocks(currentEditor.getJSON());
      latestSerializedBlocksRef.current = JSON.stringify(nextBlocks);
      onChange(nextBlocks);
    },
  });
  const serializedBlocks = JSON.stringify(blocks);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor || latestSerializedBlocksRef.current === serializedBlocks) return;
    latestSerializedBlocksRef.current = serializedBlocks;
    editor.commands.setContent(
      materialNoteBlocksToTiptapDoc(blocks, imagePreviews) as JSONContent,
      { emitUpdate: false },
    );
  }, [blocks, editor, imagePreviews, serializedBlocks]);

  function emit(nextBlocks: DouyinMaterialNoteBlock[]) {
    onChange(nextBlocks);
  }

  function removeImage(index: number) {
    emit(removeMaterialNoteImageBlock(blocks, index));
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    await handleFiles([file]);
  }

  async function handleFiles(files: readonly File[], insertAt?: number) {
    if (files.length === 0 || !editor) return;
    setUploadError("");
    setUploading(true);
    onUploadStateChange?.(true);
    try {
      const imageContents: JSONContent[] = [];
      for (const file of files) {
        validateUploadFile(file, {
          allowedTypes: IMAGE_TYPES,
          maxSizeBytes: IMAGE_MAX_BYTES,
          typeMessage: "仅支持 JPG、PNG 或 WebP 图片",
          sizeMessage: "单张图片不能超过 5MB",
        });
        const result = await uploadDirectToCos(file, {
          scene: "picture_library",
          uploadErrorLabel: "上传资料笔记图片",
          initFallbackMessage: "初始化资料笔记图片直传失败",
          completeFallbackMessage: "登记资料笔记图片失败",
        });
        if (!result.fileId) {
          setUploadError("图片上传成功但未返回文件 ID");
          return;
        }
        const src = result.url || result.publicUrl || buildUploadPreviewUrl(result.storagePath);
        setImagePreviews((current) => ({ ...current, [result.fileId!]: src }));
        const alt = file.name.replace(/\.[^.]+$/, "") || "资料图片";
        imageContents.push({
          type: "materialImage",
          attrs: { fileId: result.fileId, src, alt, caption: "" },
        });
      }
      if (imageContents.length === 0) return;
      if (typeof insertAt === "number") {
        editor.chain().focus().insertContentAt(insertAt, imageContents).run();
      } else {
        editor.chain().focus().insertContent(imageContents).run();
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "上传资料笔记图片失败");
    } finally {
      setUploading(false);
      onUploadStateChange?.(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const imageBlocks = useMemo(() =>
    blocks.map((block, index) => ({ block, index }))
      .filter((item): item is {
        block: Extract<DouyinMaterialNoteBlock, { type: "image" }>;
        index: number;
      } => item.block.type === "image"), [blocks]);

  return (
    <div className="flex flex-col gap-4">
      {uploadError ? <StatusAlert>{uploadError}</StatusAlert> : null}
      <div className="sticky top-0 z-20 flex flex-wrap gap-2 rounded-md border bg-muted/90 p-2 backdrop-blur supports-[backdrop-filter]:bg-muted/80">
        <ToolbarButton disabled={!editor || disabled} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 data-icon="inline-start" />二级标题</ToolbarButton>
        <ToolbarButton disabled={!editor || disabled} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 data-icon="inline-start" />三级标题</ToolbarButton>
        <ToolbarButton disabled={!editor || disabled} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List data-icon="inline-start" />无序列表</ToolbarButton>
        <ToolbarButton disabled={!editor || disabled} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered data-icon="inline-start" />有序列表</ToolbarButton>
        <ToolbarButton disabled={!editor || disabled} onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Quote data-icon="inline-start" />引用</ToolbarButton>
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled || uploading}
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
        <Button type="button" variant="outline" size="sm" disabled={!editor || disabled || uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ImagePlus data-icon="inline-start" />}
          {uploading ? "上传中" : "插入图片"}
        </Button>
      </div>
      <EditorContent editor={editor} />
      {imageBlocks.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-md border bg-muted/20 p-2">
          {imageBlocks.map(({ block, index }) => (
            <div key={`${block.fileId}-${index}`} className="flex items-center gap-3 rounded-md border bg-background p-2">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded border bg-muted/30">
                <img
                  src={buildMaterialNoteImagePreviewUrl(block.fileId, imagePreviews)}
                  alt={block.alt || "资料图片预览"}
                  className="h-full w-full object-cover"
                />
              </div>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {block.alt || "资料图片"}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={disabled}
                onClick={() => removeImage(index)}
              >
                <Trash2 data-icon="inline-start" />
                删除图片
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ToolbarButton({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onClick}>{children}</Button>;
}

function extractImageFiles(
  items?: DataTransferItemList | null,
  files?: FileList | null,
): File[] {
  const itemFiles = Array.from(items ?? [])
    .filter((item) => item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
  if (itemFiles.length > 0) return itemFiles;

  return Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));
}

function hasClipboardTextPayload(data?: DataTransfer | null): boolean {
  if (!data) return false;
  return hasRetainedPasteContent({
    html: data.getData("text/html"),
    plainText: data.getData("text/plain"),
  });
}

export function removePastedImageTags(html: string): string {
  return html.replace(/<img\b[^>]*>/gi, "");
}

export function hasRetainedPasteContent({
  html,
  plainText,
}: {
  html: string;
  plainText: string;
}): boolean {
  const normalizedHtml = html.trim();
  const retainedHtmlText = removePastedImageTags(normalizedHtml)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(meta|link)\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .trim();
  if (retainedHtmlText) return true;

  return !normalizedHtml && Boolean(plainText.trim());
}
