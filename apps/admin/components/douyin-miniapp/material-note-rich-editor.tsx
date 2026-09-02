"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { DouyinMaterialNoteBlock } from "@gooes/domain";
import Image from "@tiptap/extension-image";
import StarterKit from "@tiptap/starter-kit";
import {
  EditorContent,
  Node,
  mergeAttributes,
  useEditor,
  type JSONContent,
} from "@tiptap/react";
import { Heading2, Heading3, ImagePlus, Loader2, List, ListOrdered, Quote, Trash2 } from "lucide-react";

import {
  buildMaterialNoteImagePreviewUrl,
  materialNoteBlocksToTiptapDoc,
  removeMaterialNoteImageBlock,
  tiptapDocToMaterialNoteBlocks,
} from "@/components/douyin-miniapp/material-note-rich-editor-adapter";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { buildUploadPreviewUrl, uploadDirectToCos, validateUploadFile } from "@/lib/cos-direct-upload";
import { cn } from "@/lib/utils";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const MaterialImage = Image.extend({
  name: "materialImage",
  group: "block",
  inline: false,
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
}).configure({
  allowBase64: false,
  HTMLAttributes: {
    class: "max-h-72 rounded-md border object-contain",
  },
});

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

  function updateImage(index: number, patch: Partial<Extract<DouyinMaterialNoteBlock, { type: "image" }>>) {
    emit(blocks.map((block, blockIndex) =>
      blockIndex === index && block.type === "image"
        ? { ...block, ...patch }
        : block));
  }

  function removeImage(index: number) {
    emit(removeMaterialNoteImageBlock(blocks, index));
  }

  async function handleFile(file: File | undefined) {
    if (!file || !editor) return;
    setUploadError("");
    setUploading(true);
    onUploadStateChange?.(true);
    try {
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
      const src = result.publicUrl || result.url || buildUploadPreviewUrl(result.storagePath);
      setImagePreviews((current) => ({ ...current, [result.fileId!]: src }));
      const alt = file.name.replace(/\.[^.]+$/, "") || "资料图片";
      editor.chain().focus().insertContent({
        type: "materialImage",
        attrs: { fileId: result.fileId, src, alt, caption: "" },
      }).run();
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
      <div className="flex flex-wrap gap-2 rounded-md border bg-muted/30 p-2">
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
        <FieldGroup className="rounded-md border bg-muted/20 p-3">
          <FieldDescription>图片只保存文件 ID、替代文本和图片说明；小程序展示 URL 由 API 下发。</FieldDescription>
          {imageBlocks.map(({ block, index }) => (
            <div key={`${block.fileId}-${index}`} className="grid gap-3 rounded-md border bg-background p-3 md:grid-cols-2">
              <div className="space-y-3">
                <div className="overflow-hidden rounded-md border bg-muted/30">
                  <img
                    src={buildMaterialNoteImagePreviewUrl(block.fileId, imagePreviews)}
                    alt={block.alt || "资料图片预览"}
                    className="h-36 w-full object-contain"
                  />
                </div>
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
              <div className="grid gap-3">
                <Field>
                  <FieldLabel htmlFor={`material-image-alt-${index}`}>图片替代文本</FieldLabel>
                  <Input
                    id={`material-image-alt-${index}`}
                    value={block.alt}
                    disabled={disabled}
                    maxLength={300}
                    onChange={(event) => updateImage(index, { alt: event.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`material-image-caption-${index}`}>图片说明</FieldLabel>
                  <Textarea
                    id={`material-image-caption-${index}`}
                    value={block.caption ?? ""}
                    disabled={disabled}
                    maxLength={1_000}
                    rows={2}
                    onChange={(event) => updateImage(index, { caption: event.target.value || undefined })}
                  />
                </Field>
              </div>
            </div>
          ))}
        </FieldGroup>
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
